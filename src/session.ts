import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { fmt, type Ev } from "./events.js";
import type { Transcript } from "./transcribe.js";
import type { AssocMap } from "./associate.js";
import { rrwebUmd } from "./rr.js";
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
  body{margin:0;background:#f4f5f7;color:#1f2329;font:14px/1.6 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif}
  header{position:sticky;top:0;z-index:8;background:#fff;border-bottom:1px solid #e5e7eb;padding:9px 20px;display:flex;gap:14px;align-items:center}
  header .brand{font-weight:800;font-size:15px;letter-spacing:-.02em}
  header .brand i{font-style:normal;color:#ff4f00}
  header .u{font-weight:600;font-size:14px;max-width:44vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  header .m{color:#8a919e;font-size:12px;white-space:nowrap}
  header .sp{flex:1}
  .btn{border:1px solid #dfe3ea;background:#fff;color:#1f2329;padding:6px 14px;border-radius:7px;cursor:pointer;font-size:13px;font-weight:500}
  .btn:hover{border-color:#b9c2d0}
  .btn.pri{background:#1f2329;color:#fff;border-color:#1f2329}
  .btn.pri:hover{background:#000}
  .wrap{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(340px,1fr);gap:16px;max-width:1440px;margin:0 auto;padding:16px 18px 60px}
  @media(max-width:960px){.wrap{grid-template-columns:1fr}}
  .card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,.03)}
  /* stage */
  #stage{position:relative;background:#17181c;aspect-ratio:16/10;display:flex;align-items:center;justify-content:center;overflow:hidden}
  #stage img{max-width:100%;max-height:100%;display:block;transition:opacity .12s}
  #rrhold{transform-origin:top left;position:absolute;top:0;left:0}
  #emptymsg{color:#6b7280;font-size:13px;padding:40px}
  /* transport */
  .tr{display:flex;align-items:center;gap:12px;padding:10px 14px;border-top:1px solid #eceef2;flex-wrap:wrap}
  .tr .pp{width:34px;height:34px;border-radius:50%;border:0;background:#1f2329;color:#fff;font-size:14px;cursor:pointer;flex:none;display:flex;align-items:center;justify-content:center}
  .tr .tc{font:12px ui-monospace,Consolas,monospace;color:#4b5262;white-space:nowrap}
  .tr select{border:1px solid #dfe3ea;border-radius:5px;font-size:12px;padding:2px 6px;color:#4b5262}
  .tr label{font-size:12px;color:#8a919e;display:flex;gap:4px;align-items:center;user-select:none}
  /* timeline */
  #tl{position:relative;height:34px;margin:0 14px 4px;background:#f4f5f7;border-radius:6px;cursor:pointer}
  #tl .tk{position:absolute;top:0;width:3px;height:100%;border-radius:2px;opacity:.75}
  #tl .tk.big{height:100%;width:4px;opacity:1}
  #tl .head{position:absolute;top:-3px;bottom:-3px;width:2px;background:#ff4f00;z-index:2;pointer-events:none}
  #tl .head:after{content:"";position:absolute;top:-4px;left:-4px;width:10px;height:10px;border-radius:50%;background:#ff4f00}
  .legend{display:flex;gap:12px;flex-wrap:wrap;padding:6px 16px 12px;font-size:11px;color:#8a919e}
  .legend i{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:4px;vertical-align:-1px}
  /* panel */
  .tabs{display:flex;border-bottom:1px solid #e5e7eb}
  .tabs b{flex:1;text-align:center;padding:11px 4px;font-size:13px;font-weight:600;color:#8a919e;cursor:pointer;border-bottom:2px solid transparent;user-select:none}
  .tabs b.on{color:#1f2329;border-color:#1f2329}
  .pane{display:none;max-height:calc(100vh - 210px);min-height:300px;overflow-y:auto;padding:10px 14px}
  .pane.on{display:block}
  /* transcript */
  .q{display:block;cursor:pointer;padding:7px 10px;border-radius:8px;font-size:14px;color:#24272e;line-height:1.55}
  .q:hover{background:#f5f7fb}
  .q.on{background:#fff3ee;box-shadow:inset 3px 0 0 #ff4f00}
  .q .qt{color:#9aa3b2;font:11px ui-monospace,Consolas,monospace;margin-right:8px}
  /* events */
  .e{display:flex;gap:9px;padding:5px 6px;font-size:12.5px;color:#4b5262;align-items:baseline;border-radius:6px;cursor:pointer}
  .e:hover{background:#f5f7fb}
  .e .t{color:#9aa3b2;font:11px ui-monospace,Consolas,monospace;flex:none}
  .e i{flex:none;width:7px;height:7px;border-radius:2px;margin-top:4px}
  .e.bad{color:#c0342b;font-weight:500}
  .e>span{min-width:0;word-break:break-all}
  .e .sel{font:11px ui-monospace,Consolas,monospace;color:#9aa3b2;word-break:break-all}
  .e .thumb{height:34px;border-radius:4px;border:1px solid #e5e7eb;margin-left:auto;flex:none;cursor:zoom-in}
  /* issues */
  .is{border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px;margin:10px 4px;cursor:pointer;transition:border-color .15s}
  .is:hover{border-color:#ff9c6b}
  .is .top{display:flex;gap:8px;align-items:center;margin-bottom:4px}
  .is .at{font:11px ui-monospace,Consolas,monospace;background:#fff3ee;color:#c2410c;padding:2px 8px;border-radius:5px}
  .is .sev{font-size:10.5px;font-weight:700;letter-spacing:.04em;padding:2px 8px;border-radius:5px;background:#eef2ff;color:#4a5cc4}
  .is .sev.bug{background:#fee2e2;color:#b91c1c}
  .is .ti{font-weight:600;font-size:13.5px;margin:4px 0 2px}
  .is .ds{font-size:12px;color:#8a919e}
  /* agent tab */
  .stats{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:#eceef2;border:1px solid #eceef2;border-radius:10px;overflow:hidden;margin:8px 4px 14px}
  .stats div{background:#fff;padding:10px 14px}
  .stats b{display:block;font-size:18px;font-weight:700}
  .stats span{font-size:11px;color:#8a919e}
  .files{margin:10px 4px;font:12px ui-monospace,Consolas,monospace;color:#4b5262;line-height:2}
  .files a{color:#4a5cc4;text-decoration:none}
  .files a:hover{text-decoration:underline}
  .hint{font-size:12px;color:#8a919e;margin:6px 4px 12px;line-height:1.6}
  #lb{position:fixed;inset:0;background:rgba(15,17,22,.88);display:none;align-items:center;justify-content:center;z-index:9;cursor:zoom-out}
  #lb.on{display:flex}
  #lb img{max-width:94vw;max-height:94vh;border-radius:4px}
  #toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1f2329;color:#fff;padding:8px 18px;border-radius:8px;font-size:13px;opacity:0;transition:opacity .2s;z-index:10;pointer-events:none}
  #toast.on{opacity:1}
</style>
<header>
  <span class="brand">w<i>ı</i>tness</span>
  <span class="u">${esc(meta.title ?? meta.url)}</span>
  <span class="m">${esc(meta.url)}</span>
  <span class="m">${new Date(meta.startedAt).toLocaleString()} · ${fmt(meta.durationMs)}</span>
  <span class="sp"></span>
  <button class="btn pri" id="copyai" title="复制给 AI agent 的证据指引">⧉ Copy for AI</button>
</header>
<div class="wrap">
  <div class="card">
    <div id="stage"></div>
    <div class="tr">
      <button class="pp" id="pp" title="播放/暂停">▶</button>
      <span class="tc"><b id="cur">00:00</b> / ${fmt(meta.durationMs)}</span>
      <select id="spd"><option>1</option><option>1.5</option><option>2</option><option>4</option></select>
      <label><input type="checkbox" id="fol" checked> follow</label>
      <span class="sp"></span>
      <span class="m">${rrEmbed ? "DOM 回放" : "截图序列"} · 音频驱动时钟</span>
    </div>
    <div id="tl"><div class="head" id="ph"></div></div>
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
const fmt=ms=>{const s=Math.max(0,Math.round(ms/1000));return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')};
const esc=s=>String(s??'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const dur=D.meta.durationMs||1;
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
au.addEventListener('play',()=>{pp.textContent='⏸';syncRR(au.currentTime*1000)});
au.addEventListener('pause',()=>{pp.textContent='▶';if(rp)try{rp.pause()}catch(e){}});
au.addEventListener('seeked',()=>{if(!au.paused)syncRR(au.currentTime*1000);else if(rp){try{rp.pause(au.currentTime*1000)}catch(e){rp.play(au.currentTime*1000);rp.pause()}}});
au.addEventListener('timeupdate',()=>{
  const t=au.currentTime*1000;cur.textContent=fmt(t);
  ph.style.left=(Math.min(1,t/dur)*100)+'%';
  setShot(t);
  let act=null;for(const q of qEls){if(+q.dataset.t<=t)act=q;else break}
  if(act!==window.__lq){window.__lq=act;qEls.forEach(q=>q.classList.toggle('on',q===act));
    if(act&&document.getElementById('fol').checked)act.scrollIntoView({block:'nearest'})}
});
const seek=t=>{au.currentTime=t/1000;if(au.paused)au.play()};
pp.onclick=()=>{au.paused?au.play():au.pause()};
document.getElementById('spd').onchange=e=>{const v=+e.target.value;au.playbackRate=v;if(rp&&rp.setSpeed)try{rp.setSpeed(v)}catch(_){}};
/* ---------- timeline ticks ---------- */
const tl=document.getElementById('tl');
const MAJOR=new Set(['say','nav','click','mark','error','err','console','issue']);
for(const e of D.evs){
  if(e.t==null)continue;
  const bad=isBad(e),k=bad?'error':e.kind;
  if(!MAJOR.has(k)&&!bad)continue;
  const tk=document.createElement('div');
  tk.className='tk'+(bad||k==='mark'||k==='issue'?' big':'');
  tk.style.left=(Math.min(1,e.t/dur)*100)+'%';
  tk.style.background=kcol(e);tk.title=fmt(e.t)+' '+e.kind;
  tl.appendChild(tk);
}
tl.onclick=ev=>{const r=tl.getBoundingClientRect();seek(Math.max(0,Math.min(1,(ev.clientX-r.left)/r.width))*dur)};
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

export function renderPrompt(sessionDir: string, events: Ev[] = []): string {
  const vocab = [...new Set(
    events.flatMap(e => (e.kind === "mark" || e.kind === "click") && e.text ? [e.text] : [])
  )].slice(0, 30);
  return [
    "这是 Witness 录制的一段产品体验反馈（voice + click + 页面实况证据链）。",
    "",
    `证据目录: ${sessionDir}`,
    "",
    "请按以下顺序处理：",
    "1. 读 `session.md` —— 时间轴：每段语音（SAY）下方挂该时刻的 click/mark/net/console/mut 证据",
    "2. 每个问题：用 `selector`/`React 组件名` 在代码里定位；需要原始数据查 `events.jsonl`；视觉确认看 `shots/`",
    "3. 逐条修复；修不了的在汇报里标注原因和需要的补充证据",
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
  let rrJsonl: string | undefined;
  try { rrJsonl = readFileSync(join(dir, "rrweb.jsonl"), "utf8"); } catch {}
  if (!meta.title) {
    try {
      const snap = readdirSync(join(dir, "dom")).find(f => f.endsWith("-nav.html"));
      if (snap) meta = { ...meta, title: readFileSync(join(dir, "dom", snap), "utf8").match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || undefined };
    } catch {}
  }
  const prompt = renderPrompt(dir, events);
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
    "    session.md 证据时间轴 · events.jsonl 原始事件 · shots/ 截图 · audio.webm 录音",
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
