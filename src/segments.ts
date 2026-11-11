import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fmt, type Ev } from "./events.js";

type Say = Extract<Ev, { kind: "say" }>;
type Click = Extract<Ev, { kind: "click" }>;
type Mark = Extract<Ev, { kind: "mark" }>;

export interface Suspect { via: "click" | "mark" | "vocab"; sel?: string; comp?: string[]; text?: string }
export interface Segment {
  n: number;
  from: number; to: number;                       // ms window of the speech run
  frags: Say[];                                    // verbatim fragments, in order
  text: string;                                    // joined verbatim
  explicit: boolean;                               // bounded by N-key issue markers
  suspects: Suspect[];                             // deduped element hints, best first
  deadClicks: Click[];                             // clicks with no aftermath — evidence of dead UI
  errors: Ev[];                                    // console/error/failed-response events
  shots: string[];                                 // nearest screenshot files (≤3)
  doms: string[];                                  // nearest dom snapshots (≤2)
  counts: Record<string, number>;                  // ambient event counts in window
  gaps: string[];                                  // evidence-completeness hints, e.g. speech claims an error but none was captured
  keyframes?: string[];                            // rrweb-rendered frames for this segment (wit keyframes)
}

const RUN_BREAK = new Set(["click", "mark", "nav", "input", "key", "error", "issue"]);
const RUN_GAP = 4000;
const BURST_MS = 1800;
const BURST_KINDS = new Set(["req", "res", "console", "error", "nav", "mut"]);

/** group consecutive says into runs — same rule as session.md rendering */
export function sayRuns(events: Ev[]): Say[][] {
  const says = events.filter((e): e is Say => e.kind === "say");
  const runs: Say[][] = [];
  for (const s of says) {
    const prev = runs.at(-1)?.at(-1);
    const broken = prev && (s.segStart - prev.segEnd >= RUN_GAP ||
      events.some(e => RUN_BREAK.has(e.kind) && e.t > prev.segEnd && e.t < s.segStart));
    if (!prev || broken) runs.push([s]); else runs.at(-1)!.push(s);
  }
  return runs;
}

/** does a click have any page aftermath within ~1.8s? none → dead UI, itself evidence */
const isDead = (c: Click, events: Ev[]) =>
  !events.some(e => BURST_KINDS.has(e.kind) && e.t > c.t && e.t - c.t <= BURST_MS);

const near = (events: Ev[], kind: "shot" | "dom", from: number, to: number, limit: number): string[] => {
  // mark/click-attached shots first (red box / target crop on what the user pointed at)
  const attached = kind === "shot"
    ? [...events.filter((e): e is Mark => e.kind === "mark" && e.t >= from - 1500 && e.t <= to + 3000).map(e => e.shot),
       ...events.filter((e): e is Click => e.kind === "click" && e.t >= from - 1500 && e.t <= to + 3000).map(e => e.shot)]
        .filter((s): s is string => !!s)
    : [];
  const rest = events.filter(e => e.kind === kind && e.t >= from - 3000 && e.t <= to + 6000)
    .sort((a, b) => {
      const mid = (from + to) / 2;
      return Math.abs(a.t - mid) - Math.abs(b.t - mid);
    })
    .map(e => (e as { path: string }).path);
  return [...new Set([...attached, ...rest])].slice(0, limit);
};

/** speech claims something the event window doesn't show → flag the gap instead of letting the agent miss it */
const gapHints = (text: string, clicks: number, errors: number): string[] => {
  const gaps: string[] = [];
  if (/报错|错误|异常|崩溃|崩了|白屏/.test(text) && !errors)
    gaps.push("语音提到报错/异常，但窗口内无 console/error/4xx–5xx 事件——证据可能没录到或转写有误");
  if (/没反应|点不动|不响应|失灵/.test(text) && !clicks)
    gaps.push("语音说点击无反应，但窗口内无点击事件——点击可能在窗外或未被录到");
  return gaps;
};

/** collect 2+-char CJK / 4+-char latin tokens the user spoke, for text matching */
const tokensOf = (s: string) =>
  (s.match(/[一-鿿]{2,}|[a-zA-Z][a-zA-Z0-9_-]{3,}/g) ?? [])
    .map(t => t.toLowerCase());

