import type { Ev } from "./events.js";
import type { Segment } from "./transcribe.js";

/**
 * Merges transcript segments into the event timeline.
 * Audio starts ~0 at recording start (mic may lag a few hundred ms — fine at this granularity).
 * Returns SAY events sorted into the stream, and per-SAY linked evidence ranges.
 * SAY fragments are kept verbatim — semantic grouping happens in the renderer / consumer.
 */
export function align(storeEvents: Ev[], segments: Segment[]): Ev[] {
  // live SR say-events already in the stream are dropped when a real transcript exists
  const base = segments.length ? storeEvents.filter(e => e.kind !== "say") : storeEvents;
  const says: Ev[] = segments.map(s => ({
    kind: "say",
    t: Math.round(s.start * 1000),
    text: s.text,
    segStart: Math.round(s.start * 1000),
    segEnd: Math.round(s.end * 1000),
  }));
  return [...base, ...says].sort((a, b) => a.t - b.t);
}
