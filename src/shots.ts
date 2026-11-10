import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import type { Page } from "playwright";
import type { EventStore } from "./events.js";

const MAX_SHOTS = 500;

export class Shots {
  private seq = 0;
  private busy = false;
  private latest: Buffer | null = null;
  private latestAt = 0;
  private cdp: any = null;
  constructor(private dir: string, private store: EventStore) {}

  /** start a CDP screencast — periodic shots become memory reads, no repaint flicker */
  async arm(page: Page) {
    try {
      this.cdp = await page.context().newCDPSession(page);
      await this.cdp.send("Page.enable");
      this.cdp.on("Page.screencastFrame", (f: any) => {
        this.latest = Buffer.from(f.data, "base64");
        this.latestAt = Date.now();
        this.cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
      });
      await this.cdp.send("Page.startScreencast", { format: "jpeg", quality: 70, everyNthFrame: 2 });
    } catch {
      this.cdp = null; // fallback to page.screenshot in snap()
    }
  }

  async disarm() {
    if (!this.cdp) return;
    try { await this.cdp.send("Page.stopScreencast"); } catch {}
    try { await this.cdp.detach(); } catch {}
    this.cdp = null;
  }

  private async snap(page: Page, tag: string, clip?: { x: number; y: number; width: number; height: number }) {
    if (this.seq >= MAX_SHOTS || this.busy) return null;
    this.busy = true;
    try {
      const name = `${String(++this.seq).padStart(3, "0")}${tag ? "-" + tag : ""}.jpg`;
      const rel = `shots/${name}`;
      if (clip || !this.latest || Date.now() - this.latestAt > 5000) {
        // region crops and no fresh screencast frame → real screenshot
        await page.screenshot({ type: "jpeg", quality: 70, path: join(this.dir, rel), clip });
      } else {
        await writeFile(join(this.dir, rel), this.latest);
      }
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