export function extractSegments(events: Ev[]): Segment[] {
  const runs = sayRuns(events);
  const issueMarks = events.filter((e): e is Extract<Ev, { kind: "issue" }> => e.kind === "issue");
  const spoken = tokensOf(runs.flat().map(s => s.text).join(" "));

  return runs.map((r, i) => {
    const from = r[0].segStart, to = r.at(-1)!.segEnd;
    const next = runs[i + 1];
    const inWin = events.filter(e => e.kind !== "say" && e.t >= from - 1500 && (next ? e.t < next[0].segStart - 1500 : true));
    const counts: Record<string, number> = {};
    for (const e of inWin) counts[e.kind] = (counts[e.kind] ?? 0) + 1;

    const clicks = inWin.filter((e): e is Click => e.kind === "click");
    const marks = inWin.filter((e): e is Mark => e.kind === "mark");
    const errors = inWin.filter(e =>
      e.kind === "error" ||
      (e.kind === "console" && e.level !== "log" && e.level !== "info") ||
      (e.kind === "res" && e.status >= 400));

    // suspects: elements actually touched, then vocab-matched ones
    const suspects: Suspect[] = [];
    const seen = new Set<string>();
    const push = (s: Suspect) => {
      const key = s.sel ?? s.text ?? JSON.stringify(s.comp);
      if (!seen.has(key)) { seen.add(key); suspects.push(s); }
    };
    for (const m of marks) push({ via: "mark", sel: m.sel, comp: m.react, text: m.text });
    for (const c of clicks) push({ via: "click", sel: c.sel, text: c.text });
    // vocab match: element text shares a spoken token → probably "the thing they meant"
    for (const c of [...clicks, ...marks] as (Click | Mark)[]) {
      const txt = c.text;
      if (txt && tokensOf(txt).some(t => spoken.includes(t)))
        push({ via: "vocab", text: txt });
    }

    return {
      n: i + 1, from, to, frags: r,
      text: r.map(s => s.text).join(" "),
      explicit: issueMarks.some(m => m.t >= from - 1500 && m.t <= to + 1500),
      suspects: suspects.slice(0, 5),
      deadClicks: clicks.filter(c => isDead(c, events)),
      errors,
      shots: near(events, "shot", from, to, 3),
      doms: near(events, "dom", from, to, 2),
      counts,
      gaps: gapHints(r.map(s => s.text).join(" "), clicks.length, errors.length),
    };
  });
}

const rng = (i: Segment) => `${fmt(i.from)}–${fmt(i.to)}`;
const quote = (s: string) => `“${s.length > 90 ? s.slice(0, 90) + "…" : s}”`;

/** one-screen index: speech anchors with evidence pointers — segmentation is mechanical, grouping is the agent's job */
export function renderSegmentsIndex(segments: Segment[], meta: { url: string; durationMs?: number }): string {
  const lines = [
    `# SEGMENTS — ${meta.url}`,
    "",
    `录制 ${fmt(meta.durationMs ?? segments.at(-1)?.to ?? 0)} · ${segments.length} 段语音锚点。`,
    "段 ≠ 问题：边界是机械切的（≥4s 语音缝或中间有动作），相邻段可能同属一个问题、一段也可能含多个问题——**语义归组由你决定**。逐段读 segments/NN.md，再看截图。",
    "",
  ];
  for (const i of segments) {
    lines.push(`## S${i.n} · ${rng(i)} · ${quote(i.text)}`, "");
    if (i.explicit)
      lines.push("- ⏺ 用户按 N 键显式切出的问题边界（强提示）");
    if (i.suspects.length)
      lines.push(`- 嫌疑元素: ${i.suspects.map(s =>
        [s.via === "vocab" ? "≈" : "", s.comp?.length ? s.comp.join(" › ") + " " : "", s.sel ?? "", s.text ? `“${s.text.slice(0, 40)}”` : ""].join("")
      ).join(" · ")}`);
    if (i.deadClicks.length)
      lines.push(`- **${i.deadClicks.length} 次点击无任何反应** —— 死 UI 硬证据`);
    if (i.errors.length)
      lines.push(`- 错误: ${i.errors.map(e => e.kind === "res" ? `${(e as { status: number }).status} ${(e as { url: string }).url.slice(0, 50)}` : e.kind).join(" · ")}`);
    if (i.gaps.length)
      lines.push(`- ⚠ 证据缺口: ${i.gaps.join(" · ")}`);
    if (i.shots.length) lines.push(`- 截图: ${i.shots.join(" · ")}`);
    if (i.keyframes?.length) lines.push(`- 关键帧(rrweb回放): ${i.keyframes.join(" · ")}`);
    if (i.doms.length) lines.push(`- DOM: ${i.doms.join(" · ")}`);
    lines.push(`- 详情: segments/${String(i.n).padStart(2, "0")}.md`, "");
  }
  if (!segments.length)
    lines.push("_没有语音锚点——events.jsonl 里只有操作证据。问用户这段想说什么，不要猜。_");
  return lines.join("\n");
}

