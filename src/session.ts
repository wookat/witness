import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { fmt, type Ev } from "./events.js";
import type { Transcript } from "./transcribe.js";
import type { AssocMap } from "./associate.js";
import { rrwebUmd } from "./rr.js";
import { makeAudioSeekable } from "./audio.js";
import { writeIssues } from "./issues.js";
import { readFileSync, readdirSync } from "node:fs";

export interface Meta {
  url: string;
  startedAt: number;
  durationMs: number;
  viewport?: { width: number; height: number };
  title?: string;
}

const esc = (s?: string) => (s ?? "").replace(/</g, "&lt;").slice(0, 400);

// hide static-asset/dev-server network noise; keep docs, xhr/fetch, and failures
const STATIC = /(\.(js|mjs|cjs|css|map|png|jpe?g|gif|svg|ico|webp|avif|woff2?|ttf|otf|mp4|webm|vue|svelte|astro|tsx?|jsx|less|s[ac]ss|styl)(\?|#|\/|$))|node_modules|@vite|@fs|@id|__vite|favicon|plugin-vue/i;
const TRACKER = /googletagmanager\.com|google-analytics\.com|analytics\.google\.com|doubleclick\.net|hotjar\.(com|io)|clarity\.ms|segment\.(com|io)|mixpanel\.com|posthog\.(com|io)|amplitude\.com|fullstory\.com|logrocket\.com|ingest\.sentry\.io|sentry\.io\/api/i;
const noisy = (e: Ev): boolean => {
  if (e.kind === "res") return TRACKER.test(e.url) || (STATIC.test(e.url) && e.status > 0 && e.status < 400);
  if (e.kind === "req") {
    if (TRACKER.test(e.url)) return true;
    const api = e.resType === "xhr" || e.resType === "fetch" || e.resType === "eventsource" || e.resType === "websocket";
    return !api && e.resType !== "document" && STATIC.test(e.url);
  }
  if (e.kind === "console") return e.level === "debug" || e.level === "info";
  return false;
};

function line(e: Ev): string | null {
  switch (e.kind) {
    case "nav": return `- \`${fmt(e.t)}\` **NAV** ${e.url}${e.title ? ` · “${esc(e.title)}”` : ""}`;
    case "click": return `- \`${fmt(e.t)}\` **CLICK** \`${e.sel}\`${e.text ? ` “${esc(e.text)}”` : ""} · @${e.x},${e.y}`;
    case "input": return `- \`${fmt(e.t)}\` **INPUT** \`${e.sel}\` · ${e.masked ? "🔒masked" : `${e.len} chars`}`;
    case "scroll": return `- \`${fmt(e.t)}\` **SCROLL** y=${e.y}`;
    case "key": return `- \`${fmt(e.t)}\` **KEY** ${e.key}${e.sel ? ` on \`${e.sel}\`` : ""}`;
    case "console": return `- \`${fmt(e.t)}\` **CONSOLE ${e.level.toUpperCase()}** ${esc(e.text)}${e.stack ? `\n  \`\`\`\n  ${e.stack.slice(0, 600)}\n  \`\`\`` : ""}`;
    case "error": return `- \`${fmt(e.t)}\` **ERROR** ${esc(e.message)}${e.stack ? `\n  \`\`\`\n  ${e.stack.slice(0, 600)}\n  \`\`\`` : ""}`;
    case "req": return `- \`${fmt(e.t)}\` **NET →** ${e.method} ${e.url} (${e.resType})`;
    case "res": {
      const bad = e.status === 0 || e.status >= 400;
      return `- \`${fmt(e.t)}\` **NET ←** ${e.status === 0 ? "FAILED" : `**${e.status}**`} ${e.url}${e.timing != null ? ` · ${e.timing}ms` : ""}${e.bodyPath ? ` · [body](${e.bodyPath})` : ""}${bad ? " ⚠️" : ""}`;
    }
    case "mark": {
      const comp = e.react?.length ? ` · Comp: \`${e.react.join(" › ")}\`` : "";
      const reg = e.region ? ` · region ${e.region.w}×${e.region.h} @${e.region.x},${e.region.y}` : "";
      const html = e.outerHTML ? `\n  \`${esc(e.outerHTML)}\`` : "";
      return `- \`${fmt(e.t)}\` **MARK** \`${e.sel}\`${comp}${reg}${e.shot ? ` · [shot](${e.shot})` : ""}${html}`;
    }
    case "mut": return `- \`${fmt(e.t)}\` **MUT** \`${e.sel}\` ${esc(e.summary)}${(e as any).n > 1 ? ` ×${(e as any).n}` : ""}`;
    case "dom": return `- \`${fmt(e.t)}\` **DOMSNAP** [html](${e.path})`;
    case "shot": return null; // referenced inline
    case "note": return `- \`${fmt(e.t)}\` _note: ${esc(e.text)}_`;
    case "_ui": return null;
    case "say": return null; // block headers
    default: return null;
  }
}

// interactive events that end a speech run — ambient events (mut/scroll/shot/note/req/res) don't
const RUN_BREAK = new Set(["click", "mark", "nav", "input", "key", "error", "err", "issue"]);
const RUN_GAP = 4000; // silence longer than this also splits a run

type Say = Extract<Ev, { kind: "say" }>;
interface Block { head: string; evs: Ev[]; at?: number; frags?: Say[]; says?: Say[]; issue?: number }

/** group events into blocks anchored at speech runs (consecutive says = one utterance) */
function groupBlocks(events: Ev[]): Block[] {
  const says = events.filter((e): e is Say => e.kind === "say");
  const issues = events.filter((e): e is Extract<Ev, { kind: "issue" }> => e.kind === "issue");
  const blocks: Block[] = [];

  const anchors = [...says.map(s => s.segStart), ...issues.map(i => i.t)].sort((a, b) => a - b);
  const pre = events.filter(e => e.kind !== "say" && e.kind !== "issue" &&
    (anchors.length === 0 || e.t < anchors[0]));
  if (pre.length) blocks.push({ head: "prelude", evs: pre });

  // group consecutive says into runs: split on a >4s gap or a real interaction in between
  const runs: Say[][] = [];
  for (const s of says) {
    const prev = runs.at(-1)?.at(-1);
    const broken = prev && (s.segStart - prev.segEnd >= RUN_GAP ||
      events.some(e => RUN_BREAK.has(e.kind) && e.t > prev.segEnd && e.t < s.segStart));
    if (!prev || broken) runs.push([s]); else runs.at(-1)!.push(s);
  }

  // anchors: say-runs + issue dividers, sorted by time; evidence attaches to say-runs
  type Anchor = { at: number; run?: Say[]; issue?: number };
  const anchors2: Anchor[] = [
    ...runs.map(r => ({ at: r[0].segStart, run: r })),
    ...issues.map(i => ({ at: i.t, issue: i.n })),
  ].sort((a, b) => a.at - b.at);

  for (let i = 0; i < anchors2.length; i++) {
    const a = anchors2[i];
    const next = anchors2[i + 1];
    if (a.issue != null) { blocks.push({ head: "issue", evs: [], at: a.at, issue: a.issue }); continue; }
    const r = a.run!;
    const evs = events.filter(e =>
      e.kind !== "say" && e.kind !== "issue" && e.t >= r[0].segStart - 1500 && (next ? e.t < next.at - 1500 : true)
    );
    blocks.push({
      head: r.length === 1 ? `SAY “${r[0].text}”` : "SAY",
      evs, at: r[0].segStart,
      frags: r.length > 1 ? r : undefined,
      says: r,
    });
  }
  return blocks;
}

