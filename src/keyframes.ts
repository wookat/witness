import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser } from "playwright";
import { rrwebUmd } from "./rr.js";

export interface KeyframeTarget { n: number; from: number; to: number }

/**
 * Render rrweb.jsonl into per-segment keyframe JPEGs — the agent-consumable
 * equivalent of "watch the replay": 3 frames per segment (start/mid/end).
 * Reuses the same Replayer the human review uses, headless.
 */
export async function renderKeyframes(
  dir: string,
  meta: { viewport?: { width: number; height: number } },
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

  const vp = meta.viewport ?? { width: 1280, height: 800 };
  const outDir = join(dir, "keyframes");
  mkdirSync(outDir, { recursive: true });

  let browser: Browser | null = null;
  try {
    browser = await chromium.launch();
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
      const times = [s.from + 400, Math.round((s.from + s.to) / 2), s.to - 400]
        .filter(t => t > s.from + 100 && t < s.to - 100);
      for (let i = 0; i < times.length; i++) {
        const name = `S${String(s.n).padStart(2, "0")}-${i}.jpg`;
        await page.evaluate((off) => { (window as any).__r.pause(off); }, times[i]);
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