/** per-segment bundle: verbatim + salient evidence, multimodal refs */
export function renderSegmentFile(i: Segment, meta: { url: string }): string {
  const lines = [
    `# 语音段 S${i.n} · ${rng(i)} · ${meta.url}`,
    "",
    i.explicit
      ? "> ⏺ 此段是用户按 N 键显式切出的问题边界。"
      : "> 段边界是机械切的（≥4s 语音缝或中间有动作事件）——可与相邻段合并，也可拆成多个问题。",
    "",
    "## 用户原话（逐段）",
    "## 用户原话（逐段）",
    ...i.frags.map(s => `> [${fmt(s.segStart)}] “${s.text}”`),
    "",
  ];
  if (i.suspects.length) {
    lines.push("## 嫌疑元素（按可靠性排序）");
    for (const s of i.suspects)
      lines.push(`- [${s.via}] ${s.comp?.length ? `Comp: ${s.comp.join(" › ")} · ` : ""}${s.sel ?? ""}${s.text ? ` · “${s.text.slice(0, 60)}”` : ""}`);
    lines.push("");
  }
  if (i.deadClicks.length) {
    lines.push("## 点击无反应（死 UI 证据）");
    for (const c of i.deadClicks)
      lines.push(`- [${fmt(c.t)}] CLICK \`${c.sel}\` ${c.text ? `“${c.text.slice(0, 50)}”` : ""} —— 1.8s 内无请求/报错/DOM 变化`);
    lines.push("");
  }
  if (i.errors.length) {
    lines.push("## 错误");
    for (const e of i.errors)
      lines.push(`- [${fmt(e.t)}] ${e.kind.toUpperCase()} ${e.kind === "res" ? `${(e as { status: number }).status} ${(e as { url: string }).url}` : e.kind === "console" ? (e as { text: string }).text : (e as { message?: string }).message ?? ""}`);
    lines.push("");
  }
  if (i.gaps.length) {
    lines.push("## 证据缺口（可能录不到证据）");
    for (const g of i.gaps) lines.push(`- ⚠ ${g}`);
    lines.push("");
  }
  lines.push("## 视觉证据（先看这些）");
  if (i.keyframes?.length) lines.push("### 关键帧（rrweb 回放渲染）", ...i.keyframes.map(s => `- ${s}`), "");
  if (i.shots.length) lines.push(...i.shots.map(s => `- ${s}`));
  if (i.doms.length) lines.push(...i.doms.map(s => `- ${s}`));
  lines.push(
    "",
    "## 现场计数",
    `- ${Object.entries(i.counts).map(([k, v]) => `${k}×${v}`).join(" · ") || "无"}`,
    `- 深挖: events.jsonl 里 t ∈ [${i.from}, ${i.to}]ms`,
  );
  return lines.join("\n");
}

/** rrweb-rendered frames for a segment, if `wit keyframes` has run */
const keyframesOf = (dir: string, n: number): string[] => {
  try {
    return readdirSync(join(dir, "keyframes"))
      .filter(f => f.startsWith(`S${String(n).padStart(2, "0")}-`) && f.endsWith(".jpg"))
      .sort().map(f => `keyframes/${f}`);
  } catch { return []; }
};

export function writeSegments(dir: string, events: Ev[], meta: { url: string; durationMs?: number }): Segment[] {
  const segments = extractSegments(events);
  for (const i of segments) i.keyframes = keyframesOf(dir, i.n);
  mkdirSync(join(dir, "segments"), { recursive: true });
  writeFileSync(join(dir, "SEGMENTS.md"), renderSegmentsIndex(segments, meta));
  for (const i of segments)
    writeFileSync(join(dir, "segments", `${String(i.n).padStart(2, "0")}.md`), renderSegmentFile(i, meta));
  writeFileSync(join(dir, "segments.json"), JSON.stringify(
    segments.map(({ frags, deadClicks, errors, ...rest }) => ({
      ...rest,
      frags: frags.map(s => s.text),
      deadClicks: deadClicks.map(c => ({ t: c.t, sel: c.sel, text: c.text })),
      errors: errors.length,
    })), null, 1));
  return segments;
}
