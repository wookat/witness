import { join } from "node:path";
import type { Page } from "playwright";
import type { EventStore } from "./events.js";

const MAX_SHOTS = 500;

export class Shots {
  private seq = 0;
  private busy = false;
  constructor(private dir: string, private store: EventStore) {}

  private async snap(page: Page, tag: string, clip?: { x: number; y: number; width: number; height: number }) {
    if (this.seq >= MAX_SHOTS || this.busy) return null;
    this.busy = true;
    try {
      const name = `${String(++this.seq).padStart(3, "0")}${tag ? "-" + tag : ""}.jpg`;
      const rel = `shots/${name}`;
      await page.screenshot({ type: "jpeg", quality: 70, path: join(this.dir, rel), clip });
      this.store.push({ kind: "shot", path: rel });
      return rel;
    } catch {
      this.seq--;
      return null;
    } finally {
      this.busy = false;
    }
  }

  /** periodic screenshots every intervalMs; skip()=true freezes captures (pause). returns stop fn */
  every(page: Page, intervalMs = 2000, skip?: () => boolean) {
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      if (!skip?.()) await this.snap(page, "");
      if (!stopped) setTimeout(tick, intervalMs);
    };
    const timer = setTimeout(tick, intervalMs);
    return () => { stopped = true; clearTimeout(timer); };
  }

  at(page: Page, tag = "", clip?: { x: number; y: number; width: number; height: number }) { return this.snap(page, tag, clip); }
}