// ---- causal burst grouping: a click/Enter opens a burst; the next ~1.8s of
// page consequences (requests, errors, dom changes, nav) belong to it ----
const BURST_MS = 1800;
const BURST_KINDS = new Set(["req", "res", "console", "error", "nav", "mut"]);
const NO_BREAK = new Set(["shot", "note", "scroll", "dom", "_ui"]); // ambient: don't close a burst
const isTrigger = (e: Ev) => e.kind === "click" || (e.kind === "key" && e.key === "Enter");

interface Row { lead: Ev; burst: Ev[] }
function burstRows(evs: Ev[]): Row[] {
  const out: Row[] = [];
  let cur: Row | null = null;
  for (const e of evs) {
    if (isTrigger(e)) { cur = { lead: e, burst: [] }; out.push(cur); continue; }
    if (cur && BURST_KINDS.has(e.kind) && e.t - cur.lead.t <= BURST_MS) { cur.burst.push(e); continue; }
    if (!NO_BREAK.has(e.kind)) cur = null;
    out.push({ lead: e, burst: [] });
  }
  return out;
}

export function renderMarkdown(events: Ev[], meta: Meta, transcript?: Transcript, assoc?: AssocMap): string {
  const blocks = groupBlocks(events);

  const parts: string[] = [
    `# Witness Session — ${new Date(meta.startedAt).toISOString().replace("T", " ").slice(0, 19)}`,
    `- **App:** ${meta.url}${meta.title ? ` · ${meta.title}` : ""}`,
    `- **Duration:** ${fmt(meta.durationMs)}${meta.viewport ? ` · **Viewport:** ${meta.viewport.width}×${meta.viewport.height}` : ""}`,
    `- **Files:** \`events.jsonl\` raw · \`shots/\` · \`bodies/\` · \`audio.webm\` · \`transcript.json\``,
    "",
    "---",
    "",
    "## Timeline",
  ];

  for (const b of blocks) {
    if (b.issue != null) { parts.push("", `### ${fmt(b.at ?? 0)} · ⏺ ISSUE #${b.issue}`); continue; }
    parts.push("", `### ${b.head === "prelude" ? "00:00 · prelude" : `${fmt((b.at ?? b.evs[0]?.t ?? 0))} · ${b.head}`}`);
    if (b.frags) parts.push(...b.frags.map(f => `> [\`${fmt(f.segStart)}\`] “${esc(f.text)}”`));
    // LLM evidence-pick: if this block's says have associations, show only
    // those events; everything else folds into a count line (raw still in jsonl)
    const saysIn = b.says ?? [];
    const hits = new Set<Ev>();
    const titles: string[] = [];
    for (const s of saysIn) {
      const a = assoc?.get(s);
      if (a?.title) titles.push(a.title);
      a?.hits.forEach(h => hits.add(h));
    }
    const useAssoc = assoc != null && saysIn.some(s => assoc.has(s));
    const uniqTitles = [...new Set(titles)];
    if (uniqTitles.length) parts.push(`**→ ${uniqTitles.join(" · ")}**`);
    const vis = b.evs.filter(e => !noisy(e))
      .filter((e, i, a) => !(e.kind === "nav" && a[i - 1]?.kind === "nav" && (a[i - 1] as any).url === e.url))
      .filter(e => !useAssoc || e.kind === "say" || hits.has(e));
    const hidden = b.evs.length - vis.length;
    const lines: string[] = [];
    for (const r of burstRows(vis)) {
      const l = line(r.lead);
      if (l) lines.push(l);
      if (!r.burst.length && isTrigger(r.lead))
        lines.push(`  - _（点击后 ${BURST_MS / 1000}s 内页面无任何反应——这本身就是证据）_`);
      for (const be of r.burst.slice(0, 8)) {
        const bl = line(be);
        if (bl) lines.push("  " + bl.replace(/\n/g, "\n  "));
      }
      if (r.burst.length > 8) lines.push(`  - _… +${r.burst.length - 8} more in burst — see events.jsonl_`);
    }
    if (hidden > 0) lines.push(`- _… ${hidden} ${useAssoc ? "other" : "static-asset/dev"} events hidden — see events.jsonl_`);
    parts.push(...(lines.length ? lines : ["- _(no recorded activity)_"]));
  }

  if (transcript?.text) {
    parts.push("", "---", "", "## Transcript", "", transcript.text, "");
  }

  return parts.join("\n");
}

