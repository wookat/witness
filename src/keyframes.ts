import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Browser } from "playwright";
import { launchBrowser } from "./browser.js";
import { rrwebUmd } from "./rr.js";

export interface KeyframeTarget { n: number; from: number; to: number }

/**
 * Render rrweb.jsonl into per-segment keyframe JPEGs — the agent-consumable
 * equivalent of "watch the replay": up to 3 frames per segment (start/mid/end).
 * Reuses system Edge/Chrome via launchBrowser (zero-download path).
 */
export async function renderKeyframes(
  dir: string,
  meta: { viewport?: { width: number; height: number }; startedAt?: number },
  segments: KeyframeTarget[],
): Promise<number> {
  const rrPath = join(dir, "rrweb.jsonl");
  const umd = rrwebUmd();
  if (!umd || !existsSync(rrPath) || !segments.length) return 0;

  const events: any[] = [];
  for (const line of readFileSync(rrPath, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { events.push(JSON.parse(line)); } catch {}
    if (events.length > 200_000) break;
  }
  if (events.length < 2) return 0;

  // Calibrate rrweb offset against session start time when available
  const rrFirstTs = typeof events[0]?.timestamp === "number" ? events[0].timestamp : 0;
  const rawDrift = meta.startedAt && rrFirstTs ? rrFirstTs - meta.startedAt : 0;
  const rrOffset = rawDrift > 0 && rawDrift < 60_000 ? rawDrift : 0;

  const vp = meta.viewport ?? { width: 1280, height: 800 };
  const outDir = join(dir, "keyframes");
  mkdirSync(outDir, { recursive: true });

  let browser: Browser | null = null;
  try {
    ({ browser } = await launchBrowser({ headless: true }));
    const page = await browser.newPage({ viewport: vp });
    await page.setContent(`<div id="app" style="width:${vp.width}px;height:${vp.height}px;overflow:hidden;background:#fff"></div>`);
    await page.addScriptTag({ content: umd });
    await page.evaluate((evts) => {
      const w = window as any;
      w.__r = new w.rrweb.Replayer(evts, {
        root: document.getElementById("app"),
        skipInactive: true, showWarning: false, mouseTail: false,
      });
    }, events);

    let n = 0;
    for (const s of segments) {
      const mid = Math.round((s.from + s.to) / 2);
      const rawTimes = s.to - s.from >= 1200
        ? [s.from + 400, mid, s.to - 400]
        : [mid];
      for (let i = 0; i < rawTimes.length; i++) {
        const off = Math.max(0, rawTimes[i] - rrOffset);
        const name = `S${String(s.n).padStart(2, "0")}-${i}.jpg`;
        await page.evaluate((t) => { (window as any).__r.pause(t); }, off);
        await page.waitForTimeout(80); // let the virtual dom paint
        await page.screenshot({ path: join(outDir, name), type: "jpeg", quality: 72 });
        n++;
      }
    }
    writeFileSync(join(dir, "KEYFRAMES.md"), [
      "# KEYFRAMES — frames rendered from the rrweb replay",
      "",
      "3 frames per segment (start/middle/end). Filename `S{segment}-{0|1|2}.jpg`, where the segment number matches segments/NN.md.",
      "This is not the full replay — for finer moments look up t in events.jsonl, or open review.html.",
      "",
    ].join("\n"));
    return n;
  } catch (e) {
    console.log(`  keyframes failed: ${(e as Error).message}`);
    return 0;
  } finally {
    await browser?.close().catch(() => {});
  }
}
