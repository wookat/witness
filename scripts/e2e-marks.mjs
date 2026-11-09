// E2E check: inject PAGE_SCRIPT into a real page, drive inspect-mode region drag
// and ctrl+click, verify emitted mark events (region rect + component chain + clip shot).
// Usage: node scripts/e2e-marks.mjs [url]   (default http://localhost:5173)
import { chromium } from "playwright";
import { EventStore } from "../dist/events.js";
import { Shots } from "../dist/shots.js";
import { PAGE_SCRIPT } from "../dist/page-script.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const url = process.argv[2] ?? "http://localhost:5173";
const dir = mkdtempSync(join(tmpdir(), "wit-e2e-"));
const store = new EventStore(dir);
const shots = new Shots(dir, store);

const browser = await chromium.launch({ channel: "msedge", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, permissions: ["microphone"] });
let lastPage;
await ctx.exposeBinding("__witEmit", async (_s, e) => {
  if (e?.kind === "mark" && lastPage) {
    const clip = e.region ? { x: e.region.x, y: e.region.y, width: e.region.w, height: e.region.h } : undefined;
    const p = await shots.at(lastPage, "mark", clip).catch(() => null);
    if (p) e.shot = p;
  }
  store.push(e);
});
await ctx.exposeBinding("__witAudio", () => {});
await ctx.addInitScript(PAGE_SCRIPT("zh-CN"));

const page = await ctx.newPage();
lastPage = page;
await page.goto(url, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);

// 1) inspect mode + drag a region over the middle of the page
await page.keyboard.press("m");
await page.mouse.move(500, 400);
await page.mouse.down();
await page.mouse.move(760, 560, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(400);
await page.keyboard.press("m"); // exit inspect

// 2) ctrl+click on a heading-ish element
const target = await page.evaluate(() => {
  const el = document.querySelector("h1, h2, h3, button, a") || document.body;
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: Math.max(5, r.y + Math.min(r.height / 2, 20)) };
});
await page.keyboard.down("Control");
await page.mouse.click(target.x, target.y);
await page.keyboard.up("Control");
await page.waitForTimeout(500);

await browser.close();
await store.close();

const marks = store.events.filter(e => e.kind === "mark");
const region = marks.find(m => m.region);
const elMark = marks.find(m => !m.region);
console.log("session dir:", dir);
console.log("marks:", marks.length);
for (const m of marks) {
  console.log(`  ${m.region ? "REGION" : "ELEMENT"} sel=${m.sel} shot=${m.shot ?? "none"} comp=[${(m.react ?? []).join(" › ")}]`);
}
if (!region) { console.error("FAIL: no region mark"); process.exit(1); }
if (!region.shot) { console.error("FAIL: region mark has no clipped shot"); process.exit(1); }
if (!elMark) { console.error("FAIL: no element mark"); process.exit(1); }
console.log("PASS: region mark + element mark + clipped shot");
console.log("component chain on element mark:", JSON.stringify(elMark.react));
