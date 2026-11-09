import { createWriteStream, mkdirSync, type WriteStream } from "node:fs";
import { join } from "node:path";

export type Ev =
  | { t: number; kind: "dom"; path: string }
  | { t: number; kind: "say"; text: string; segStart: number; segEnd: number }
  | { t: number; kind: "click"; sel: string; x: number; y: number; text?: string; kbd?: boolean }
  | { t: number; kind: "input"; sel: string; masked: boolean; len: number }
  | { t: number; kind: "nav"; url: string; title?: string }
  | { t: number; kind: "scroll"; sel?: string; y: number }
  | { t: number; kind: "key"; key: string; sel?: string }
  | { t: number; kind: "mark"; sel: string; outerHTML: string; box: Box; styles?: Record<string, string>; react?: string[]; shot?: string; how?: string; text?: string; region?: Box }
  | { t: number; kind: "console"; level: string; text: string; stack?: string }
  | { t: number; kind: "error"; message: string; stack?: string }
  | { t: number; kind: "req"; id: number; url: string; method: string; resType: string; postData?: string }
  | { t: number; kind: "res"; id: number; url: string; status: number; timing?: number; bodyPath?: string }
  | { t: number; kind: "mut"; sel: string; summary: string; n?: number }
  | { t: number; kind: "shot"; path: string }
  | { t: number; kind: "issue"; n: number }
  | { t: number; kind: "note"; text: string }
  | { t: number; kind: "_ui"; action: string };

export interface Box { x: number; y: number; w: number; h: number }

type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;
export type EvInput = DistributiveOmit<Ev, "t"> & { t?: number };

export class EventStore {
  readonly dir: string;
  private stream: WriteStream;
  private list: Ev[] = [];
  private t0: number;
  reqSeq = 0;

  constructor(dir: string) {
    this.dir = dir;
    this.t0 = Date.now();
    mkdirSync(join(dir, "shots"), { recursive: true });
    mkdirSync(join(dir, "bodies"), { recursive: true });
    this.stream = createWriteStream(join(dir, "events.jsonl"), "utf8");
  }

  now() { return Date.now() - this.t0; }
  get startTime() { return this.t0; }
  get events() { return this.list; }

  private pending = 0;
  private drainWaiters: (() => void)[] = [];

  push(e: EvInput) {
    const ev = { ...e, t: e.t ?? this.now() } as Ev;
    this.list.push(ev);
    this.pending++;
    // respect stream backpressure: count outstanding writes, close() waits for them
    this.stream.write(JSON.stringify(ev) + "\n", () => {
      if (--this.pending === 0) this.drainWaiters.splice(0).forEach(f => f());
    });
    return ev;
  }

  /** events within [fromMs, toMs) excluding kinds in `skip` */
  range(fromMs: number, toMs: number, skip: string[] = []): Ev[] {
    return this.list.filter(e => e.t >= fromMs && e.t < toMs && !skip.includes(e.kind));
  }

  async close() {
    if (this.pending) await new Promise<void>(r => this.drainWaiters.push(r));
    await new Promise(r => this.stream.end(r));
  }
}

export const fmt = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