/** Human-facing reviewer: Voicetrail-style — replay stage + event-tick timeline + tabbed panel. Agents use session.md instead. */
export function renderReviewHtml(events: Ev[], meta: Meta, rrJsonl?: string, prompt?: string): string {
  const rrSrc = rrJsonl?.trim() ? rrwebUmd() : null;
  const rrEmbed = rrSrc
    ? `<script>${rrSrc.replace(/<\/script/gi, "<\\/script")}</script><script>const RRE=[${rrJsonl!.trim().split("\n").join(",").replace(/</g, "\\u003c")}];</script>`
    : "";
  const data = JSON.stringify({
    meta,
    prompt: prompt ?? null,
    blocks: groupBlocks(events).map(b => ({
      head: b.head, at: b.at, issue: b.issue,
      frags: b.frags?.map(f => ({ t: f.segStart, text: f.text })),
      evs: b.evs,
    })),
    evs: events.map(e => (noisy(e) ? { ...e, _q: 1 } : e)),
  }).replace(/</g, "\\u003c");
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Witness · ${meta.url}</title>
<style>
  *{box-sizing:border-box}
  html{-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
  body{margin:0;background:#f6f6f4;color:#1b1e26;font:14px/1.6 -apple-system,"SF Pro Text","Segoe UI","Microsoft YaHei",sans-serif;letter-spacing:.002em}
  ::selection{background:#ffdcc9}
  .sp{flex:1}
  header{position:sticky;top:0;z-index:8;background:rgba(255,255,255,.8);backdrop-filter:saturate(1.5) blur(14px);-webkit-backdrop-filter:saturate(1.5) blur(14px);border-bottom:1px solid rgba(16,18,22,.07);padding:10px 22px;display:flex;gap:16px;align-items:center}
  header .brand{font-weight:800;font-size:15px;letter-spacing:-.02em}
  header .brand .dl{position:relative;display:inline-block}
  header .brand .dl:after{content:"";position:absolute;top:.02em;left:50%;transform:translateX(-50%);width:.24em;height:.24em;border-radius:50%;background:#ff4f00;animation:br 2.6s ease-in-out infinite}
  @keyframes br{0%,100%{opacity:.4}50%{opacity:1}}
  header .u{font-weight:650;font-size:13.5px;max-width:38vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;letter-spacing:-.01em}
  header .m{color:#989ea9;font-size:12px;white-space:nowrap}
  header a.m{text-decoration:none}
  header a.m:hover{text-decoration:underline;color:#565d6b}
  .btn{border:1px solid rgba(16,18,22,.1);background:#fff;color:#1b1e26;padding:7px 16px;border-radius:99px;cursor:pointer;font-size:13px;font-weight:550;box-shadow:0 1px 2px rgba(16,18,22,.05);transition:all .15s}
  .btn:hover{border-color:rgba(16,18,22,.22);transform:translateY(-1px);box-shadow:0 4px 12px -4px rgba(16,18,22,.18)}
  .btn:active{transform:none;box-shadow:0 1px 2px rgba(16,18,22,.05)}
  .btn.pri{background:#1b1e26;color:#fff;border-color:#1b1e26}
  .btn.pri:hover{background:#000}
  .wrap{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(360px,1fr);gap:20px;max-width:1460px;margin:0 auto;padding:20px 22px 64px}
  @media(max-width:980px){.wrap{grid-template-columns:1fr}}
  .card{background:#fff;border:1px solid rgba(16,18,22,.06);border-radius:16px;overflow:hidden;box-shadow:0 1px 2px rgba(16,18,22,.03),0 16px 40px -26px rgba(16,18,22,.16)}
  /* stage */
  #stage{position:relative;background:radial-gradient(130% 150% at 50% 0%,#1e2129 0%,#0f1115 72%);aspect-ratio:16/10;display:flex;align-items:center;justify-content:center;overflow:hidden}
  #stage:after{content:"";position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 0 0 1px rgba(255,255,255,.06),inset 0 -60px 100px -50px rgba(0,0,0,.55)}
  #stage img{max-width:100%;max-height:100%;display:block;transition:opacity .12s}
  #rrhold{transform-origin:top left;position:absolute;top:0;left:0}
  #emptymsg{color:#5b6472;font-size:13px;padding:40px}
  /* transport */
  .tr{display:flex;align-items:center;gap:14px;padding:12px 16px;border-top:1px solid rgba(16,18,22,.05);flex-wrap:wrap}
  .tr .pp{width:36px;height:36px;border-radius:50%;border:0;background:#1b1e26;color:#fff;cursor:pointer;flex:none;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px -2px rgba(16,18,22,.4);transition:transform .13s,background .13s}
  .tr .pp svg{display:block}
  .tr .pp:hover{transform:scale(1.07);background:#000}
  .tr .pp:active{transform:scale(.97)}
  .tr .tc{font:12.5px/1 ui-monospace,"SF Mono",Consolas,monospace;color:#8b919e;font-variant-numeric:tabular-nums;letter-spacing:.02em;white-space:nowrap}
  .tr .tc b{color:#1b1e26;font-weight:600}
  .spd{display:inline-flex;background:#f1f1ef;border-radius:9px;padding:2px;gap:1px}
  .spd b{padding:3px 10px;font-size:11.5px;font-weight:600;color:#989ea9;border-radius:7px;cursor:pointer;user-select:none;transition:all .12s}
  .spd b:hover{color:#565d6b}
  .spd b.on{background:#fff;color:#1b1e26;box-shadow:0 1px 3px rgba(16,18,22,.12)}
  .sw{display:inline-flex;align-items:center;gap:7px;cursor:pointer;user-select:none;font-size:12px;color:#989ea9}
  .sw input{display:none}
  .sw i{width:30px;height:17px;border-radius:99px;background:#e2e4e8;position:relative;transition:background .18s;flex:none}
  .sw i:after{content:"";position:absolute;top:2px;left:2px;width:13px;height:13px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(16,18,22,.3);transition:left .18s}
  .sw input:checked+i{background:#ff4f00}
  .sw input:checked+i:after{left:15px}
  .tr .m{color:#a4aab6;font-size:11.5px}
  /* timeline: lane separators via hairlines */
  #tlw{position:relative;margin:2px 16px 6px}
  #tlw .bubble{position:absolute;bottom:calc(100% + 7px);transform:translateX(-50%);background:#1b1e26;color:#fff;font-size:11.5px;padding:5px 10px;border-radius:8px;white-space:nowrap;pointer-events:none;z-index:5;display:none;max-width:340px;overflow:hidden;text-overflow:ellipsis;box-shadow:0 8px 22px -8px rgba(16,18,22,.5)}
  #tlw .bubble b{font-family:ui-monospace,Consolas,monospace;color:#ff9c6b;margin-right:5px}
  #tlw.scrub .bubble,#tlw:hover .bubble{display:block}
  #tl{position:relative;height:58px;background:linear-gradient(to bottom,transparent 18px,rgba(16,18,22,.05) 18px,rgba(16,18,22,.05) 19px,transparent 19px,transparent 35px,rgba(16,18,22,.05) 35px,rgba(16,18,22,.05) 36px,transparent 36px),#f5f5f3;border:1px solid rgba(16,18,22,.05);border-radius:10px;cursor:pointer;overflow:hidden;touch-action:none}
  #tl .tk{position:absolute;width:3px;height:10px;border-radius:2px;opacity:.85}
  #tl .tk.blk{height:11px;opacity:.72;border-radius:4px}
  #tl .tk.big{width:4px}
  #tl .head{position:absolute;top:-3px;bottom:-3px;width:2px;background:#ff4f00;z-index:2;pointer-events:none}
  #tl .head:after{content:"";position:absolute;top:-4px;left:-4px;width:10px;height:10px;border-radius:50%;background:#ff4f00;box-shadow:0 0 0 3px rgba(255,79,0,.22)}
  .legend{display:flex;gap:14px;flex-wrap:wrap;padding:4px 18px 14px;font-size:11px;color:#989ea9}
  .legend i{display:inline-block;width:8px;height:8px;border-radius:3px;margin-right:5px;vertical-align:-1px}
  /* panel: segmented tabs */
  .tabs{display:flex;gap:4px;padding:6px;border-bottom:1px solid rgba(16,18,22,.06);background:#fafaf9}
  .tabs b{flex:1;text-align:center;padding:8px 4px;font-size:12.5px;font-weight:600;color:#989ea9;cursor:pointer;border-radius:9px;user-select:none;transition:all .15s}
  .tabs b:hover{color:#565d6b}
  .tabs b.on{color:#1b1e26;background:#fff;box-shadow:0 1px 4px rgba(16,18,22,.1),0 0 0 1px rgba(16,18,22,.04)}
  .pane{display:none;max-height:calc(100vh - 226px);min-height:320px;overflow-y:auto;padding:10px 12px}
  .pane.on{display:block}
  .pane::-webkit-scrollbar{width:9px}
  .pane::-webkit-scrollbar-thumb{background:#e3e5e9;border-radius:9px;border:2.5px solid #fff}
  .pane::-webkit-scrollbar-thumb:hover{background:#ced2d9}
  /* transcript */
  .q{display:block;cursor:pointer;padding:8px 10px;border-radius:9px;font-size:13.5px;color:#2a2e38;line-height:1.55;transition:background .12s;margin:1px 0}
  .q:hover{background:#f5f5f2}
  .q.on{background:#fff3ec;box-shadow:inset 2.5px 0 0 #ff4f00}
  .q .qt{color:#a4aab6;font:10.5px ui-monospace,Consolas,monospace;margin-right:8px;font-variant-numeric:tabular-nums}
  /* events */
  .e{display:flex;gap:9px;padding:6px 8px;font-size:12.5px;color:#565d6b;align-items:baseline;border-radius:8px;cursor:pointer;transition:background .12s}
  .e:hover{background:#f5f5f2}
  .e .t{color:#a4aab6;font:10.5px ui-monospace,Consolas,monospace;flex:none;font-variant-numeric:tabular-nums}
  .e i{flex:none;width:7px;height:7px;border-radius:3px;margin-top:4px}
  .e.bad{color:#c0342b;font-weight:500}
  .e>span{min-width:0;word-break:break-all}
  .e .sel{font:11px ui-monospace,Consolas,monospace;color:#a4aab6;word-break:break-all}
  .e .thumb{height:36px;border-radius:6px;border:1px solid rgba(16,18,22,.08);margin-left:auto;flex:none;cursor:zoom-in;transition:transform .13s}
  .e .thumb:hover{transform:scale(1.06)}
  /* issues */
  .is{border:1px solid rgba(16,18,22,.07);border-radius:12px;padding:13px 15px;margin:0 2px 10px;cursor:pointer;transition:all .15s;background:#fff}
  .is:hover{border-color:#ffb99d;box-shadow:0 8px 24px -12px rgba(255,79,0,.3);transform:translateY(-1px)}
  .is .top{display:flex;gap:8px;align-items:center;margin-bottom:5px}
  .is .at{font:10.5px ui-monospace,Consolas,monospace;background:#fff0e8;color:#c2410c;padding:2.5px 9px;border-radius:99px;font-weight:600;font-variant-numeric:tabular-nums}
  .is .sev{font-size:10px;font-weight:700;letter-spacing:.06em;padding:3px 9px;border-radius:99px;background:#eef0f6;color:#4a5cc4;text-transform:uppercase}
  .is .sev.bug{background:#fdecec;color:#b91c1c}
  .is .ti{font-weight:600;font-size:13px;margin:3px 0 2px;color:#1b1e26;line-height:1.5}
  .is .ds{font-size:11.5px;color:#989ea9}
  /* agent tab */
  .stats{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:rgba(16,18,22,.06);border:1px solid rgba(16,18,22,.05);border-radius:12px;overflow:hidden;margin:4px 2px 14px}
  .stats div{background:#fff;padding:12px 16px}
  .stats b{display:block;font-size:19px;font-weight:700;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
  .stats span{font-size:11px;color:#989ea9}
  .files{margin:12px 2px;font:12px ui-monospace,Consolas,monospace;color:#565d6b;line-height:2.1}
  .files a{color:#4a5cc4;text-decoration:none}
  .files a:hover{text-decoration:underline}
  .hint{font-size:12px;color:#989ea9;margin:8px 2px 12px;line-height:1.65}
  #lb{position:fixed;inset:0;background:rgba(10,12,16,.82);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);display:none;align-items:center;justify-content:center;z-index:9;cursor:zoom-out}
  #lb.on{display:flex}
  #lb img{max-width:94vw;max-height:94vh;border-radius:10px;box-shadow:0 32px 90px -20px rgba(0,0,0,.65)}
  #toast{position:fixed;bottom:26px;left:50%;transform:translateX(-50%);background:#1b1e26;color:#fff;padding:9px 20px;border-radius:99px;font-size:13px;opacity:0;transition:opacity .2s;z-index:10;pointer-events:none;box-shadow:0 10px 28px -8px rgba(0,0,0,.45)}
  #toast.on{opacity:1}
</style>
<header>
  <span class="brand">w<span class="dl">ı</span>tness</span>
  <span class="u">${esc(meta.title ?? meta.url)}</span>
  <a class="m" href="${esc(meta.url)}" target="_blank" rel="noopener">${esc(meta.url)}</a>
  <span class="m">${new Date(meta.startedAt).toLocaleString()} · ${fmt(meta.durationMs)}</span>
  <span class="sp"></span>
  <button class="btn pri" id="copyai" title="复制给 AI agent 的证据指引">⧉ Copy for AI</button>
</header>
<div class="wrap">
  <div class="card">
    <div id="stage"></div>
    <div class="tr">
      <button class="pp" id="pp" title="播放/暂停"><svg viewBox="0 0 12 12" width="13" height="13"><path d="M3.6 2.1v7.8c0 .62.68.99 1.2.66l6-3.9a.78.78 0 0 0 0-1.32l-6-3.9c-.52-.33-1.2.04-1.2.66z" fill="currentColor"/></svg></button>
      <span class="tc"><b id="cur">00:00</b> / ${fmt(meta.durationMs)}</span>
      <span class="spd"><b data-v="1" class="on">1×</b><b data-v="1.5">1.5×</b><b data-v="2">2×</b><b data-v="4">4×</b></span>
      <label class="sw"><input type="checkbox" id="fol" checked><i></i>follow</label>
      <span class="sp"></span>
      <span class="m">${rrEmbed ? "DOM 回放" : "截图序列"} · 音频驱动时钟</span>
    </div>
    <div id="tlw"><div id="tl"><div class="head" id="ph"></div></div><div class="bubble" id="bub"></div></div>
    <div class="legend" id="lg"></div>
  </div>
  <div class="card">
    <div class="tabs">
      <b data-p="tp" class="on">Transcript</b><b data-p="ep">Events</b><b data-p="ip">Issues</b><b data-p="ap">Agent</b>
    </div>
    <div class="pane on" id="tp"></div>
    <div class="pane" id="ep"></div>
    <div class="pane" id="ip"></div>
    <div class="pane" id="ap"></div>
  </div>
</div>
<div id="lb"><img id="lbi"></div>
<div id="toast"></div>
<audio id="au" src="audio.webm" preload="auto"></audio>
${rrEmbed}
<script>const D=${data};</script>
<script>
const au=document.getElementById('au'),lb=document.getElementById('lb'),lbi=document.getElementById('lbi'),stage=document.getElementById('stage');
/* MediaRecorder webm has no cue index: over HTTP, range-less servers can't seek.
   Pull the whole file into a blob URL so every position is addressable.
   (file:// fetch fails — fine, local file loading gives full-buffer access anyway) */
fetch('audio.webm').then(r=>r.ok?r.blob():Promise.reject()).then(b=>{
  const p=au.currentTime,live=!au.paused;
  au.src=URL.createObjectURL(b);au.load();
  au.addEventListener('loadedmetadata',()=>{au.currentTime=p;if(live)au.play()},{once:true});
}).catch(()=>{});
const fmt=ms=>{const s=Math.max(0,Math.round(ms/1000));return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')};
const esc=s=>String(s??'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const dur=D.meta.durationMs||1;
/* audio clock bias: session t=0 is nav; audio.webm starts when mic arm fires (~1-2s later) */
const _mic=D.evs.find(e=>e.kind==='note'&&/mic recording|microphone/i.test(e.text||''));
const bias=_mic?_mic.t:0;
const KC={say:'#8b5cf6',nav:'#3b82f6',click:'#0891b2',mark:'#ec4899',note:'#f59e0b',key:'#f59e0b',input:'#64748b',scroll:'#cbd5e1',mut:'#cbd5e1',shot:'#94a3b8',req:'#a5b4fc',res:'#a5b4fc',console:'#f59e0b',error:'#ef4444',err:'#ef4444',issue:'#ff4f00',_ui:'#e2e8f0'};
const LNAMES=[['say','语音'],['nav','跳转'],['click','点击'],['mark','标记'],['note','批注'],['console','警告'],['error','报错'],['res','失败请求']];
const isBad=e=>e.kind==='error'||e.kind==='err'||(e.kind==='res'&&(e.status===0||e.status>=400))||(e.kind==='console'&&(e.level==='error'||e.level==='warning'));
const kcol=e=>isBad(e)?'#ef4444':(KC[e.kind]||'#cbd5e1');
const desc=e=>{
  switch(e.kind){
    case 'nav':return '打开 '+esc(e.url);
    case 'click':return '点击 '+esc(e.text||e.sel)+(e.kbd?' <span class=sel>(键盘)</span>':'');
    case 'say':return '🎙 '+esc(e.text);
    case 'mark':return e.region?'圈选区域 '+e.region.w+'×'+e.region.h:'标记 '+esc(e.text||e.sel)+' <span class=sel>'+esc(e.sel)+(e.react&&e.react.length?' · '+e.react.join(' › '):'')+'</span>';
    case 'console':return '控制台 '+e.level+'：'+esc((e.text||'').slice(0,140));
    case 'error':case 'err':return '报错：'+esc((e.message||e.text||'').slice(0,140));
    case 'req':return '请求 '+e.method+' '+esc((e.url||'').slice(0,110));
    case 'res':return '响应 '+e.status+' '+esc((e.url||'').slice(0,110));
    case 'mut':return 'DOM '+esc(e.sel)+' '+esc((e.summary||'').slice(0,64));
    case 'scroll':return '滚动 y='+e.y;
    case 'input':return '输入 '+esc(e.sel)+(e.masked?' 🔒':'');
    case 'key':return '按键 '+e.key;
    case 'note':return esc(e.text);
    case 'shot':return '截图';
    case 'issue':return '⏺ Issue #'+e.n+' 边界';
    case 'paused':return '⏸ 暂停';case 'resumed':return '继续录制';
    default:return e.kind;
  }
};
/* ---------- frames: screenshot sequence ---------- */
const seen=new Set(),frames=[];
for(const e of D.evs){const p=e.kind==='shot'?e.path:e.shot;if(p&&!seen.has(p)){seen.add(p);frames.push({t:e.t,p})}}
frames.sort((a,b)=>a.t-b.t);
const frameAt=t=>{let f=null;for(const x of frames){if(x.t<=t)f=x;else break}return f};
/* ---------- stage: rrweb replay or shot sequence ---------- */
let rp=null,rrReady=false;
const hasRR=!!(window.RRE&&window.rrweb);
if(hasRR){
  const hold=document.createElement('div');hold.id='rrhold';stage.appendChild(hold);
  try{
    rp=new rrweb.Replayer(RRE,{root:hold,speed:1,skipInactive:true,showWarning:false,mouseTail:false});
    rrReady=true;
    requestAnimationFrame(()=>{
      const w=hold.querySelector('.replayer-wrapper');
      if(w){const fit=()=>{const ww=w.offsetWidth||1280,hh=w.offsetHeight||800,s=Math.min(stage.clientWidth/ww,stage.clientHeight/hh);
        hold.style.transform='scale('+s+')';hold.style.left=((stage.clientWidth-ww*s)/2)+'px';hold.style.top=((stage.clientHeight-hh*s)/2)+'px'};
        fit();new ResizeObserver(fit).observe(stage)}
    });
  }catch(e){}
}
let sImg=null,curShot='';
if(!rrReady){
  if(frames.length){sImg=document.createElement('img');stage.appendChild(sImg);sImg.onclick=()=>{if(sImg.src){lbi.src=sImg.src;lb.classList.add('on')}};sImg.style.cursor='zoom-in'}
  else stage.innerHTML='<div id="emptymsg">本次录制无画面（无 rrweb/截图），仅音频与事件</div>';
}
const setShot=t=>{if(!sImg)return;const f=frameAt(t)||frames[0];if(f&&f.p!==curShot){curShot=f.p;sImg.src=f.p}};
/* ---------- unified clock ---------- */
const ph=document.getElementById('ph'),cur=document.getElementById('cur'),pp=document.getElementById('pp');
let qEls=[];
const syncRR=t=>{if(rp){try{rp.play(t)}catch(e){}}};
const ICO_PLAY='<svg viewBox="0 0 12 12" width="13" height="13"><path d="M3.6 2.1v7.8c0 .62.68.99 1.2.66l6-3.9a.78.78 0 0 0 0-1.32l-6-3.9c-.52-.33-1.2.04-1.2.66z" fill="currentColor"/></svg>';
const ICO_PAUSE='<svg viewBox="0 0 12 12" width="13" height="13"><path d="M3 2.2c0-.5.4-.9.9-.9h.8c.5 0 .9.4.9.9v7.6c0 .5-.4.9-.9.9h-.8c-.5 0-.9-.4-.9-.9zM6.4 2.2c0-.5.4-.9.9-.9h.8c.5 0 .9.4.9.9v7.6c0 .5-.4.9-.9.9h-.8c-.5 0-.9-.4-.9-.9z" fill="currentColor"/></svg>';
au.addEventListener('play',()=>{pp.innerHTML=ICO_PAUSE;syncRR(au.currentTime*1000+bias)});
au.addEventListener('pause',()=>{pp.innerHTML=ICO_PLAY;if(rp)try{rp.pause()}catch(e){}});
au.addEventListener('seeked',()=>{if(!au.paused)syncRR(au.currentTime*1000+bias);else if(rp){try{rp.pause(au.currentTime*1000+bias)}catch(e){rp.play(au.currentTime*1000+bias);rp.pause()}}});
au.addEventListener('timeupdate',()=>{
  const t=au.currentTime*1000+bias;cur.textContent=fmt(t);
  ph.style.left=(Math.min(1,t/dur)*100)+'%';
  setShot(t);
  let act=null;for(const q of qEls){if(+q.dataset.t<=t)act=q;else break}
  if(act!==window.__lq){window.__lq=act;qEls.forEach(q=>q.classList.toggle('on',q===act));
    if(act&&document.getElementById('fol').checked)act.scrollIntoView({block:'nearest'})}
});
const seek=t=>{au.currentTime=Math.max(0,(t-bias)/1000);if(au.paused)au.play()};
pp.onclick=()=>{au.paused?au.play():au.pause()};
document.querySelectorAll('.spd b').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('.spd b').forEach(x=>x.classList.toggle('on',x===b));
  const v=+b.dataset.v;au.playbackRate=v;if(rp&&rp.setSpeed)try{rp.setSpeed(v)}catch(_){}
});
/* ---------- timeline: 3 lanes — speech blocks / activity / signals ---------- */
const tl=document.getElementById('tl');
const laneOf=e=>{
  if(e.kind==='say')return 0;
  if(isBad(e)||e.kind==='console')return 2;
  return ['nav','click','mark','input','key','note','issue','paused','resumed'].includes(e.kind)?1:-1;
};
for(const e of D.evs){
  const L=laneOf(e);if(L<0||e.t==null)continue;
  if(e.kind==='say'){
    const b=document.createElement('div');b.className='tk blk';
    const a=e.segStart!=null?e.segStart:e.t,z=e.segEnd!=null?e.segEnd:e.t+800;
    b.style.left=(Math.min(1,a/dur)*100)+'%';
    b.style.width=Math.max(0.5,(z-a)/dur*100)+'%';
    b.style.top='6px';b.style.background='#8b5cf6';
    b.title=fmt(a)+' 语音：'+esc(e.text||'').slice(0,60);
    tl.appendChild(b);continue;
  }
  const tk=document.createElement('div');
  tk.className='tk'+(isBad(e)||e.kind==='mark'||e.kind==='issue'?' big':'');
  tk.style.left=(Math.min(1,e.t/dur)*100)+'%';
  tk.style.top=(L===1?'22px':'38px');
  tk.style.background=kcol(e);
  tk.title=fmt(e.t)+' '+(e.text||e.sel||e.url||e.message||e.kind||'').toString().slice(0,60);
  tl.appendChild(tk);
}
/* draggable playhead: scrub previews frame+subtitle, release seeks */
const tlw=document.getElementById('tlw'),bub=document.getElementById('bub');
let dragging=false,wasPlaying=false;
const scrub=ev=>{
  const r=tl.getBoundingClientRect();
  const p=Math.max(0,Math.min(1,(ev.clientX-r.left)/r.width)),t=p*dur;
  ph.style.left=(p*100)+'%';cur.textContent=fmt(t);setShot(t);
  let q=null;for(const x of qEls){if(+x.dataset.t<=t)q=x;else break}
  bub.style.left=(p*100)+'%';
  bub.innerHTML='<b>'+fmt(t)+'</b>'+(q?esc((q.querySelector('.qt').nextSibling?.textContent||'').trim().slice(0,42)):'');
  return t;
};
tl.addEventListener('pointerdown',e=>{dragging=true;wasPlaying=!au.paused;if(wasPlaying)au.pause();try{tl.setPointerCapture(e.pointerId)}catch(_){};tlw.classList.add('scrub');scrub(e)});
tl.addEventListener('pointermove',e=>{if(dragging)scrub(e)});
tl.addEventListener('pointerup',e=>{if(!dragging)return;dragging=false;tlw.classList.remove('scrub');const t=scrub(e);au.currentTime=Math.max(0,(t-bias)/1000);if(wasPlaying)au.play()});
const lg=document.getElementById('lg');
for(const[k,n]of LNAMES)lg.insertAdjacentHTML('beforeend','<span><i style="background:'+KC[k]+'"></i>'+n+'</span>');
/* ---------- transcript tab ---------- */
const tp=document.getElementById('tp');
let anySay=false;
for(const b of D.blocks){
  if(b.head==='prelude'||b.head==='tail')continue;
  if(b.issue!=null){
    const d=document.createElement('div');d.className='e';
    d.style.cssText='color:#c2410c;font-weight:600';
    d.innerHTML='<span class=t>'+fmt(b.at)+'</span><i style="background:#ff4f00"></i><span>⏺ Issue #'+b.issue+'</span>';
    d.onclick=()=>seek(b.at);tp.appendChild(d);continue;
  }
  for(const f of (b.frags||[])){
    anySay=true;
    const q=document.createElement('div');q.className='q';q.dataset.t=f.t;
    q.innerHTML='<span class=qt>'+fmt(f.t)+'</span>'+esc(f.text);
    q.onclick=()=>seek(f.t);tp.appendChild(q);qEls.push(q);
  }
}
if(!anySay)tp.innerHTML='<div class="hint" style="padding:30px 10px">本段录制没有识别到语音。</div>'+tp.innerHTML;
else tp.insertAdjacentHTML('afterbegin','<div class="hint" style="padding:2px 10px 8px;border-bottom:1px solid #eceef2;margin-bottom:6px">'+qEls.length+' segments · 点击任意句跳转</div>');
/* ---------- events tab ---------- */
const ep=document.getElementById('ep');
for(const e of D.evs){
  if(e._q||e.kind==='shot'||e.kind==='_ui'||e.kind==='scroll'||e.kind==='mut'&&!isBad(e))continue;
  const d=document.createElement('div');
  d.className='e'+(isBad(e)?' bad':'');
  d.innerHTML='<span class=t>'+fmt(e.t)+'</span><i style="background:'+kcol(e)+'"></i><span>'+desc(e)+'</span>';
  const p=e.kind==='shot'?e.path:e.shot;
  if(p){const im=document.createElement('img');im.className='thumb';im.src=p;im.loading='lazy';
    im.onclick=ev=>{ev.stopPropagation();lbi.src=p;lb.classList.add('on')};d.appendChild(im)}
  d.onclick=()=>seek(e.t);ep.appendChild(d);
}
/* ---------- issues tab ---------- */
const ip=document.getElementById('ip');
const marks=D.blocks.filter(b=>b.issue!=null);
const sayOf=t=>{for(const b of D.blocks)for(const f of (b.frags||[]))if(f.t>=t)return f.text;return ''};
if(marks.length){
  marks.forEach((m,i)=>{
    const nx=marks[i+1],to=nx?nx.at:dur;
    const es=D.evs.filter(e=>e.t>=m.at&&e.t<to);
    const errs=es.filter(isBad).length,says=es.filter(e=>e.kind==='say').length||D.blocks.filter(b=>b.frags&&b.frags.some(f=>f.t>=m.at&&f.t<to)).length;
    const c=document.createElement('div');c.className='is';
    c.innerHTML='<div class=top><span class=at>'+fmt(m.at)+'</span><span class="sev'+(errs?' bug':'')+'">'+(errs?'BUG':'QUESTION')+'</span></div>'
      +'<div class=ti>Issue #'+m.issue+'</div><div class=ds>'+esc(sayOf(m.at).slice(0,80)||'（无语音说明）')+'</div>'
      +'<div class=ds style="margin-top:4px">'+says+' 段语音 · '+es.length+' 条事件 · '+errs+' 处异常</div>';
    c.onclick=()=>seek(m.at);ip.appendChild(c);
  });
}else{
  // no explicit N-splits: auto-cluster into one card per contiguous speech run
  const runs=D.blocks.filter(b=>b.frags&&b.frags.length&&b.head!=='prelude');
  if(!runs.length){
    ip.innerHTML='<div class="hint" style="padding:30px 10px">无语音段可归纳。</div>';
  }
  runs.forEach((b,i)=>{
    const nx=D.blocks[D.blocks.indexOf(b)+1],to=nx&&nx.at!=null?nx.at:dur;
    const at=b.frags[0].t;
    const es=D.evs.filter(e=>e.t>=at&&e.t<to);
    const errs=es.filter(isBad).length;
    const marks2=es.filter(e=>e.kind==='mark');
    const c=document.createElement('div');c.className='is';
    c.innerHTML='<div class=top><span class=at>'+fmt(at)+'</span><span class="sev'+(errs?' bug':'')+'">'+(errs?'BUG':'QUESTION')+'</span></div>'
      +'<div class=ti>'+esc(b.frags.map(f=>f.text).join(' ').slice(0,90))+'</div>'
      +(marks2.length?'<div class=ds>标记：<span class=sel>'+esc(marks2.map(m=>m.sel).slice(0,3).join(' · '))+'</span></div>':'')
      +'<div class=ds style="margin-top:4px">'+b.frags.length+' 段语音 · '+es.length+' 条事件 · '+errs+' 处异常</div>';
    c.onclick=()=>seek(at);ip.appendChild(c);
  });
}
/* ---------- agent tab ---------- */
const ap=document.getElementById('ap');
const nErr=D.evs.filter(e=>e.kind==='error'||e.kind==='err').length;
const nFail=D.evs.filter(e=>e.kind==='res'&&(e.status===0||e.status>=400)).length;
const nSay=D.blocks.reduce((n,b)=>n+(b.frags?b.frags.length:0),0);
const navs=[...new Set(D.evs.filter(e=>e.kind==='nav').map(e=>e.url))];
ap.innerHTML='<div class=stats>'
  +'<div><b>'+fmt(dur)+'</b><span>时长</span></div>'
  +'<div><b>'+nSay+'</b><span>语音段</span></div>'
  +'<div><b>'+D.evs.length+'</b><span>事件</span></div>'
  +'<div><b>'+frames.length+'</b><span>截图</span></div>'
  +'<div><b>'+nErr+'</b><span>页面报错</span></div>'
  +'<div><b>'+nFail+'</b><span>失败请求</span></div></div>'
  +'<div class=hint>把 PROMPT.md 丢给你的 AI agent（Devin / Cursor / Claude Code），它会读 session.md 时间轴、events.jsonl 原始事件和 shots/ 截图来定位修复。</div>'
  +'<button class="btn pri" id="copyai2" style="width:100%;padding:10px">⧉ 复制 agent 指引（PROMPT.md）</button>'
  +'<div class=files>'
  +'<div><a href="session.md">session.md</a> · 语音+证据时间轴</div>'
  +'<div><a href="PROMPT.md">PROMPT.md</a> · 给 agent 的指引</div>'
  +'<div><a href="events.jsonl">events.jsonl</a> · 原始事件流</div>'
  +'<div><a href="audio.webm">audio.webm</a> · 原始录音</div>'
  +'<div>shots/ · '+frames.length+' 张截图　bodies/ · 请求体</div>'
  +(navs.length?'<div style="color:#9aa3b2;margin-top:6px">访问页面：'+navs.map(esc).join('<br>')+'</div>':'')
  +'</div>';
/* ---------- tabs / copy / lightbox ---------- */
document.querySelectorAll('.tabs b').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('.tabs b').forEach(x=>x.classList.toggle('on',x===b));
  document.querySelectorAll('.pane').forEach(p=>p.classList.toggle('on',p.id===b.dataset.p));
});
const toast=m=>{const t=document.getElementById('toast');t.textContent=m;t.classList.add('on');setTimeout(()=>t.classList.remove('on'),1600)};
const copyAI=()=>{
  const txt=D.prompt||('证据目录：本目录\\n先读 session.md，再按需查 events.jsonl 与 shots/。');
  (navigator.clipboard?navigator.clipboard.writeText(txt):Promise.reject()).then(()=>toast('已复制，粘贴给你的 AI agent')).catch(()=>toast('复制失败——请手动打开 PROMPT.md'));
};
document.getElementById('copyai').onclick=copyAI;
document.getElementById('copyai2').onclick=copyAI;
lb.onclick=()=>lb.classList.remove('on');
document.addEventListener('keydown',e=>{if(e.key==='Escape')lb.classList.remove('on');if(e.key===' '&&e.target===document.body){e.preventDefault();au.paused?au.play():au.pause()}});
setShot(0);
</script>`;
}

export function renderPrompt(sessionDir: string, events: Ev[] = [], issueCount = 0): string {
  const vocab = [...new Set(
    events.flatMap(e => (e.kind === "mark" || e.kind === "click") && e.text ? [e.text] : [])
  )].slice(0, 30);
  return [
    "这是 Witness 录制的一段产品体验反馈（voice + click + 页面实况证据链）。",
    "",
    `证据目录: ${sessionDir}`,
    "",
    "请按以下顺序处理：",
    `1. 读 \`ISSUES.md\` —— ${issueCount} 个问题的索引；每个问题的语音原文/嫌疑元素/截图/DOM 快照打包在 \`issues/NN.md\``,
    "   （`session.md` 是全量时间轴档案，只在 issues 文件之外需要更多上下文时读）",
    "2. 先把用户指出的问题复述成清单，请用户确认后再动手——不要直接开修：",
    "   | # | 时间 | 用户原话 | 你的理解 | 关联证据 |",
    "   每段 SAY 至少归进一个问题；一句话含多个问题拆成 1a/1b；理解有歧义的标 ❓ 让用户澄清，别自己猜。",
    "   清单末尾问一句：共 N 条，有漏的或理解偏的吗？",
    "3. 用户确认（或纠正）后逐条修复：用 `selector`/`React 组件名` 在代码里定位；需要原始数据查 `events.jsonl`；视觉确认看 `shots/`",
    "4. 修不了的在汇报里标注原因和需要的补充证据",
    "",
    "注意：SAY 是语音识别原文碎片（按停顿分段），连续引用的多条碎片属同一段话；含口语与同音字误识别，请结合下方词表按意图理解，勿逐字采信。",
    "`⏺ ISSUE #n` 是用户按 N 键显式切出的问题边界——边界之间的语音与证据视为同一个问题。",
    "paused/resumed 之间的暂停区间无任何记录（用户主动冻结证据），不要解读那段时间。",
    ...(vocab.length ? [`页面元素文字（辅助理解转写）：${vocab.join(" / ")}`] : []),
    "重要：如果没有 SAY 语音段，绝对不要从点击/滚动行为推断用户想报什么问题——那些只是操作证据。直接问用户他这段想说什么。",
  ].join("\n");
}

export async function writeSessionFiles(dir: string, events: Ev[], meta: Meta, transcript?: Transcript, assoc?: AssocMap) {
  const md = renderMarkdown(events, meta, transcript, assoc);
  const issues = writeIssues(dir, events, { url: meta.url, durationMs: meta.durationMs });
  makeAudioSeekable(join(dir, "audio.webm"), meta.durationMs);
  let rrJsonl: string | undefined;
  try { rrJsonl = readFileSync(join(dir, "rrweb.jsonl"), "utf8"); } catch {}
  if (!meta.title) {
    try {
      const snap = readdirSync(join(dir, "dom")).find(f => f.endsWith("-nav.html"));
      if (snap) meta = { ...meta, title: readFileSync(join(dir, "dom", snap), "utf8").match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || undefined };
    } catch {}
  }
  const prompt = renderPrompt(dir, events, issues.length);
  const html = renderReviewHtml(events, meta, rrJsonl, prompt);
  await writeFile(join(dir, "session.md"), md);
  await writeFile(join(dir, "review.html"), html);
  await writeFile(join(dir, "PROMPT.md"), prompt);
  await writeFile(join(dir, "README.txt"), [
    "这个目录怎么读 ——",
    "",
    "【给人看】双击 review.html",
    "    语音 + 截图 + 操作对齐的视觉时间轴，点击语音片段可跳到录音对应位置。",
    "",
    "【给 AI agent】把 PROMPT.md 的内容连同本目录交给 agent",
    "    ISSUES.md 问题索引（先读）· issues/NN.md 每问一包 · session.md 证据时间轴",
    "    events.jsonl 原始事件 · shots/ 截图 · audio.webm 录音",
    "",
    "其余：session.json 元数据 · transcript.json 识别结果 · bodies/ 网络响应体",
  ].join("\n"));
  if (transcript) await writeFile(join(dir, "transcript.json"), JSON.stringify(transcript, null, 1));
  if (assoc?.size) {
    const idx = new Map(events.map((e, i) => [e, i]));
    await writeFile(join(dir, "assoc.json"), JSON.stringify(
      [...assoc.entries()].map(([s, a]) => ({
        say: idx.get(s),
        title: a.title,
        hits: [...a.hits].map(h => idx.get(h)),
      })), null, 1));
  }
  return { md, html, prompt };
}

export function copyToClipboard(text: string) {
  try {
    if (process.platform === "win32") {
      execSync(`powershell -NoProfile -Command "Set-Clipboard -Value ([Console]::In.ReadToEnd())"`, { input: text });
    } else if (process.platform === "darwin") {
      execSync("pbcopy", { input: text });
    } else {
      execSync("xclip -selection clipboard", { input: text });
    }
    return true;
  } catch { return false; }
}
