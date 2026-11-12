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
  if (/报错|错误|异常|崩溃|崩了|白屏|error|crash|exception|broken|blank|white screen/i.test(text) && !errors)
    gaps.push("speech mentions an error/crash, but no console/error/4xx–5xx events in the window — evidence may not have been captured, or the transcript is wrong");
  if (/没反应|点不动|不响应|失灵|no (response|reaction)|not (responding|working)|does( nothing)?|unresponsive|dead/i.test(text) && !clicks)
    gaps.push("speech says a click did nothing, but no click events in the window — the click may be outside the window or was not recorded");
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
    `${fmt(meta.durationMs ?? segments.at(-1)?.to ?? 0)} recorded · ${segments.length} speech-anchored segments.`,
    "Segments ≠ issues: boundaries are cut mechanically (a ≥4s speech gap or an action in between). Adjacent segments may belong to the same issue, and one segment may contain several issues — **semantic grouping is your job**. Read each segments/NN.md, then look at the screenshots.",
    "",
  ];
  for (const i of segments) {
    lines.push(`## S${i.n} · ${rng(i)} · ${quote(i.text)}`, "");
    if (i.explicit)
      lines.push("- ⏺ issue boundary cut explicitly by the user (N key) — strong signal");
    if (i.suspects.length)
      lines.push(`- suspect elements: ${i.suspects.map(s =>
        [s.via === "vocab" ? "≈" : "", s.comp?.length ? s.comp.join(" › ") + " " : "", s.sel ?? "", s.text ? `“${s.text.slice(0, 40)}”` : ""].join("")
      ).join(" · ")}`);
    if (i.deadClicks.length)
      lines.push(`- **${i.deadClicks.length} clicks with zero page reaction** — hard evidence of dead UI`);
    if (i.errors.length)
      lines.push(`- errors: ${i.errors.map(e => e.kind === "res" ? `${(e as { status: number }).status} ${(e as { url: string }).url.slice(0, 50)}` : e.kind).join(" · ")}`);
    if (i.gaps.length)
      lines.push(`- ⚠ evidence gap: ${i.gaps.join(" · ")}`);
    if (i.shots.length) lines.push(`- shots: ${i.shots.join(" · ")}`);
    if (i.keyframes?.length) lines.push(`- keyframes (rrweb replay): ${i.keyframes.join(" · ")}`);
    if (i.doms.length) lines.push(`- DOM: ${i.doms.join(" · ")}`);
    lines.push(`- detail: segments/${String(i.n).padStart(2, "0")}.md`, "");
  }
  if (!segments.length)
    lines.push("_No speech anchors — events.jsonl holds interaction evidence only. Ask the user what this session was about; do not guess._");
  return lines.join("\n");
}

/** per-segment bundle: verbatim + salient evidence, multimodal refs */
export function renderSegmentFile(i: Segment, meta: { url: string }): string {
  const lines = [
    `# Segment S${i.n} · ${rng(i)} · ${meta.url}`,
    "",
    i.explicit
      ? "> ⏺ This segment is an issue boundary the user cut explicitly with the N key."
      : "> Segment boundaries are cut mechanically (a ≥4s speech gap or an action event in between) — this may merge with adjacent segments or split into several issues.",
    "",
    "## Verbatim speech (fragments)",
    ...i.frags.map(s => `> [${fmt(s.segStart)}] “${s.text}”`),
    "",
  ];
  if (i.suspects.length) {
    lines.push("## Suspect elements (most reliable first)");
    for (const s of i.suspects)
      lines.push(`- [${s.via}] ${s.comp?.length ? `Comp: ${s.comp.join(" › ")} · ` : ""}${s.sel ?? ""}${s.text ? ` · “${s.text.slice(0, 60)}”` : ""}`);
    lines.push("");
  }
  if (i.deadClicks.length) {
    lines.push("## Dead clicks (dead-UI evidence)");
    for (const c of i.deadClicks)
      lines.push(`- [${fmt(c.t)}] CLICK \`${c.sel}\` ${c.text ? `“${c.text.slice(0, 50)}”` : ""} — no request/error/DOM change within 1.8s`);
    lines.push("");
  }
  if (i.errors.length) {
    lines.push("## Errors");
    for (const e of i.errors)
      lines.push(`- [${fmt(e.t)}] ${e.kind.toUpperCase()} ${e.kind === "res" ? `${(e as { status: number }).status} ${(e as { url: string }).url}` : e.kind === "console" ? (e as { text: string }).text : (e as { message?: string }).message ?? ""}`);
    lines.push("");
  }
  if (i.gaps.length) {
    lines.push("## Evidence gaps (may not have been recorded)");
    for (const g of i.gaps) lines.push(`- ⚠ ${g}`);
    lines.push("");
  }
  lines.push("## Visual evidence (look at these first)");
  if (i.keyframes?.length) lines.push("### Keyframes (rrweb replay renders)", ...i.keyframes.map(s => `- ${s}`), "");
  if (i.shots.length) lines.push(...i.shots.map(s => `- ${s}`));
  if (i.doms.length) lines.push(...i.doms.map(s => `- ${s}`));
  lines.push(
    "",
    "## Scene counts",
    `- ${Object.entries(i.counts).map(([k, v]) => `${k}×${v}`).join(" · ") || "none"}`,
    `- dig deeper: events.jsonl for t ∈ [${i.from}, ${i.to}]ms`,
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
