import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { fmt, type Ev } from "./events.js";
import type { Transcript } from "./transcribe.js";
import type { AssocMap } from "./associate.js";
import { rrwebUmd } from "./rr.js";
import { readFileSync } from "node:fs";

export interface Meta {
  url: string;
  startedAt: number;
  durationMs: number;
  viewport?: { width: number; height: number };
  title?: string;
}

const esc = (s?: string) => (s ?? "").replace(/</g, "&lt;").slice(0, 400);

// hide static-asset/dev-server network noise; keep docs, xhr/fetch, and failures
const STATIC = /(\.(js|mjs|cjs|css|map|png|jpe?g|gif|svg|ico|webp|avif|woff2?|ttf|otf|mp4|webm|vue|svelte|astro|tsx?|jsx|less|s[ac]ss|styl)(\?|#|$))|node_modules|@vite|@fs|@id|__vite|favicon|plugin-vue/i;
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

/** Human-facing reviewer: speech-run cards + screenshots + audio seek. Agents use session.md instead. */
export function renderReviewHtml(events: Ev[], meta: Meta, rrJsonl?: string): string {
  const rrSrc = rrJsonl?.trim() ? rrwebUmd() : null;
  const rrEmbed = rrSrc
    ? `<script>${rrSrc.replace(/<\/script/gi, "<\\/script")}</script><script>const RRE=[${rrJsonl!.trim().split("\n").join(",").replace(/</g, "\\u003c")}];</script>`
    : "";
  const data = JSON.stringify({
    meta,
    blocks: groupBlocks(events).map(b => ({
      head: b.head, at: b.at, issue: b.issue,
      frags: b.frags?.map(f => ({ t: f.segStart, text: f.text })),
      evs: b.evs,
    })),
  }).replace(/</g, "\\u003c");
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Witness · ${meta.url}</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;background:#f4f5f7;color:#1f2329;font:14px/1.7 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif}
  header{position:sticky;top:0;z-index:5;background:#fff;border-bottom:1px solid #e5e7eb;padding:10px 24px;display:flex;gap:14px;align-items:center;flex-wrap:wrap}
  header .u{font-weight:600;font-size:15px}
  header .m{color:#8a919e;font-size:12px}
  header audio{height:30px;margin-left:auto}
  main{max-width:880px;margin:0 auto;padding:20px 16px 80px}
  .blk{background:#fff;border:1px solid #e5e7eb;border-radius:10px;margin:14px 0;padding:14px 18px;box-shadow:0 1px 2px rgba(0,0,0,.03)}
  .at{display:inline-block;background:#eef2ff;color:#4a5cc4;border-radius:5px;font:12px/1.6 ui-monospace,Consolas,monospace;padding:1px 8px;margin-bottom:6px}
  q{display:block;cursor:pointer;padding:2px 8px;border-left:3px solid #c9d4ff;font-size:15px;color:#24272e;border-radius:0 4px 4px 0}
  q:hover{background:#f0f4ff}
  q .qt{color:#9aa3b2;font:11px ui-monospace,Consolas,monospace;margin-right:6px}
  .evs{margin-top:8px}
  .e{display:flex;gap:8px;padding:2px 0;font-size:13px;color:#4b5262;align-items:baseline}
  .e .t{color:#9aa3b2;font:11px ui-monospace,Consolas,monospace;flex:none}
  .e.bad{color:#c0342b;font-weight:500}
  .e.mark{color:#0e7a5f}
  .e .sel{font:12px ui-monospace,Consolas,monospace;color:#6b7280;word-break:break-all}
  details{margin-top:6px}
  summary{cursor:pointer;color:#9aa3b2;font-size:12px;user-select:none}
  .th{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
  .th img{width:180px;border:1px solid #dfe3ea;border-radius:6px;cursor:zoom-in;display:block}
  .th img:hover{border-color:#7a9bff}
  #lb{position:fixed;inset:0;background:rgba(15,17,22,.88);display:none;align-items:center;justify-content:center;z-index:9;cursor:zoom-out}
  #lb.on{display:flex}
  #lb img{max-width:94vw;max-height:94vh;border-radius:4px}
  .prelude{color:#8a919e}
  .issue{text-align:center;color:#b45309;font-weight:600;font-size:13px;padding:10px 0 2px;
    display:flex;align-items:center;gap:12px}
  .issue:before,.issue:after{content:"";flex:1;border-top:1px solid #e7d5b5}
  #rrbtn{background:#4a5cc4;border:0;color:#fff;padding:5px 14px;border-radius:5px;cursor:pointer;font-size:12px}
  #rrp{position:fixed;inset:0;background:rgba(15,17,22,.93);display:none;z-index:9;flex-direction:column;align-items:center;justify-content:center;gap:10px}
  #rrp.on{display:flex}
  #rrp .bar{display:flex;gap:16px;align-items:center;color:#e7e9f0;font-size:13px}
  #rrp .bar button{background:#4a5cc4;border:0;color:#fff;padding:4px 14px;border-radius:5px;cursor:pointer}
  #rrroot{background:#fff;border-radius:8px;overflow:auto;max-width:94vw;max-height:80vh}
  #film{position:fixed;bottom:0;left:0;right:0;background:#fff;border-top:1px solid #e5e7eb;padding:8px 14px;display:flex;gap:8px;overflow-x:auto;z-index:6;box-shadow:0 -2px 8px rgba(0,0,0,.05)}
  #film .fr{position:relative;flex:0 0 auto;cursor:pointer}
  #film .fr img{height:52px;border-radius:4px;border:1px solid #d7dce3;display:block}
  #film .fr:hover img{border-color:#7a9bff}
  #film .fr span{position:absolute;bottom:2px;left:2px;font:10px ui-monospace,Consolas,monospace;background:rgba(0,0,0,.6);color:#fff;padding:0 4px;border-radius:3px}
  #film .fr.cur img{border-color:#4a5cc4;box-shadow:0 0 0 2px #c9d4ff}
</style>
<header>
  <span class="u">${esc(meta.url)}</span>
  <span class="m">${new Date(meta.startedAt).toLocaleString()} · ${fmt(meta.durationMs)}</span>
  ${rrEmbed ? '<button id="rrbtn" title="DOM 回放">▶ 回放</button>' : ""}
  <audio id="au" controls src="audio.webm"></audio>
</header>
<main id="app"></main>
<div id="lb"><img id="lbi"></div>
${rrEmbed ? '<div id="rrp"><div class="bar"><b>DOM 回放</b><button id="rrplay">⏯</button><button id="rrx">✕ 关闭</button></div><div id="rrroot"></div></div>' : ""}
${rrEmbed}
<script>const D=${data};</script>
<script>
const app=document.getElementById('app'),au=document.getElementById('au'),lb=document.getElementById('lb'),lbi=document.getElementById('lbi');
const fmt=ms=>{const s=Math.max(0,Math.round(ms/1000));return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')};
const esc=s=>String(s??'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const QUIET=new Set(['mut','scroll','note','req','shot','_ui']);
const isBad=e=>e.kind==='error'||e.kind==='err'||(e.kind==='res'&&(e.status===0||e.status>=400))||(e.kind==='console'&&(e.level==='error'||e.level==='warning'));
const quiet=e=>QUIET.has(e.kind)||(e.kind==='res'&&e.status>0&&e.status<400)||(e.kind==='console'&&(e.level==='debug'||e.level==='info'));
const desc=e=>{
  switch(e.kind){
    case 'nav':return '打开 '+esc(e.url);
    case 'click':return '点击 '+esc(e.text||e.sel)+(e.kbd?' <span class=sel>(键盘触发)</span>':'');
    case 'mark':return e.region?'圈选区域 '+e.region.w+'×'+e.region.h:'标记 '+esc(e.text||e.sel)+' <span class=sel>'+esc(e.sel)+(e.react?.length?' · '+e.react.join(' › '):'')+'</span>';
    case 'console':return '控制台 '+e.level+'：'+esc(e.text.slice(0,140));
    case 'error':case 'err':return '报错：'+esc((e.message||e.text||'').slice(0,140));
    case 'req':return '请求 '+e.method+' '+esc(e.url.slice(0,120));
    case 'res':return '响应 '+e.status+' '+esc(e.url.slice(0,120));
    case 'mut':return 'DOM '+esc(e.sel)+' '+esc(e.summary.slice(0,70));
    case 'scroll':return '滚动 y='+e.y;
    case 'input':return '输入 '+esc(e.sel)+(e.masked?' 🔒':'');
    case 'key':return '按键 '+e.key;
    case 'note':return esc(e.text);
    default:return e.kind;
  }
};
const evHtml=(e,quietMode)=>{
  const d=document.createElement('div');
  d.className='e'+(isBad(e)?' bad':'')+(e.kind==='mark'?' mark':'');
  d.innerHTML='<span class=t>'+fmt(e.t)+'</span><span>'+desc(e)+'</span>';
  return d;
};
const FRAMES=[];
for(const b of D.blocks){
  if(b.issue!=null){
    const dv=document.createElement('div');dv.className='issue';
    dv.textContent='⏺ Issue #'+b.issue+' · '+fmt(b.at??0);
    app.appendChild(dv);continue;
  }
  const blk=document.createElement('div');blk.className='blk';
  if(b.head==='prelude'){
    const det=document.createElement('details');det.className='prelude';
    det.innerHTML='<summary>录制开始前的页面加载事件（'+b.evs.length+' 条）</summary>';
    const box=document.createElement('div');box.className='evs';
    b.evs.filter(e=>!quiet(e)).forEach(e=>box.appendChild(evHtml(e)));
    const nq=b.evs.length-box.childElementCount;
    if(nq)box.insertAdjacentHTML('beforeend','<div class=e><span class=t></span><span>…另有 '+nq+' 条静态资源/技术事件</span></div>');
    det.appendChild(box);blk.appendChild(det);app.appendChild(blk);continue;
  }
  blk.innerHTML='<span class=at>'+fmt(b.at??0)+'</span>';
  for(const f of (b.frags??[])){
    const q=document.createElement('q');
    q.innerHTML='<span class=qt>'+fmt(f.t)+'</span>'+esc(f.text);
    q.onclick=()=>{au.currentTime=f.t/1000;au.play()};
    blk.appendChild(q);
  }
  const shots=[],vis=[],hid=[];
  for(const e of b.evs){
    if(e.kind==='shot'){shots.push(e.path);FRAMES.push({t:e.t,p:e.path});continue}
    if(e.shot){shots.push(e.shot);FRAMES.push({t:e.t,p:e.shot});}
    (quiet(e)?hid:vis).push(e);
  }
  const box=document.createElement('div');box.className='evs';
  vis.forEach(e=>box.appendChild(evHtml(e)));
  if(!vis.length&&!shots.length&&!hid.length)box.innerHTML='<div class=e><span class=t></span><span>（说话期间页面无其他动作）</span></div>';
  blk.appendChild(box);
  if(shots.length){
    const th=document.createElement('div');th.className='th';
    [...new Set(shots)].slice(0,8).forEach(p=>{const i=new Image();i.src=p;i.loading='lazy';i.onclick=()=>{lbi.src=p;lb.classList.add('on')};th.appendChild(i)});
    blk.appendChild(th);
  }
  if(hid.length){
    const det=document.createElement('details');
    det.innerHTML='<summary>技术细节（'+hid.length+' 条 DOM/网络/滚动事件）</summary>';
    const hb=document.createElement('div');hb.className='evs';
    hid.forEach(e=>hb.appendChild(evHtml(e,true)));
    det.appendChild(hb);blk.appendChild(det);
  }
  app.appendChild(blk);
}
// filmstrip: every screenshot across the session, chronological — scrub ≈ pseudo-replay
const seen=new Set(),frames=FRAMES.filter(f=>f.p&&!seen.has(f.p)&&seen.add(f.p)).sort((a,b)=>a.t-b.t);
if(frames.length){
  const film=document.createElement('div');film.id='film';
  const cur=frames[0];
  frames.forEach(f=>{
    const d=document.createElement('div');d.className='fr'+(f===cur?' cur':'');
    d.innerHTML='<img loading="lazy" src="'+f.p+'"><span>'+fmt(f.t)+'</span>';
    d.onclick=()=>{lbi.src=f.p;lb.classList.add('on');
      document.querySelectorAll('#film .fr').forEach(x=>x.classList.remove('cur'));d.classList.add('cur')};
    film.appendChild(d);
  });
  document.body.appendChild(film);
  document.querySelector('main').style.paddingBottom='140px';
}
if(window.RRE&&window.rrweb){
  let rp=null,playing=false;
  const ov=document.getElementById('rrp'),pb=document.getElementById('rrplay');
  document.getElementById('rrbtn').onclick=()=>{
    ov.classList.add('on');
    if(!rp)rp=new rrweb.Replayer(RRE,{root:document.getElementById('rrroot'),speed:1.5,skipInactive:true,showWarning:false});
    rp.play();playing=true;
  };
  document.getElementById('rrx').onclick=()=>{ov.classList.remove('on');rp&&rp.pause();playing=false};
  pb.onclick=()=>{if(!rp)return;playing?rp.pause():rp.play();playing=!playing};
}
lb.onclick=()=>lb.classList.remove('on');
document.addEventListener('keydown',e=>{if(e.key==='Escape')lb.classList.remove('on')});
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
  const html = renderReviewHtml(events, meta, rrJsonl);
  const prompt = renderPrompt(dir, events);
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
