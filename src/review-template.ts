/**
 * Self-contained single-file human reviewer (`review.html`).
 * Zero external CDN dependencies — runs both over local HTTP and `file://`.
 */
import type { Ev } from "./events.js";
import type { Meta } from "./session.js";
import type { Segment } from "./segments.js";
import { groupBlocks, isNoisyEvent } from "./timeline.js";
import { rrwebUmd } from "./rr.js";

const escHtml = (s?: string) =>
  (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const safeHref = (url?: string) => {
  if (!url) return "#";
  return /^https?:\/\//i.test(url) ? escHtml(url) : "#";
};

const fmtStatic = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

export function renderReviewHtml(
  events: Ev[],
  meta: Meta,
  rrJsonl?: string,
  prompt?: string,
  segments?: Segment[],
): string {
  const rrTrim = rrJsonl?.trim() ?? "";
  const rrSrc = rrTrim ? rrwebUmd() : null;
  let rrOffset = 0;
  if (rrTrim && meta.startedAt) {
    const firstLine = rrTrim.slice(0, rrTrim.indexOf("\n") > 0 ? rrTrim.indexOf("\n") : rrTrim.length);
    try {
      const firstTs = JSON.parse(firstLine)?.timestamp;
      if (typeof firstTs === "number") {
        const diff = firstTs - meta.startedAt;
        if (diff > 0 && diff < 60_000) rrOffset = diff;
      }
    } catch {}
  }

  const rrEmbed = rrSrc
    ? `<script>${rrSrc.replace(/<\/script/gi, "<\\/script")}</script><script>window.RRE=[${rrTrim.split("\n").filter(Boolean).join(",").replace(/</g, "\\u003c")}];</script>`
    : "";

  const blocks = groupBlocks(events).map(b => ({
    head: b.head,
    at: b.at,
    issue: b.issue,
    // Always populate frags from b.says (both 1-frag and multi-frag runs) so single utterances are never dropped
    frags: b.says?.map(f => ({
      t: f.segStart,
      end: f.segEnd,
      text: f.text,
      lowConf: f.lowConf || undefined,
    })),
  }));

  const segSummary = (segments ?? []).map(s => ({
    n: s.n,
    from: s.from,
    to: s.to,
    text: s.text,
    explicit: s.explicit,
    suspects: s.suspects.slice(0, 4),
    deadClicks: s.deadClicks.length,
    errors: s.errors.length,
    gaps: s.gaps,
    shots: s.shots,
  }));

  const data = JSON.stringify({
    meta,
    rrOffset,
    prompt: prompt ?? null,
    blocks,
    segments: segSummary,
    evs: events.map(e => (isNoisyEvent(e) ? { ...e, _q: 1 } : e)),
  }).replace(/</g, "\\u003c");

  const titleText = escHtml(meta.title ?? meta.url);
  const urlText = escHtml(meta.url);
  const urlHref = safeHref(meta.url);
  const dateStr = escHtml(new Date(meta.startedAt).toLocaleString());
  const durStr = fmtStatic(meta.durationMs);
  const asrPill = meta.asr ? `<span class="pill-meta">${escHtml(meta.asr)}</span>` : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Witness · ${urlText}</title>
<style>
  :root{
    --bg:#f6f5f2;--panel:#fff;--warm:#f1f0ec;--line:rgba(16,18,22,.08);--line2:rgba(16,18,22,.16);
    --ink:#171921;--dim:#5a606e;--faint:#8f96a3;--acc:#ff4f00;--acc-soft:#fff1ea;--acc-ink:#c23b00;
    --err:#dc2626;--err-soft:#fef2f2;--ok:#16a34a;--mono:ui-monospace,"SF Mono","Cascadia Code",Consolas,monospace;
    --sans:-apple-system,"SF Pro Text","Segoe UI","Microsoft YaHei",system-ui,sans-serif;
  }
  *{box-sizing:border-box}
  html{-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
  body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.55 var(--sans);overflow-x:hidden}
  ::selection{background:#ffdcc9}
  .sp{flex:1;min-width:8px}

  /* Header */
  header{position:sticky;top:0;z-index:20;background:rgba(255,255,255,.88);backdrop-filter:saturate(1.5) blur(14px);
    -webkit-backdrop-filter:saturate(1.5) blur(14px);border-bottom:1px solid var(--line);padding:10px 20px;
    display:flex;gap:12px;align-items:center;flex-wrap:wrap}
  .h-left{display:flex;align-items:center;gap:12px;min-width:0;flex:1 1 320px}
  .h-right{display:flex;align-items:center;gap:8px;flex:none}
  .brand{font-weight:800;font-size:15.5px;letter-spacing:-.025em;white-space:nowrap;flex:none;display:inline-flex;align-items:baseline}
  .brand .dl{position:relative;display:inline-block}
  .brand .dl:after{content:"";position:absolute;top:.03em;left:50%;transform:translateX(-50%);width:.24em;height:.24em;border-radius:50%;background:var(--acc);animation:br 2.6s ease-in-out infinite}
  @keyframes br{0%,100%{opacity:.4}50%{opacity:1}}
  .meta-col{min-width:0;display:flex;flex-direction:column;gap:1px}
  .meta-top{display:flex;align-items:center;gap:8px;min-width:0}
  header .u{font-weight:650;font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;letter-spacing:-.01em}
  header .m{color:var(--faint);font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  header a.m{text-decoration:none;color:var(--dim)}
  header a.m:hover{text-decoration:underline;color:var(--ink)}
  .pill-meta{font:600 10px var(--mono);color:var(--dim);background:var(--warm);border:1px solid var(--line);padding:1px 7px;border-radius:99px;white-space:nowrap}

  .btn{border:1px solid var(--line2);background:#fff;color:var(--ink);padding:7px 14px;border-radius:99px;cursor:pointer;
    font:600 12.5px/1 var(--sans);white-space:nowrap;display:inline-flex;align-items:center;gap:6px;
    box-shadow:0 1px 2px rgba(16,18,22,.05);transition:all .14s}
  .btn:hover{border-color:rgba(16,18,22,.3);transform:translateY(-1px);box-shadow:0 4px 12px -4px rgba(16,18,22,.16)}
  .btn:active{transform:none}
  .btn.pri{background:var(--ink);color:#fff;border-color:var(--ink)}
  .btn.pri:hover{background:#000}
  .btn.acc{background:var(--acc);color:#fff;border-color:var(--acc)}
  .btn.acc:hover{background:var(--acc-ink)}
  .btn.sm{padding:5px 10px;font-size:11.5px}
  .btn.ghost{border-color:transparent;background:transparent;box-shadow:none;color:var(--dim)}
  .btn.ghost:hover{background:var(--warm);color:var(--ink);transform:none}

  @media(max-width:760px){
    header{padding:10px 14px;gap:8px}
    .h-left{flex:1 1 100%}
    .h-right{width:100%;justify-content:space-between}
    header .u{max-width:none}
    .hide-sm{display:none}
  }

  /* Layout */
  .wrap{display:grid;grid-template-columns:minmax(0,1.52fr) minmax(350px,1fr);gap:18px;max-width:1480px;margin:0 auto;padding:18px 20px 56px}
  @media(max-width:980px){.wrap{grid-template-columns:1fr;padding:14px 14px 48px}}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:16px;overflow:hidden;
    box-shadow:0 1px 2px rgba(16,18,22,.03),0 14px 36px -24px rgba(16,18,22,.14)}

  /* Stage bar & viewport */
  .sbar{display:flex;align-items:center;gap:8px;padding:8px 14px;border-bottom:1px solid var(--line);background:#fafaf8;flex-wrap:wrap}
  .seg{display:inline-flex;background:#ecebe7;border-radius:9px;padding:2px;gap:2px}
  .seg button{border:0;background:transparent;color:var(--dim);font:600 11.5px var(--sans);padding:4px 10px;border-radius:7px;cursor:pointer;transition:all .12s;white-space:nowrap}
  .seg button:hover{color:var(--ink)}
  .seg button.on{background:#fff;color:var(--ink);box-shadow:0 1px 3px rgba(16,18,22,.12)}
  .seg button:disabled{opacity:.4;cursor:not-allowed}
  .sbar-info{font:500 11px var(--mono);color:var(--faint);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  #stage{position:relative;background:radial-gradient(130% 150% at 50% 0%,#1f222b 0%,#0f1115 72%);aspect-ratio:16/10;
    display:flex;align-items:center;justify-content:center;overflow:hidden}
  #stage:after{content:"";position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 0 0 1px rgba(255,255,255,.06),inset 0 -50px 80px -50px rgba(0,0,0,.5)}
  #stage img{max-width:100%;max-height:100%;display:block;transition:opacity .12s;cursor:zoom-in}
  #rrhold{transform-origin:top left;position:absolute;top:0;left:0}
  #emptymsg{color:#818a9b;font-size:13px;padding:32px;text-align:center}
  .stage-cap{position:absolute;bottom:10px;left:12px;z-index:3;background:rgba(15,17,21,.76);color:#e2e5ec;
    font:500 11px var(--mono);padding:3px 9px;border-radius:6px;backdrop-filter:blur(6px);pointer-events:none;display:none}
  .stage-cap.on{display:block}

  /* Transport */
  .tr{display:flex;align-items:center;gap:10px;padding:11px 14px;border-top:1px solid var(--line);flex-wrap:wrap}
  .tr .pp{width:36px;height:36px;border-radius:50%;border:0;background:var(--ink);color:#fff;cursor:pointer;flex:none;
    display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px -2px rgba(16,18,22,.36);transition:transform .12s,background .12s}
  .tr .pp:hover{transform:scale(1.06);background:#000}
  .tr .sk{border:1px solid var(--line);background:var(--warm);color:var(--dim);border-radius:8px;padding:5px 8px;font:600 11px var(--mono);cursor:pointer}
  .tr .sk:hover{color:var(--ink);border-color:var(--line2)}
  .tr .tc{font:12px/1 var(--mono);color:var(--faint);font-variant-numeric:tabular-nums;white-space:nowrap}
  .tr .tc b{color:var(--ink);font-weight:600}
  .spd{display:inline-flex;background:var(--warm);border-radius:8px;padding:2px;gap:1px}
  .spd b{padding:3px 8px;font-size:11px;font-weight:600;color:var(--faint);border-radius:6px;cursor:pointer;user-select:none;transition:all .12s}
  .spd b:hover{color:var(--dim)}
  .spd b.on{background:#fff;color:var(--ink);box-shadow:0 1px 3px rgba(16,18,22,.12)}
  .vol{display:inline-flex;align-items:center;gap:5px}
  .vol button{border:0;background:none;cursor:pointer;font-size:14px;padding:2px 4px;color:var(--dim)}
  .vol input{width:56px;accent-color:var(--acc);cursor:pointer}
  .sw{display:inline-flex;align-items:center;gap:6px;cursor:pointer;user-select:none;font-size:11.5px;color:var(--dim)}
  .sw input{display:none}
  .sw i{width:28px;height:16px;border-radius:99px;background:#dfe2e7;position:relative;transition:background .16s;flex:none}
  .sw i:after{content:"";position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(16,18,22,.28);transition:left .16s}
  .sw input:checked+i{background:var(--acc)}
  .sw input:checked+i:after{left:14px}
  .tr .clk{color:var(--faint);font:500 11px var(--mono)}

  /* Timeline + zoom + filterable legend */
  .tl-ctrl{display:flex;align-items:center;gap:8px;padding:4px 14px 4px;flex-wrap:wrap}
  .tl-ctrl .lbl{font:600 10.5px var(--mono);color:var(--faint);text-transform:uppercase;letter-spacing:.06em}
  .tl-err{margin-left:auto;border:1px solid #fecaca;background:var(--err-soft);color:var(--err);border-radius:99px;padding:3px 10px;
    font:600 11px var(--mono);cursor:pointer;display:inline-flex;align-items:center;gap:5px}
  .tl-err:hover{background:#fee2e2}
  .tl-err[hidden]{display:none}
  #tlscroll{overflow-x:auto;margin:2px 14px 4px;padding-top:30px;margin-top:-24px;scrollbar-width:thin}
  #tlw{position:relative;min-width:100%}
  #tlw .bubble{position:absolute;top:-28px;transform:translateX(-50%);background:var(--ink);color:#fff;font-size:11px;
    padding:4px 9px;border-radius:7px;white-space:nowrap;pointer-events:none;z-index:5;display:none;max-width:300px;
    overflow:hidden;text-overflow:ellipsis;box-shadow:0 8px 20px -8px rgba(16,18,22,.5)}
  #tlw .bubble b{font-family:var(--mono);color:#ff9c6b;margin-right:5px}
  #tlw.scrub .bubble,#tlw:hover .bubble{display:block}
  #tl{position:relative;height:60px;background:
    linear-gradient(to bottom,transparent 19px,rgba(16,18,22,.05) 19px,rgba(16,18,22,.05) 20px,transparent 20px,transparent 39px,rgba(16,18,22,.05) 39px,rgba(16,18,22,.05) 40px,transparent 40px),
    #f5f4f0;border:1px solid var(--line);border-radius:10px;cursor:pointer;overflow:hidden;touch-action:none}
  #tl .tk{position:absolute;width:3px;height:11px;border-radius:2px;opacity:.88;transition:opacity .12s}
  #tl .tk.blk{height:11px;opacity:.75;border-radius:4px}
  #tl .tk.big{width:4px}
  #tl .tk.off{display:none}
  #tl .head{position:absolute;top:0;bottom:0;width:2px;background:var(--acc);z-index:3;pointer-events:none}
  #tl .head:after{content:"";position:absolute;top:-1px;left:-4px;width:10px;height:10px;border-radius:50%;background:var(--acc);box-shadow:0 0 0 3px rgba(255,79,0,.22)}
  .legend{display:flex;gap:6px;flex-wrap:wrap;padding:6px 14px 12px}
  .lg-chip{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--line);background:#fff;color:var(--dim);
    border-radius:99px;padding:3px 9px;font:500 11px var(--sans);cursor:pointer;user-select:none;transition:all .12s}
  .lg-chip:hover{border-color:var(--line2);color:var(--ink)}
  .lg-chip.off{opacity:.38;text-decoration:line-through}
  .lg-chip i{display:inline-block;width:7px;height:7px;border-radius:2.5px}

  /* Inspector panel */
  .tabs{display:flex;gap:4px;padding:6px;border-bottom:1px solid var(--line);background:#fafaf8}
  .tabs b{flex:1;text-align:center;padding:8px 4px;font-size:12.5px;font-weight:600;color:var(--faint);cursor:pointer;border-radius:9px;user-select:none;transition:all .14s}
  .tabs b:hover{color:var(--dim)}
  .tabs b.on{color:var(--ink);background:#fff;box-shadow:0 1px 4px rgba(16,18,22,.1),0 0 0 1px rgba(16,18,22,.04)}
  .tabs .cnt{font:600 10px var(--mono);background:var(--warm);color:var(--dim);padding:1px 5px;border-radius:99px;margin-left:4px}
  .tabs b.on .cnt{background:var(--acc-soft);color:var(--acc-ink)}
  .pane{display:none;max-height:calc(100vh - 205px);min-height:360px;overflow-y:auto;padding:10px 12px}
  .pane.on{display:block}
  @media(max-width:980px){.pane{max-height:560px}}
  .pane::-webkit-scrollbar{width:8px}
  .pane::-webkit-scrollbar-thumb{background:#e1e3e8;border-radius:8px;border:2px solid #fff}

  /* Search & filter toolbar inside panes */
  .pbar{display:flex;flex-direction:column;gap:7px;padding:2px 2px 10px;margin-bottom:8px;border-bottom:1px solid var(--line);position:sticky;top:-10px;background:#fff;z-index:4}
  .sbox{width:100%;border:1px solid var(--line2);border-radius:9px;padding:7px 11px;font:12.5px var(--sans);background:#fafaf9;color:var(--ink);outline:none}
  .sbox:focus{border-color:var(--acc);background:#fff}
  .chips{display:flex;gap:5px;flex-wrap:wrap;align-items:center}
  .fchip{border:1px solid var(--line);background:#fafaf9;color:var(--dim);border-radius:99px;padding:3px 9px;font:600 11px var(--sans);cursor:pointer;transition:all .12s}
  .fchip:hover{border-color:var(--line2);color:var(--ink)}
  .fchip.on{background:var(--ink);color:#fff;border-color:var(--ink)}
  .fchip.err.on{background:var(--err);border-color:var(--err)}

  /* Transcript */
  .q{display:flex;gap:8px;align-items:flex-start;cursor:pointer;padding:8px 10px;border-radius:9px;font-size:13.5px;color:#262a34;line-height:1.5;transition:background .12s;margin:2px 0}
  .q:hover{background:#f5f4f0}
  .q.on{background:var(--acc-soft);box-shadow:inset 3px 0 0 var(--acc)}
  .q .qt{color:var(--faint);font:10.5px var(--mono);flex:none;margin-top:3px;font-variant-numeric:tabular-nums}
  .q .qtxt{flex:1;min-width:0}
  .q .lcf{font:600 10px var(--mono);color:#b45309;background:#fef3c7;padding:1px 6px;border-radius:4px;margin-left:6px;white-space:nowrap}

  /* Events */
  .e{display:flex;gap:8px;padding:6px 8px;font-size:12.5px;color:var(--dim);align-items:baseline;border-radius:8px;cursor:pointer;transition:background .12s}
  .e:hover{background:#f5f4f0}
  .e .t{color:var(--faint);font:10.5px var(--mono);flex:none;font-variant-numeric:tabular-nums}
  .e i{flex:none;width:7px;height:7px;border-radius:3px;margin-top:4px}
  .e.bad{color:#b91c1c;background:#fff7f7;font-weight:500}
  .e.bad:hover{background:#fee2e2}
  .e.qnoise{opacity:.65}
  .e>span{min-width:0;word-break:break-word;flex:1}
  .e .sel{font:11px var(--mono);color:var(--faint);word-break:break-all}
  .e .thumb{height:34px;border-radius:6px;border:1px solid var(--line);margin-left:auto;flex:none;cursor:zoom-in;transition:transform .12s}
  .e .thumb:hover{transform:scale(1.06)}

  /* Issues (selectable for AI) */
  .is{border:1px solid var(--line);border-radius:12px;padding:12px 13px;margin:0 2px 10px;cursor:pointer;transition:all .14s;background:#fff;display:flex;gap:10px;align-items:flex-start}
  .is:hover{border-color:#ffb99d;box-shadow:0 6px 20px -12px rgba(255,79,0,.28)}
  .is.sel-on{border-color:#ffd0bc;background:#fffdfb}
  .is input[type=checkbox]{margin-top:3px;accent-color:var(--acc);width:15px;height:15px;cursor:pointer;flex:none}
  .is-body{flex:1;min-width:0}
  .is .top{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:5px}
  .is .at{font:600 10.5px var(--mono);background:var(--acc-soft);color:var(--acc-ink);padding:2px 8px;border-radius:99px;font-variant-numeric:tabular-nums}
  .is .sev{font:700 10px var(--mono);letter-spacing:.05em;padding:2px 8px;border-radius:99px;background:#eef0f6;color:#4a5cc4;text-transform:uppercase}
  .is .sev.bug{background:#fdecec;color:#b91c1c}
  .is .sev.dead{background:#fef3c7;color:#92400e}
  .is .ti{font-weight:600;font-size:13px;margin:3px 0 3px;color:var(--ink);line-height:1.45}
  .is .ds{font-size:11.5px;color:var(--faint);word-break:break-word}

  /* Agent tab + handoff builder + shot gallery */
  .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--line);border:1px solid var(--line);border-radius:12px;overflow:hidden;margin:2px 0 12px}
  .stats div{background:#fff;padding:10px 12px}
  .stats b{display:block;font-size:17px;font-weight:750;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
  .stats span{font-size:10.5px;color:var(--faint)}
  .hbuild{border:1px solid var(--line);border-radius:12px;padding:12px;background:#fafaf9;margin-bottom:12px}
  .hbuild h4{margin:0 0 8px;font:700 11.5px var(--mono);text-transform:uppercase;letter-spacing:.08em;color:var(--dim)}
  .hbuild .note-in{width:100%;border:1px solid var(--line2);border-radius:8px;padding:7px 10px;font:12px var(--sans);background:#fff;margin:8px 0}
  .hbuild pre{margin:8px 0 10px;background:#13141a;color:#d6d4cc;border-radius:9px;padding:10px 12px;font:11px/1.6 var(--mono);max-height:170px;overflow:auto;white-space:pre-wrap;word-break:break-word}
  .files{display:flex;flex-direction:column;gap:5px;margin:10px 0}
  .frow{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 10px;border:1px solid var(--line);border-radius:8px;background:#fff;font:12px var(--mono)}
  .frow a{color:#3b5bdb;text-decoration:none}
  .frow a:hover{text-decoration:underline}
  .gal{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:6px;margin-top:8px}
  .gitem{position:relative;border:1px solid var(--line);border-radius:8px;overflow:hidden;background:#111;cursor:pointer;aspect-ratio:16/10}
  .gitem img{width:100%;height:100%;object-fit:cover;display:block}
  .gitem span{position:absolute;bottom:3px;right:3px;background:rgba(0,0,0,.78);color:#fff;font:600 9.5px var(--mono);padding:2px 5px;border-radius:4px;border:1px solid rgba(255,255,255,.18);cursor:pointer}
  .gitem span:hover{background:var(--acc);border-color:var(--acc)}
  .hint{font-size:12px;color:var(--faint);margin:6px 2px;line-height:1.55}

  /* Modals & Toast */
  .ov{position:fixed;inset:0;background:rgba(10,12,16,.8);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
    display:none;align-items:center;justify-content:center;z-index:40;padding:20px}
  .ov.on{display:flex}
  #lb{cursor:zoom-out}
  #lb img{max-width:94vw;max-height:92vh;border-radius:10px;box-shadow:0 32px 90px -20px rgba(0,0,0,.65)}
  .mbox{background:#fff;border:1px solid var(--line);border-radius:14px;max-width:min(760px,94vw);max-height:86vh;width:100%;
    display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,.35)}
  .mhead{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--line);font:700 13px var(--mono)}
  .mbody{padding:14px 16px;overflow:auto;font:12px/1.65 var(--mono);white-space:pre-wrap;word-break:break-word;background:#fafaf9;color:var(--ink)}
  .kgrid{display:grid;grid-template-columns:auto 1fr;gap:8px 16px;font-family:var(--sans);font-size:13px;align-items:center}
  .kgrid kbd{font:600 11px var(--mono);background:#fff;border:1px solid var(--line2);border-bottom-width:2px;border-radius:5px;padding:2px 7px;justify-self:start}
  #toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--ink);color:#fff;padding:9px 18px;
    border-radius:99px;font-size:12.5px;opacity:0;transition:opacity .2s;z-index:50;pointer-events:none;box-shadow:0 10px 28px -8px rgba(0,0,0,.45)}
  #toast.on{opacity:1}
</style>
</head>
<body>
<header>
  <div class="h-left">
    <span class="brand" aria-label="Witness">w<span class="dl" aria-hidden="true">ı</span>tness</span>
    <div class="meta-col">
      <div class="meta-top">
        <span class="u">${titleText}</span>
        ${asrPill}
      </div>
      <div class="meta-top">
        <a class="m" href="${urlHref}" target="_blank" rel="noopener">${urlText}</a>
        <span class="m hide-sm">· ${dateStr} · ${durStr}</span>
      </div>
    </div>
  </div>
  <div class="h-right">
    <button class="btn ghost sm" id="helpbtn" title="Keyboard shortcuts (?)">? Keys</button>
    <button class="btn sm" id="cfgai" title="Customize AI handoff parameters">⚙ Handoff</button>
    <button class="btn pri sm" id="copyai" title="Copy agent handoff using current parameters">⧉ Copy for AI</button>
  </div>
</header>

<div class="wrap">
  <div class="card">
    <div class="sbar">
      <div class="seg" id="modeseg">
        <button type="button" data-m="rr" id="m-rr">DOM Replay</button>
        <button type="button" data-m="shot" id="m-shot">Screenshots</button>
      </div>
      <span class="sbar-info" id="sinfo"></span>
      <span class="sp"></span>
      <span class="sbar-info" id="clkmode"></span>
    </div>
    <div id="stage"><div class="stage-cap" id="scap"></div></div>
    <div class="tr">
      <button class="sk" id="rew" title="Back 5s (←)">-5s</button>
      <button class="pp" id="pp" title="Play / Pause (Space)" aria-label="Play or pause">
        <svg viewBox="0 0 12 12" width="13" height="13"><path d="M3.6 2.1v7.8c0 .62.68.99 1.2.66l6-3.9a.78.78 0 0 0 0-1.32l-6-3.9c-.52-.33-1.2.04-1.2.66z" fill="currentColor"/></svg>
      </button>
      <button class="sk" id="fwd" title="Forward 5s (→)">+5s</button>
      <span class="tc"><b id="cur">00:00</b> / ${durStr}</span>
      <span class="spd"><b data-v="0.5">0.5×</b><b data-v="1" class="on">1×</b><b data-v="1.5">1.5×</b><b data-v="2">2×</b><b data-v="4">4×</b></span>
      <span class="vol" id="volbox">
        <button type="button" id="mute" title="Mute (M)" aria-label="Toggle mute">🔊</button>
        <input type="range" id="vol" min="0" max="1" step="0.05" value="1" aria-label="Volume">
      </span>
      <label class="sw"><input type="checkbox" id="fol" checked><i></i>follow</label>
    </div>
    <div class="tl-ctrl">
      <span class="lbl">Timeline</span>
      <div class="seg" id="zoomseg">
        <button type="button" data-z="1" class="on">1×</button>
        <button type="button" data-z="2">2×</button>
        <button type="button" data-z="4">4×</button>
      </div>
      <button type="button" class="tl-err" id="nexterr" hidden title="Jump to next anomaly (E)">⚠ Next error</button>
    </div>
    <div id="tlscroll">
      <div id="tlw"><div id="tl"><div class="head" id="ph"></div></div><div class="bubble" id="bub"></div></div>
    </div>
    <div class="legend" id="lg"></div>
  </div>

  <div class="card">
    <div class="tabs">
      <b data-p="tp" class="on">Transcript<span class="cnt" id="c-tp">0</span></b>
      <b data-p="ep">Events<span class="cnt" id="c-ep">0</span></b>
      <b data-p="ip">Issues<span class="cnt" id="c-ip">0</span></b>
      <b data-p="ap">Agent</b>
    </div>
    <div class="pane on" id="tp"></div>
    <div class="pane" id="ep"></div>
    <div class="pane" id="ip"></div>
    <div class="pane" id="ap"></div>
  </div>
</div>

<div class="ov" id="lb" aria-hidden="true"><img id="lbi" alt="Screenshot preview"></div>
<div class="ov" id="fmod" aria-hidden="true">
  <div class="mbox">
    <div class="mhead"><span id="ftitle">Preview</span><button class="btn sm" id="fclose">Close</button></div>
    <div class="mbody" id="fbody"></div>
  </div>
</div>
<div class="ov" id="kmod" aria-hidden="true">
  <div class="mbox" style="max-width:440px">
    <div class="mhead"><span>Keyboard Shortcuts</span><button class="btn sm" id="kclose">Close</button></div>
    <div class="mbody" style="white-space:normal">
      <div class="kgrid">
        <kbd>Space</kbd><span>Play / pause</span>
        <kbd>← / →</kbd><span>Seek -5s / +5s</span>
        <kbd>J / K</kbd><span>Next / previous speech segment</span>
        <kbd>E</kbd><span>Jump to next error or failed request</span>
        <kbd>M</kbd><span>Mute / unmute audio</span>
        <kbd>Esc</kbd><span>Close preview or modal</span>
      </div>
    </div>
  </div>
</div>
<div id="toast"></div>
<audio id="au" src="audio.webm" preload="auto"></audio>
${rrEmbed}
<script>const D=${data};</script>
<script>
(() => {
  const au = document.getElementById('au'), lb = document.getElementById('lb'), lbi = document.getElementById('lbi');
  const stage = document.getElementById('stage'), scap = document.getElementById('scap');
  const ph = document.getElementById('ph'), cur = document.getElementById('cur'), pp = document.getElementById('pp');
  const sinfo = document.getElementById('sinfo'), clkmode = document.getElementById('clkmode');

  const fmt = ms => {
    const s = Math.max(0, Math.round(ms / 1000));
    return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dur = Math.max(1, D.meta.durationMs || (D.evs.length ? D.evs[D.evs.length - 1].t : 1000));
  const toast = m => {
    const t = document.getElementById('toast');
    t.textContent = m; t.classList.add('on');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('on'), 1800);
  };

  /* ---------- audio bias + pause-interval mapping ---------- */
  const micNote = D.evs.find(e => e.kind === 'note' && (e.tag === 'mic-start' || /mic recording|microphone/i.test(e.text || '')));
  const bias = micNote ? micNote.t : 0;
  const pauses = [];
  {
    let pStart = null;
    for (const e of D.evs) {
      if (e.kind === 'note' && e.text === 'paused' && pStart == null) pStart = e.t;
      else if (e.kind === 'note' && e.text === 'resumed' && pStart != null) { pauses.push([pStart, e.t]); pStart = null; }
    }
  }
  const mediaToSession = mMs => {
    let t = mMs + bias;
    for (const [a, b] of pauses) if (t >= a) t += (b - a);
    return Math.min(dur, Math.max(0, t));
  };
  const sessionToMedia = tMs => {
    let dropped = 0;
    for (const [a, b] of pauses) {
      if (tMs >= b) dropped += (b - a);
      else if (tMs > a) dropped += (tMs - a);
    }
    return Math.max(0, tMs - bias - dropped);
  };

  /* ---------- category colors & helpers ---------- */
  const KC = {
    say: '#7c3aed', nav: '#2563eb', click: '#0891b2', mark: '#db2777', note: '#d97706',
    key: '#d97706', input: '#475569', scroll: '#94a3b8', mut: '#94a3b8', shot: '#64748b',
    req: '#6366f1', res: '#6366f1', ws: '#0284c7', console: '#d97706', error: '#dc2626',
    issue: '#ff4f00', _ui: '#cbd5e1'
  };
  const isBad = e => e.kind === 'error' || (e.kind === 'res' && (e.status === 0 || e.status >= 400)) || (e.kind === 'console' && (e.level === 'error' || e.level === 'warning'));
  const catOf = e => {
    if (e.kind === 'say') return 'say';
    if (e.kind === 'error') return 'error';
    if (e.kind === 'res' && (e.status === 0 || e.status >= 400)) return 'fail';
    if (e.kind === 'console') return 'console';
    if (e.kind === 'nav') return 'nav';
    if (e.kind === 'click' || e.kind === 'input' || e.kind === 'key') return 'click';
    if (e.kind === 'mark' || e.kind === 'issue') return 'mark';
    if (e.kind === 'note') return 'note';
    return 'other';
  };
  const kcol = e => isBad(e) ? '#dc2626' : (KC[e.kind] || '#94a3b8');
  const LDEFS = [
    ['say', 'speech', '#7c3aed'],
    ['nav', 'nav', '#2563eb'],
    ['click', 'clicks', '#0891b2'],
    ['mark', 'marks', '#db2777'],
    ['note', 'notes', '#d97706'],
    ['console', 'console', '#eab308'],
    ['error', 'errors', '#dc2626'],
    ['fail', 'failed reqs', '#ef4444'],
  ];
  const hiddenCats = new Set();

  const desc = e => {
    switch (e.kind) {
      case 'nav': return 'open ' + esc(e.url);
      case 'click': return 'click ' + esc(e.text || e.sel) + (e.kbd ? ' <span class=sel>(keyboard)</span>' : '') + ' <span class=sel>' + esc(e.sel) + '</span>';
      case 'say': return '🎙 ' + esc(e.text);
      case 'mark': return e.region
        ? 'region ' + e.region.w + '×' + e.region.h
        : 'mark ' + esc(e.text || e.sel) + ' <span class=sel>' + esc(e.sel) + (e.react && e.react.length ? ' · ' + esc(e.react.join(' › ')) : '') + '</span>';
      case 'console': return 'console ' + esc(e.level) + ': ' + esc((e.text || '').slice(0, 140));
      case 'error': return 'error: ' + esc((e.message || '').slice(0, 140));
      case 'req': return 'req ' + esc(e.method) + ' ' + esc((e.url || '').slice(0, 110));
      case 'res': return 'res ' + esc(e.status === 0 ? 'FAILED' : e.status) + ' ' + esc((e.url || '').slice(0, 110)) + (e.timing != null ? ' <span class=sel>' + e.timing + 'ms</span>' : '');
      case 'ws': return 'ws ' + esc(e.dir) + ' ' + esc((e.url || '').slice(0, 80)) + ' ' + esc((e.data || '').slice(0, 100));
      case 'mut': return 'DOM ' + esc(e.sel) + ' ' + esc((e.summary || '').slice(0, 80));
      case 'scroll': return 'scroll y=' + e.y;
      case 'input': return 'input ' + esc(e.sel) + (e.masked ? ' 🔒' : (e.value ? ' “' + esc(e.value.slice(0, 40)) + '”' : ''));
      case 'key': return 'key ' + esc(e.key);
      case 'note': return esc(e.text);
      case 'dom': return 'DOM snapshot <span class=sel>' + esc(e.path) + '</span>';
      case 'shot': return 'shot <span class=sel>' + esc(e.path) + '</span>';
      case 'issue': return '⏺ Issue #' + e.n + ' boundary';
      default: return esc(e.kind);
    }
  };

  /* ---------- frames & stage (rrweb + screenshots dual mode) ---------- */
  const seenShot = new Set(), frames = [];
  for (const e of D.evs) {
    const p = e.kind === 'shot' ? e.path : e.shot;
    if (p && !seenShot.has(p)) { seenShot.add(p); frames.push({ t: e.t, p, tag: e.kind }); }
  }
  frames.sort((a, b) => a.t - b.t);
  const frameAt = t => { let f = null; for (const x of frames) { if (x.t <= t) f = x; else break; } return f; };

  let rp = null, rrReady = false;
  const rrHold = document.createElement('div');
  rrHold.id = 'rrhold';
  const sImg = document.createElement('img');
  sImg.alt = 'Session screenshot';
  sImg.style.display = 'none';
  sImg.onclick = () => { if (sImg.src) openLb(sImg.src); };
  stage.append(rrHold, sImg);

  if (window.RRE && window.rrweb) {
    try {
      const stripAutoplay = n => {
        if (!n || typeof n !== 'object') return;
        if (n.attributes && (n.tagName === 'video' || n.tagName === 'audio')) {
          delete n.attributes.autoplay;
          delete n.attributes.rr_mediaState;
        }
        if (Array.isArray(n.childNodes)) n.childNodes.forEach(stripAutoplay);
      };
      for (const ev of RRE) {
        if (ev && ev.type === 2 && ev.data && ev.data.node) stripAutoplay(ev.data.node);
        if (ev && ev.type === 3 && ev.data && ev.data.source === 7) ev.data.type = 1; // neutralize rrweb media play events
      }
      rp = new rrweb.Replayer(RRE, { root: rrHold, speed: 1, skipInactive: true, showWarning: false, mouseTail: false });
      rrReady = true;
      requestAnimationFrame(() => {
        const w = rrHold.querySelector('.replayer-wrapper');
        if (!w) return;
        const fit = () => {
          const ww = w.offsetWidth || D.meta.viewport?.width || 1280;
          const hh = w.offsetHeight || D.meta.viewport?.height || 800;
          const s = Math.min(stage.clientWidth / ww, stage.clientHeight / hh);
          rrHold.style.transform = 'scale(' + s + ')';
          rrHold.style.left = ((stage.clientWidth - ww * s) / 2) + 'px';
          rrHold.style.top = ((stage.clientHeight - hh * s) / 2) + 'px';
        };
        fit();
        new ResizeObserver(fit).observe(stage);
      });
    } catch {}
  }

  let stageMode = rrReady ? 'rr' : (frames.length ? 'shot' : 'none');
  const mRR = document.getElementById('m-rr'), mShot = document.getElementById('m-shot');
  mRR.disabled = !rrReady;
  mShot.disabled = !frames.length;
  mShot.textContent = 'Screenshots (' + frames.length + ')';

  let curShot = '';
  const setShot = t => {
    if (!frames.length) return;
    const f = frameAt(t) || frames[0];
    if (f && f.p !== curShot) {
      curShot = f.p;
      sImg.src = f.p;
      if (stageMode === 'shot') { scap.textContent = f.p + ' · ' + fmt(f.t); scap.classList.add('on'); }
    }
  };
  const setStageMode = (m, skipSync = false) => {
    if (m === 'rr' && !rrReady) return;
    if (m === 'shot' && !frames.length) return;
    stageMode = m;
    mRR.classList.toggle('on', m === 'rr');
    mShot.classList.toggle('on', m === 'shot');
    rrHold.style.display = m === 'rr' ? '' : 'none';
    sImg.style.display = m === 'shot' ? 'block' : 'none';
    if (m === 'shot') {
      const f = frameAt(curT) || frames[0];
      if (f) { sImg.src = f.p; curShot = f.p; scap.textContent = f.p + ' · ' + fmt(f.t); scap.classList.add('on'); }
      sinfo.textContent = 'Click frame to zoom';
    } else if (m === 'rr') {
      scap.classList.remove('on');
      sinfo.textContent = 'Full DOM replay';
      if (!skipSync) syncRR(curT, isPlaying);
    } else {
      rrHold.style.display = 'none'; sImg.style.display = 'none';
      const em = document.createElement('div');
      em.id = 'emptymsg'; em.textContent = 'No visuals in this session (no rrweb/shots) — audio & events only';
      stage.appendChild(em);
    }
  };
  mRR.onclick = () => setStageMode('rr');
  mShot.onclick = () => setStageMode('shot');

  /* ---------- unified clock (audio + virtual RAF fallback) ---------- */
  const ICO_PLAY = '<svg viewBox="0 0 12 12" width="13" height="13"><path d="M3.6 2.1v7.8c0 .62.68.99 1.2.66l6-3.9a.78.78 0 0 0 0-1.32l-6-3.9c-.52-.33-1.2.04-1.2.66z" fill="currentColor"/></svg>';
  const ICO_PAUSE = '<svg viewBox="0 0 12 12" width="13" height="13"><path d="M3 2.2c0-.5.4-.9.9-.9h.8c.5 0 .9.4.9.9v7.6c0 .5-.4.9-.9.9h-.8c-.5 0-.9-.4-.9-.9zM6.4 2.2c0-.5.4-.9.9-.9h.8c.5 0 .9.4.9.9v7.6c0 .5-.4.9-.9.9h-.8c-.5 0-.9-.4-.9-.9z" fill="currentColor"/></svg>';

  let hasAudio = D.meta.audio !== false;
  let speed = 1, isPlaying = false, curT = 0, rafId = 0, lastFrameAt = 0;
  const volBox = document.getElementById('volbox');

  const setVirtual = reason => {
    hasAudio = false;
    volBox.style.display = 'none';
    clkmode.textContent = 'virtual clock' + (reason ? ' (' + reason + ')' : '');
  };
  if (!hasAudio) setVirtual('no audio');
  else {
    clkmode.textContent = 'audio-driven clock';
    au.addEventListener('error', () => setVirtual('no audio'));
    fetch('audio.webm').then(r => r.ok ? r.blob() : Promise.reject()).then(b => {
      const p = au.currentTime, live = !au.paused;
      au.src = URL.createObjectURL(b); au.load();
      au.addEventListener('loadedmetadata', () => { au.currentTime = p; if (live) au.play().catch(() => {}); }, { once: true });
    }).catch(() => {});
  }

  let rrScrubAt = 0, lastRrOff = -1, lastRrPlay = null;
  const syncRR = (t, play, throttled) => {
    if (!rp || stageMode !== 'rr') return;
    if (throttled) {
      const now = performance.now();
      if (now - rrScrubAt < 70) return;
      rrScrubAt = now;
    }
    const off = Math.max(0, Math.round(t - (D.rrOffset || 0)));
    if (off === lastRrOff && play === lastRrPlay) return;
    lastRrOff = off; lastRrPlay = play;
    try {
      if (play) rp.play(off);
      else rp.pause(off);
    } catch {}
  };

  let qEls = [], lastActiveQ = null;
  const renderClock = t => {
    curT = Math.max(0, Math.min(dur, t));
    cur.textContent = fmt(curT);
    ph.style.left = ((curT / dur) * 100) + '%';
    setShot(curT);
    let act = null;
    for (const q of qEls) { if (+q.dataset.t <= curT) act = q; else break; }
    if (act !== lastActiveQ) {
      lastActiveQ = act;
      for (const q of qEls) q.classList.toggle('on', q === act);
      if (act && document.getElementById('fol').checked) act.scrollIntoView({ block: 'nearest' });
    }
    if (handoffMode === 'moment') updateHandoffPreview();
  };

  const vLoop = now => {
    if (!isPlaying || hasAudio) return;
    const dt = (now - lastFrameAt) * speed;
    lastFrameAt = now;
    const next = curT + dt;
    if (next >= dur) { renderClock(dur); pause(); return; }
    renderClock(next);
    rafId = requestAnimationFrame(vLoop);
  };

  const play = () => {
    isPlaying = true;
    pp.innerHTML = ICO_PAUSE;
    if (hasAudio) {
      au.playbackRate = speed;
      au.play().catch(() => { setVirtual('autoplay blocked'); lastFrameAt = performance.now(); rafId = requestAnimationFrame(vLoop); });
      syncRR(curT, true);
    } else {
      if (curT >= dur) curT = 0;
      syncRR(curT, true);
      lastFrameAt = performance.now();
      rafId = requestAnimationFrame(vLoop);
    }
  };
  const pause = () => {
    isPlaying = false;
    pp.innerHTML = ICO_PLAY;
    cancelAnimationFrame(rafId);
    if (hasAudio && !au.paused) au.pause();
    syncRR(curT, false);
  };
  const seek = (t, autoPlay = true) => {
    const target = Math.max(0, Math.min(dur, t));
    renderClock(target);
    if (hasAudio) {
      try { au.currentTime = sessionToMedia(target) / 1000; } catch {}
    }
    if (autoPlay && !isPlaying) play();
    else syncRR(target, isPlaying);
  };

  au.addEventListener('play', () => { isPlaying = true; pp.innerHTML = ICO_PAUSE; syncRR(mediaToSession(au.currentTime * 1000), true); });
  au.addEventListener('pause', () => { if (hasAudio) { isPlaying = false; pp.innerHTML = ICO_PLAY; syncRR(mediaToSession(au.currentTime * 1000), false); } });
  au.addEventListener('timeupdate', () => { if (hasAudio && !dragging) renderClock(mediaToSession(au.currentTime * 1000)); });
  au.addEventListener('seeked', () => { if (hasAudio) syncRR(mediaToSession(au.currentTime * 1000), !au.paused); });

  pp.onclick = () => isPlaying ? pause() : play();
  document.getElementById('rew').onclick = () => seek(curT - 5000, isPlaying);
  document.getElementById('fwd').onclick = () => seek(curT + 5000, isPlaying);
  document.querySelectorAll('.spd b').forEach(b => b.onclick = () => {
    document.querySelectorAll('.spd b').forEach(x => x.classList.toggle('on', x === b));
    speed = +b.dataset.v;
    au.playbackRate = speed;
    if (rp && rp.setSpeed) try { rp.setSpeed(speed); } catch {}
  });
  const muteBtn = document.getElementById('mute'), volIn = document.getElementById('vol');
  const syncMute = () => { muteBtn.textContent = (au.muted || au.volume === 0) ? '🔇' : '🔊'; };
  muteBtn.onclick = () => { au.muted = !au.muted; syncMute(); };
  volIn.oninput = () => { au.volume = +volIn.value; au.muted = au.volume === 0; syncMute(); };

  /* ---------- timeline: 3 lanes + zoom + interactive legend ---------- */
  const tl = document.getElementById('tl'), tlw = document.getElementById('tlw'), bub = document.getElementById('bub');
  const laneOf = e => {
    if (e.kind === 'say') return 0;
    if (isBad(e) || e.kind === 'console') return 2;
    return ['nav', 'click', 'mark', 'input', 'key', 'note', 'issue'].includes(e.kind) ? 1 : -1;
  };
  const tlTicks = [];
  for (const e of D.evs) {
    const L = laneOf(e);
    if (L < 0 || e.t == null) continue;
    const cat = catOf(e);
    if (e.kind === 'say') {
      const b = document.createElement('div');
      b.className = 'tk blk';
      b.dataset.cat = cat;
      const a = e.segStart != null ? e.segStart : e.t;
      const z = e.segEnd != null ? e.segEnd : e.t + 800;
      b.style.left = (Math.min(1, a / dur) * 100) + '%';
      b.style.width = Math.max(0.5, ((z - a) / dur) * 100) + '%';
      b.style.top = '4px';
      b.style.background = '#7c3aed';
      b.title = fmt(a) + ' speech: ' + String(e.text || '').slice(0, 60);
      tl.appendChild(b); tlTicks.push(b);
      continue;
    }
    const tk = document.createElement('div');
    tk.className = 'tk' + (isBad(e) || e.kind === 'mark' || e.kind === 'issue' ? ' big' : '');
    tk.dataset.cat = cat;
    tk.style.left = (Math.min(1, e.t / dur) * 100) + '%';
    tk.style.top = (L === 1 ? '24px' : '44px');
    tk.style.background = kcol(e);
    tk.title = fmt(e.t) + ' ' + String(e.text || e.sel || e.url || e.message || e.kind || '').slice(0, 60);
    tl.appendChild(tk); tlTicks.push(tk);
  }

  // Zoom control
  document.querySelectorAll('#zoomseg button').forEach(b => b.onclick = () => {
    document.querySelectorAll('#zoomseg button').forEach(x => x.classList.toggle('on', x === b));
    const z = +b.dataset.z;
    tlw.style.width = (z * 100) + '%';
  });

  // Next error button
  const badEvs = D.evs.filter(isBad);
  const nextErrBtn = document.getElementById('nexterr');
  if (badEvs.length) {
    nextErrBtn.hidden = false;
    nextErrBtn.textContent = '⚠ Next error (' + badEvs.length + ')';
    nextErrBtn.onclick = () => {
      const next = badEvs.find(e => e.t > curT + 200) || badEvs[0];
      if (next) seek(next.t, false);
    };
  }

  // Scrubbing with live rrweb + shot preview
  let dragging = false, wasPlaying = false;
  const scrub = ev => {
    const r = tl.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
    const t = p * dur;
    renderClock(t);
    syncRR(t, false, true);
    const clampedPct = Math.max(8, Math.min(92, p * 100));
    bub.style.left = clampedPct + '%';
    let q = null;
    for (const x of qEls) { if (+x.dataset.t <= t) q = x; else break; }
    bub.innerHTML = '<b>' + fmt(t) + '</b>' + (q ? esc(q.dataset.txt.slice(0, 44)) : '');
    return t;
  };
  tl.addEventListener('pointerdown', e => {
    dragging = true; wasPlaying = isPlaying;
    if (wasPlaying) pause();
    try { tl.setPointerCapture(e.pointerId); } catch {}
    tlw.classList.add('scrub');
    scrub(e);
  });
  tl.addEventListener('pointermove', e => {
    if (dragging) scrub(e);
    else {
      const r = tl.getBoundingClientRect();
      const p = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      const t = p * dur;
      bub.style.left = Math.max(8, Math.min(92, p * 100)) + '%';
      let q = null;
      for (const x of qEls) { if (+x.dataset.t <= t) q = x; else break; }
      bub.innerHTML = '<b>' + fmt(t) + '</b>' + (q ? esc(q.dataset.txt.slice(0, 44)) : '');
    }
  });
  tl.addEventListener('pointerup', e => {
    if (!dragging) return;
    dragging = false;
    tlw.classList.remove('scrub');
    const t = scrub(e);
    seek(t, wasPlaying);
  });

  // Interactive legend chips
  const lg = document.getElementById('lg');
  for (const [k, label, col] of LDEFS) {
    const ch = document.createElement('button');
    ch.type = 'button';
    ch.className = 'lg-chip';
    ch.innerHTML = '<i style="background:' + col + '"></i>' + esc(label);
    ch.onclick = () => {
      if (hiddenCats.has(k)) hiddenCats.delete(k); else hiddenCats.add(k);
      ch.classList.toggle('off', hiddenCats.has(k));
      for (const tk of tlTicks) tk.classList.toggle('off', hiddenCats.has(tk.dataset.cat));
    };
    lg.appendChild(ch);
  }

  /* ---------- transcript tab (all SAYs + search) ---------- */
  const tp = document.getElementById('tp');
  const allSays = [];
  for (const b of D.blocks) {
    if (b.issue != null) { allSays.push({ issue: b.issue, t: b.at }); continue; }
    for (const f of (b.frags || [])) allSays.push(f);
  }
  const sayCount = allSays.filter(x => x.issue == null).length;
  document.getElementById('c-tp').textContent = String(sayCount);

  const tpBar = document.createElement('div');
  tpBar.className = 'pbar';
  const tpSearch = document.createElement('input');
  tpSearch.className = 'sbox'; tpSearch.placeholder = 'Search speech transcript…';
  const tpInfo = document.createElement('div');
  tpInfo.className = 'chips';
  const hasLowConf = allSays.some(x => x.lowConf);
  let lowConfOnly = false;
  tpInfo.innerHTML = '<span class="hint" style="margin:0">' + sayCount + ' segments · click any line to seek</span>';
  if (hasLowConf) {
    const lc = document.createElement('button');
    lc.type = 'button'; lc.className = 'fchip'; lc.textContent = '⚠ Low-conf only';
    lc.onclick = () => { lowConfOnly = !lowConfOnly; lc.classList.toggle('on', lowConfOnly); renderTranscript(); };
    tpInfo.appendChild(lc);
  }
  tpBar.append(tpSearch, tpInfo);
  const tpList = document.createElement('div');
  tp.append(tpBar, tpList);

  const renderTranscript = () => {
    const qStr = tpSearch.value.trim().toLowerCase();
    tpList.innerHTML = '';
    qEls = [];
    let shown = 0;
    for (const item of allSays) {
      if (item.issue != null) {
        if (qStr || lowConfOnly) continue;
        const d = document.createElement('div');
        d.className = 'e';
        d.style.cssText = 'color:#c2410c;font-weight:600';
        d.innerHTML = '<span class=t>' + fmt(item.t) + '</span><i style="background:#ff4f00"></i><span>⏺ Issue #' + item.issue + '</span>';
        d.onclick = () => seek(item.t);
        tpList.appendChild(d);
        continue;
      }
      if (lowConfOnly && !item.lowConf) continue;
      if (qStr && !item.text.toLowerCase().includes(qStr)) continue;
      shown++;
      const row = document.createElement('div');
      row.className = 'q';
      row.dataset.t = item.t;
      row.dataset.txt = item.text;
      row.innerHTML = '<span class=qt>' + fmt(item.t) + '</span><span class=qtxt>' + esc(item.text) +
        (item.lowConf ? '<span class=lcf>⚠ low-conf</span>' : '') + '</span>';
      row.onclick = () => seek(item.t);
      tpList.appendChild(row);
      qEls.push(row);
    }
    if (!shown) tpList.innerHTML = '<div class="hint" style="padding:24px 8px">' + (sayCount ? 'No matching speech lines.' : 'No speech recognized in this recording.') + '</div>';
  };
  tpSearch.oninput = renderTranscript;
  renderTranscript();

  /* ---------- events tab (search + category filters + noise toggle) ---------- */
  const ep = document.getElementById('ep');
  const epBar = document.createElement('div');
  epBar.className = 'pbar';
  const epSearch = document.createElement('input');
  epSearch.className = 'sbox'; epSearch.placeholder = 'Filter events (URL, selector, error, speech)…';
  const epChips = document.createElement('div');
  epChips.className = 'chips';
  let evFilter = 'all', showNoise = false;
  const FMODES = [
    ['all', 'All'],
    ['err', 'Errors (' + badEvs.length + ')'],
    ['act', 'Clicks & Marks'],
    ['net', 'Network'],
    ['say', 'Speech'],
  ];
  for (const [k, label] of FMODES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'fchip' + (k === 'all' ? ' on' : '') + (k === 'err' ? ' err' : '');
    b.textContent = label;
    b.onclick = () => {
      evFilter = k;
      epChips.querySelectorAll('.fchip[data-fm]').forEach(x => x.classList.toggle('on', x.dataset.fm === k));
      renderEvents();
    };
    b.dataset.fm = k;
    epChips.appendChild(b);
  }
  const nBtn = document.createElement('button');
  nBtn.type = 'button'; nBtn.className = 'fchip'; nBtn.textContent = '+ Noise';
  nBtn.onclick = () => { showNoise = !showNoise; nBtn.classList.toggle('on', showNoise); renderEvents(); };
  epChips.appendChild(nBtn);
  epBar.append(epSearch, epChips);
  const epList = document.createElement('div');
  ep.append(epBar, epList);

  const matchEv = e => {
    if (!showNoise && (e._q || e.kind === 'shot' || e.kind === '_ui' || e.kind === 'scroll' || (e.kind === 'mut' && !isBad(e)))) return false;
    if (evFilter === 'err' && !isBad(e)) return false;
    if (evFilter === 'act' && !['click', 'mark', 'input', 'key', 'nav', 'issue'].includes(e.kind)) return false;
    if (evFilter === 'net' && !['req', 'res', 'ws'].includes(e.kind)) return false;
    if (evFilter === 'say' && e.kind !== 'say') return false;
    return true;
  };
  const renderEvents = () => {
    const q = epSearch.value.trim().toLowerCase();
    epList.innerHTML = '';
    let count = 0;
    for (const e of D.evs) {
      if (!matchEv(e)) continue;
      if (q) {
        const hay = [e.kind, e.text, e.sel, e.url, e.message, e.summary, e.value, e.data].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) continue;
      }
      count++;
      const d = document.createElement('div');
      d.className = 'e' + (isBad(e) ? ' bad' : '') + (e._q ? ' qnoise' : '');
      d.innerHTML = '<span class=t>' + fmt(e.t) + '</span><i style="background:' + kcol(e) + '"></i><span>' + desc(e) + '</span>';
      const p = e.kind === 'shot' ? e.path : e.shot;
      if (p) {
        const im = document.createElement('img');
        im.className = 'thumb'; im.src = p; im.loading = 'lazy'; im.alt = 'Event screenshot';
        im.onclick = ev => { ev.stopPropagation(); openLb(p); };
        d.appendChild(im);
      }
      d.onclick = () => seek(e.t);
      epList.appendChild(d);
    }
    document.getElementById('c-ep').textContent = String(count);
    if (!count) epList.innerHTML = '<div class="hint" style="padding:24px 8px">No events match the current filter.</div>';
  };
  epSearch.oninput = renderEvents;
  renderEvents();

  /* ---------- issues tab (user-selectable cards synced with AI handoff) ---------- */
  const ip = document.getElementById('ip');
  const issueCards = [];
  const marks = D.blocks.filter(b => b.issue != null);
  const sayAfter = t => { for (const b of D.blocks) for (const f of (b.frags || [])) if (f.t >= t) return f.text; return ''; };

  if (marks.length) {
    marks.forEach((m, i) => {
      const nx = marks[i + 1], to = nx ? nx.at : dur;
      const es = D.evs.filter(e => e.t >= m.at && e.t < to);
      const errs = es.filter(isBad).length;
      const says = es.filter(e => e.kind === 'say').map(e => e.text);
      const mk = es.filter(e => e.kind === 'mark' || e.kind === 'click').map(e => e.sel).filter(Boolean);
      issueCards.push({
        id: 'I' + m.issue, at: m.at, to, errs, dead: 0,
        title: 'Issue #' + m.issue + ': ' + (says[0] || sayAfter(m.at) || '(no spoken note)'),
        speech: says.join(' ') || sayAfter(m.at),
        suspects: [...new Set(mk)].slice(0, 3),
        evCount: es.length, sayCount: says.length,
        selected: true,
      });
    });
  } else if (D.segments && D.segments.length) {
    for (const s of D.segments) {
      issueCards.push({
        id: 'S' + s.n, at: s.from, to: s.to, errs: s.errors, dead: s.deadClicks,
        title: s.text, speech: s.text,
        suspects: s.suspects.map(x => x.sel || x.text).filter(Boolean).slice(0, 3),
        shots: s.shots || [],
        evCount: 0, sayCount: 1,
        selected: true,
      });
    }
  } else {
    const runs = D.blocks.filter(b => b.frags && b.frags.length && b.head !== 'prelude');
    runs.forEach((b, i) => {
      const nx = D.blocks[D.blocks.indexOf(b) + 1], to = nx && nx.at != null ? nx.at : dur;
      const at = b.frags[0].t;
      const es = D.evs.filter(e => e.t >= at - 1500 && e.t < to);
      const errs = es.filter(isBad).length;
      const mk = es.filter(e => e.kind === 'mark' || e.kind === 'click').map(e => e.sel).filter(Boolean);
      const txt = b.frags.map(f => f.text).join(' ');
      issueCards.push({
        id: 'S' + (i + 1), at, to, errs, dead: 0,
        title: txt, speech: txt,
        suspects: [...new Set(mk)].slice(0, 3),
        evCount: es.length, sayCount: b.frags.length,
        selected: true,
      });
    });
  }
  document.getElementById('c-ip').textContent = String(issueCards.length);

  const renderIssues = () => {
    ip.innerHTML = '';
    if (!issueCards.length) {
      ip.innerHTML = '<div class="hint" style="padding:24px 8px">No speech segments to summarize.</div>';
      return;
    }
    const selCount = issueCards.filter(x => x.selected).length;
    const bar = document.createElement('div');
    bar.className = 'pbar';
    bar.innerHTML = '<div class="chips"><span class="hint" style="margin:0;font-weight:600;color:var(--ink)">' + selCount + '/' + issueCards.length + ' selected for AI</span></div>';
    const row = bar.firstChild;
    const mkBtn = (txt, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'fchip'; b.textContent = txt; b.onclick = fn; row.appendChild(b); };
    mkBtn('All', () => { issueCards.forEach(x => x.selected = true); renderIssues(); updateHandoffPreview(); });
    mkBtn('With errors/dead', () => { issueCards.forEach(x => x.selected = (x.errs > 0 || x.dead > 0)); renderIssues(); updateHandoffPreview(); });
    mkBtn('None', () => { issueCards.forEach(x => x.selected = false); renderIssues(); updateHandoffPreview(); });
    ip.appendChild(bar);

    for (const item of issueCards) {
      const c = document.createElement('div');
      c.className = 'is' + (item.selected ? ' sel-on' : '');
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = item.selected; cb.title = 'Include in AI handoff';
      cb.onclick = e => { e.stopPropagation(); item.selected = cb.checked; c.classList.toggle('sel-on', item.selected); updateHandoffPreview(); renderIssues(); };
      const body = document.createElement('div');
      body.className = 'is-body';
      body.innerHTML =
        '<div class=top><span class=at>' + fmt(item.at) + '</span>' +
        '<span class="sev' + (item.errs ? ' bug' : '') + '">' + (item.errs ? 'BUG · ' + item.errs + ' err' : 'OBSERVATION') + '</span>' +
        (item.dead ? '<span class="sev dead">' + item.dead + ' dead click</span>' : '') +
        '</div>' +
        '<div class=ti>' + esc(item.title.slice(0, 120)) + '</div>' +
        (item.suspects.length ? '<div class=ds>elements: <span class=sel>' + esc(item.suspects.join(' · ')) + '</span></div>' : '');
      c.append(cb, body);
      c.onclick = () => seek(item.at);
      ip.appendChild(c);
    }
  };
  renderIssues();

  /* ---------- agent tab: parameterized handoff builder + interactive shots/files ---------- */
  const ap = document.getElementById('ap');
  const nErr = D.evs.filter(e => e.kind === 'error').length;
  const nFail = D.evs.filter(e => e.kind === 'res' && (e.status === 0 || e.status >= 400)).length;
  const bodies = [...new Set(D.evs.filter(e => e.kind === 'res' && e.bodyPath).map(e => e.bodyPath))];
  let handoffMode = issueCards.length ? 'selected' : 'full';
  let extraNote = '';

  const buildHandoff = () => {
    const noteBlock = extraNote.trim() ? '\\nAdditional user instruction: ' + extraNote.trim() + '\\n' : '';
    if (handoffMode === 'full') {
      return (D.prompt || 'Read SEGMENTS.md and session.md in this session folder and fix the reported issues.') + noteBlock;
    }
    if (handoffMode === 'mcp') {
      const ids = issueCards.filter(x => x.selected).map(x => x.id).join(', ');
      return [
        'Use the Witness MCP server (\`wit mcp\`) on this recorded session (' + D.meta.url + ').',
        '1. Call \`list_segments\` first, then \`segment_detail\` for the relevant segments' + (ids ? ' (focus on: ' + ids + ')' : '') + '.',
        '2. Use \`get_shot\`, \`get_errors\`, and \`events_around\` to verify root causes.',
        '3. Restate the issue checklist for my confirmation before editing code.',
      ].join('\\n') + noteBlock;
    }
    if (handoffMode === 'moment') {
      const nearEvs = D.evs.filter(e => !e._q && e.kind !== '_ui' && Math.abs(e.t - curT) <= 5000).slice(0, 25);
      const nearSays = allSays.filter(x => x.issue == null && Math.abs(x.t - curT) <= 6000);
      return [
        'Witness focused handoff — ' + D.meta.url + ' @ ' + fmt(curT) + ' (±5s)',
        '',
        'Spoken around this moment:',
        ...(nearSays.length ? nearSays.map(s => '- [' + fmt(s.t) + '] "' + s.text + '"') : ['- (no speech within ±6s)']),
        '',
        'Surrounding events:',
        ...nearEvs.map(e => '- [' + fmt(e.t) + '] ' + e.kind.toUpperCase() + ' ' + String(e.sel || e.url || e.message || e.text || '').slice(0, 120)),
      ].join('\\n') + noteBlock;
    }
    // selected issues mode
    const picked = issueCards.filter(x => x.selected);
    const lines = [
      'Witness curated handoff — ' + D.meta.url + ' (' + picked.length + '/' + issueCards.length + ' items selected)',
      'Inspect SEGMENTS.md / segments/NN.md and linked shots for these specific items, confirm the checklist with me, then fix:',
      '',
    ];
    if (!picked.length) lines.push('(No issues selected — tick items in the Issues tab or switch mode to Full PROMPT.md)');
    for (const it of picked) {
      lines.push('- [' + it.id + ' @ ' + fmt(it.at) + '] "' + it.speech + '"' +
        (it.suspects.length ? ' | elements: ' + it.suspects.join(', ') : '') +
        (it.dead ? ' | ' + it.dead + ' dead click(s)' : '') +
        (it.errs ? ' | ' + it.errs + ' error(s)' : '') +
        (it.shots && it.shots.length ? ' | shots: ' + it.shots.join(', ') : ''));
    }
    return lines.join('\\n') + noteBlock;
  };

  ap.innerHTML =
    '<div class=stats>' +
      '<div><b>' + fmt(dur) + '</b><span>duration</span></div>' +
      '<div><b>' + sayCount + '</b><span>speech segs</span></div>' +
      '<div><b>' + D.evs.length + '</b><span>events</span></div>' +
      '<div><b>' + frames.length + '</b><span>shots</span></div>' +
      '<div><b>' + nErr + '</b><span>page errors</span></div>' +
      '<div><b>' + nFail + '</b><span>failed reqs</span></div>' +
    '</div>' +
    '<div class=hbuild>' +
      '<h4>AI Handoff Parameters</h4>' +
      '<div class="chips" id="hmodes">' +
        '<button type="button" class="fchip' + (handoffMode === 'selected' ? ' on' : '') + '" data-hm="selected">Selected Issues</button>' +
        '<button type="button" class="fchip' + (handoffMode === 'full' ? ' on' : '') + '" data-hm="full">Full PROMPT.md</button>' +
        '<button type="button" class="fchip" data-hm="moment">Current Moment (±5s)</button>' +
        '<button type="button" class="fchip" data-hm="mcp">MCP Prompt</button>' +
      '</div>' +
      '<input class="note-in" id="hnote" placeholder="Optional instruction for agent (e.g. only fix layout, keep API unchanged)…">' +
      '<pre id="hpre"></pre>' +
      '<button class="btn pri" id="copyai2" style="width:100%;justify-content:center;padding:10px">⧉ Copy customized handoff</button>' +
    '</div>' +
    '<div class=files id="flist"></div>' +
    (frames.length ? '<div class="hint" style="font-weight:600;color:var(--ink);margin-top:14px">Screenshots (' + frames.length + ') — click image to zoom · click timestamp to seek</div><div class="gal" id="sgal"></div>' : '');

  const hpre = document.getElementById('hpre'), hnote = document.getElementById('hnote');
  const updateHandoffPreview = () => { if (hpre) hpre.textContent = buildHandoff(); };
  document.querySelectorAll('#hmodes button').forEach(b => b.onclick = () => {
    handoffMode = b.dataset.hm;
    document.querySelectorAll('#hmodes button').forEach(x => x.classList.toggle('on', x === b));
    updateHandoffPreview();
  });
  hnote.oninput = () => { extraNote = hnote.value; updateHandoffPreview(); };
  updateHandoffPreview();

  // Interactive artifact file rows with inline preview
  const flist = document.getElementById('flist');
  const fileItems = [
    ['SEGMENTS.md', 'speech anchor index'],
    ['PROMPT.md', 'agent handoff spec'],
    ['session.md', 'causal timeline'],
    ['events.jsonl', 'raw event stream'],
    ...bodies.slice(0, 8).map(b => [b, 'captured response body']),
  ];
  for (const [fname, descTxt] of fileItems) {
    const r = document.createElement('div');
    r.className = 'frow';
    r.innerHTML = '<span><a href="' + esc(fname) + '" target="_blank" rel="noopener">' + esc(fname) + '</a> <span style="color:var(--faint)">· ' + esc(descTxt) + '</span></span>';
    const pv = document.createElement('button');
    pv.type = 'button'; pv.className = 'btn sm'; pv.textContent = 'Preview';
    pv.onclick = () => previewFile(fname);
    r.appendChild(pv);
    flist.appendChild(r);
  }

  // Interactive screenshot gallery
  const sgal = document.getElementById('sgal');
  if (sgal) {
    for (const f of frames.slice(0, 60)) {
      const it = document.createElement('div');
      it.className = 'gitem';
      it.title = f.p + ' @ ' + fmt(f.t);
      const im = document.createElement('img');
      im.src = f.p; im.loading = 'lazy'; im.alt = f.p;
      im.onclick = () => openLb(f.p);
      const ts = document.createElement('span');
      ts.textContent = '⏱ ' + fmt(f.t);
      ts.title = 'Seek to ' + fmt(f.t);
      ts.onclick = ev => { ev.stopPropagation(); seek(f.t, false); };
      it.append(im, ts);
      sgal.appendChild(it);
    }
  }

  /* ---------- modals, tabs, copy, keyboard shortcuts ---------- */
  const openLb = src => { lbi.src = src; lb.classList.add('on'); lb.setAttribute('aria-hidden', 'false'); };
  const closeLb = () => { lb.classList.remove('on'); lb.setAttribute('aria-hidden', 'true'); };
  lb.onclick = closeLb;

  const fmod = document.getElementById('fmod'), ftitle = document.getElementById('ftitle'), fbody = document.getElementById('fbody');
  const closeFmod = () => { fmod.classList.remove('on'); fmod.setAttribute('aria-hidden', 'true'); };
  document.getElementById('fclose').onclick = closeFmod;
  fmod.onclick = e => { if (e.target === fmod) closeFmod(); };
  const previewFile = async name => {
    ftitle.textContent = name;
    fbody.textContent = 'Loading…';
    fmod.classList.add('on'); fmod.setAttribute('aria-hidden', 'false');
    try {
      const r = await fetch(name);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const txt = await r.text();
      fbody.textContent = txt.slice(0, 60000) + (txt.length > 60000 ? '\\n…(truncated)' : '');
    } catch {
      fbody.textContent = (name === 'PROMPT.md' && D.prompt)
        ? D.prompt
        : 'Inline preview requires serving over HTTP (browser blocks file:// fetch). Click the file link directly to open "' + name + '".';
    }
  };

  const kmod = document.getElementById('kmod');
  const closeKmod = () => { kmod.classList.remove('on'); kmod.setAttribute('aria-hidden', 'true'); };
  document.getElementById('helpbtn').onclick = () => { kmod.classList.add('on'); kmod.setAttribute('aria-hidden', 'false'); };
  document.getElementById('kclose').onclick = closeKmod;
  kmod.onclick = e => { if (e.target === kmod) closeKmod(); };

  const switchTab = id => {
    document.querySelectorAll('.tabs b').forEach(x => x.classList.toggle('on', x.dataset.p === id));
    document.querySelectorAll('.pane').forEach(p => p.classList.toggle('on', p.id === id));
  };
  document.querySelectorAll('.tabs b').forEach(b => b.onclick = () => switchTab(b.dataset.p));
  document.getElementById('cfgai').onclick = () => { switchTab('ap'); updateHandoffPreview(); };

  const copyAI = () => {
    const txt = buildHandoff();
    const ok = () => toast('Copied (' + handoffMode + ') — paste to your AI agent');
    if (navigator.clipboard) navigator.clipboard.writeText(txt).then(ok).catch(() => fallbackCopy(txt, ok));
    else fallbackCopy(txt, ok);
  };
  const fallbackCopy = (txt, ok) => {
    try {
      const ta = document.createElement('textarea');
      ta.value = txt; ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); ok();
    } catch { toast('Copy failed — open PROMPT.md manually'); }
  };
  document.getElementById('copyai').onclick = copyAI;
  document.getElementById('copyai2').onclick = copyAI;

  document.addEventListener('keydown', e => {
    const tag = (e.target && e.target.tagName) || '';
    if (e.key === 'Escape') { closeLb(); closeFmod(); closeKmod(); return; }
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === ' ') { e.preventDefault(); isPlaying ? pause() : play(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); seek(curT - 5000, isPlaying); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); seek(curT + 5000, isPlaying); }
    else if (e.key === 'j' || e.key === 'J') {
      const nx = qEls.find(q => +q.dataset.t > curT + 200) || qEls[0];
      if (nx) seek(+nx.dataset.t, false);
    } else if (e.key === 'k' || e.key === 'K') {
      const pr = [...qEls].reverse().find(q => +q.dataset.t < curT - 200) || qEls[qEls.length - 1];
      if (pr) seek(+pr.dataset.t, false);
    } else if (e.key === 'e' || e.key === 'E') {
      if (badEvs.length) { const nx = badEvs.find(x => x.t > curT + 200) || badEvs[0]; if (nx) seek(nx.t, false); }
    } else if (e.key === 'm' || e.key === 'M') {
      if (hasAudio) { au.muted = !au.muted; syncMute(); }
    } else if (e.key === '?') {
      const open = kmod.classList.contains('on');
      if (open) closeKmod(); else { kmod.classList.add('on'); kmod.setAttribute('aria-hidden', 'false'); }
    }
  });

  setStageMode(stageMode, true);
  renderClock(0);
})();
</script>
</body>
</html>`;
}
