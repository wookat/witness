/** Shared timeline grouping, burst pairing, and noise/error classification. */
import type { Ev } from "./events.js";

export type Say = Extract<Ev, { kind: "say" }>;
export type Click = Extract<Ev, { kind: "click" }>;
export type Mark = Extract<Ev, { kind: "mark" }>;
export type Res = Extract<Ev, { kind: "res" }>;

// interactive events that split a speech run — ambient events (mut/scroll/shot/note/req/res) don't
export const RUN_BREAK = new Set(["click", "mark", "nav", "input", "key", "error", "issue"]);
export const RUN_GAP = 4000; // silence longer than this splits a speech run

// causal burst window after click / Enter
export const BURST_MS = 1800;
export const BURST_KINDS = new Set(["req", "res", "console", "error", "nav", "mut"]);
export const NO_BREAK = new Set(["shot", "note", "scroll", "dom", "_ui", "ws"]);

export const isTrigger = (e: Ev): boolean => e.kind === "click" || (e.kind === "key" && e.key === "Enter");

/** Console error/warning, uncaught page error, or failed/4xx+/5xx HTTP response. */
export function isErrorEvent(e: Ev): boolean {
  if (e.kind === "error") return true;
  if (e.kind === "console") return e.level === "error" || e.level === "warning";
  if (e.kind === "res") return e.status === 0 || e.status >= 400;
  return false;
}

/** Hide static-asset/dev-server/tracker network noise; never hide docs, API calls, or errors. */
const STATIC = /(\.(js|mjs|cjs|css|map|png|jpe?g|gif|svg|ico|webp|avif|woff2?|ttf|otf|mp4|webm|vue|svelte|astro|tsx?|jsx|less|s[ac]ss|styl)(\?|#|\/|$))|node_modules|@vite|@fs|@id|__vite|favicon|plugin-vue/i;
const TRACKER = /googletagmanager\.com|google-analytics\.com|analytics\.google\.com|doubleclick\.net|hotjar\.(com|io)|clarity\.ms|segment\.(com|io)|mixpanel\.com|posthog\.(com|io)|amplitude\.com|fullstory\.com|logrocket\.com|ingest\.sentry\.io|sentry\.io\/api/i;

export function isNoisyEvent(e: Ev): boolean {
  if (e.kind === "res") return TRACKER.test(e.url) || (STATIC.test(e.url) && e.status > 0 && e.status < 400);
  if (e.kind === "req") {
    if (TRACKER.test(e.url)) return true;
    const api = e.resType === "xhr" || e.resType === "fetch" || e.resType === "eventsource" || e.resType === "websocket";
    return !api && e.resType !== "document" && STATIC.test(e.url);
  }
  if (e.kind === "console") return e.level === "debug" || e.level === "info";
  return false;
}

/** Group consecutive SAY fragments into runs split by >4s silence or interactive events. */
export function sayRuns(events: Ev[]): Say[][] {
  const says = events.filter((e): e is Say => e.kind === "say");
  const runs: Say[][] = [];
  for (const s of says) {
    const prev = runs.at(-1)?.at(-1);
    const broken = prev && (
      s.segStart - prev.segEnd >= RUN_GAP ||
      events.some(e => RUN_BREAK.has(e.kind) && e.t > prev.segEnd && e.t < s.segStart)
    );
    if (!prev || broken) runs.push([s]);
    else runs.at(-1)!.push(s);
  }
  return runs;
}

export interface TimelineBlock {
  head: string;
  evs: Ev[];
  at?: number;
  /** Always populated with all SAY fragments in this speech run (1 or more). */
  says?: Say[];
  /** Explicit N-key issue number, if this block is an issue divider. */
  issue?: number;
}

/** Group events into blocks anchored at speech runs and explicit issue boundaries. */
export function groupBlocks(events: Ev[]): TimelineBlock[] {
  const says = events.filter((e): e is Say => e.kind === "say");
  const issues = events.filter((e): e is Extract<Ev, { kind: "issue" }> => e.kind === "issue");
  const blocks: TimelineBlock[] = [];

  const anchorTimes = [...says.map(s => s.segStart), ...issues.map(i => i.t)].sort((a, b) => a - b);
  const pre = events.filter(e => e.kind !== "say" && e.kind !== "issue" &&
    (anchorTimes.length === 0 || e.t < anchorTimes[0]));
  if (pre.length) blocks.push({ head: "prelude", evs: pre });

  const runs = sayRuns(events);
  type Anchor = { at: number; run?: Say[]; issue?: number };
  const anchors: Anchor[] = [
    ...runs.map(r => ({ at: r[0].segStart, run: r })),
    ...issues.map(i => ({ at: i.t, issue: i.n })),
  ].sort((a, b) => a.at - b.at);

  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    const next = anchors[i + 1];
    if (a.issue != null) {
      blocks.push({ head: "issue", evs: [], at: a.at, issue: a.issue });
      continue;
    }
    const r = a.run!;
    const evs = events.filter(e =>
      e.kind !== "say" && e.kind !== "issue" &&
      e.t >= r[0].segStart - 1500 &&
      (next ? e.t < next.at - 1500 : true)
    );
    const lowConf = r.some(s => s.lowConf);
    blocks.push({
      head: (r.length === 1 ? `SAY “${r[0].text}”` : "SAY") + (lowConf ? " ⚠ low-confidence ASR" : ""),
      evs,
      at: r[0].segStart,
      says: r,
    });
  }
  return blocks;
}

export interface BurstRow {
  lead: Ev;
  burst: Ev[];
}

/** Group consequences within BURST_MS after each trigger (click / Enter). */
export function burstRows(evs: Ev[]): BurstRow[] {
  const out: BurstRow[] = [];
  let cur: BurstRow | null = null;
  for (const e of evs) {
    if (isTrigger(e)) { cur = { lead: e, burst: [] }; out.push(cur); continue; }
    if (cur && BURST_KINDS.has(e.kind) && e.t - cur.lead.t <= BURST_MS) { cur.burst.push(e); continue; }
    if (!NO_BREAK.has(e.kind)) cur = null;
    out.push({ lead: e, burst: [] });
  }
  return out;
}
