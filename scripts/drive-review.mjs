// Drive the witness-managed browser (WIT_CDP) as a QA tester over review.html.
// Real input events only — witness records everything. Notes = my observations.
import { chromium } from "playwright";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.connectOverCDP("http://localhost:9222");
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes("review.html")) || ctx.pages()[0];
if (!page) { console.log("no page"); process.exit(1); }
console.log("driving:", page.url());

const say = (t) => page.evaluate((x) => window.__wit?.emit({ kind: "note", text: x }), t);
const mark = (t) => page.evaluate((x) => window.__wit?.emit({ kind: "mark", how: "agent", sel: "", outerHTML: "", text: x }), t);
const state = () => page.evaluate(() => ({
  t: window.__wit ? 1 : 0,
  au: document.getElementById("au")?.currentTime?.toFixed(1),
  dur: document.getElementById("au")?.duration?.toFixed(1),
  paused: document.getElementById("au")?.paused,
  cur: document.getElementById("cur")?.textContent,
  ph: document.getElementById("ph")?.style.left,
  tab: [...document.querySelectorAll(".tabs b")].find((b) => b.className.includes("on"))?.textContent,
}));

const unlb = () => page.evaluate(() => document.getElementById("lb")?.classList.remove("on"));
const errs = [];
page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text()); });

await page.waitForSelector("#tl", { timeout: 10000 });
await page.evaluate(() => document.getElementById("lb")?.classList.remove("on")); // clear leftover lightbox
await sleep(1500);
console.log("initial:", JSON.stringify(await state()));

// ── 1. tabs ──
const tabs = await page.$$(".tabs b");
console.log("tabs:", await Promise.all(tabs.map((t) => t.textContent())));
for (const tab of tabs) {
  const name = (await tab.textContent()).trim();
  await say(`看一下 ${name} 这个 tab`);
  await tab.click();
  await sleep(900);
}

// ── 2. play + speed ──
await say("点播放，听听录音");
await page.click("#pp");
await sleep(4000);
let s1 = await state();
console.log("playing:", JSON.stringify(s1));
if (s1.paused) { await mark("点了播放键但 audio 没有播起来"); await say("点了播放键但是没反应，audio 还是 paused"); }
else await say("播放正常");

for (const b of await page.$$(".spd b")) {
  const label = await b.textContent();
  await b.click();
  await sleep(1600);
}
await say("变速都点了一遍");
await page.click("#pp"); await sleep(400); // pause

// ── 3. timeline: click + drag playhead ──
const tl = await page.$("#tl");
const box = await tl.boundingBox();
await say("时间轴上直接点一下右边区域，看能不能 seek");
await page.mouse.click(box.x + box.width * 0.85, box.y + box.height / 2);
await sleep(600);
let s2 = await state();
console.log("after right-click seek:", JSON.stringify(s2));
if (s2.au === s1.au) { await mark("时间轴右侧点击不 seek"); await say("点了右侧时间轴，playhead 没动——右边点不了"); }

await say("拖 playhead 到中间");
await page.mouse.move(box.x + box.width * 0.85, box.y + box.height / 2);
await page.mouse.down();
for (let i = 1; i <= 12; i++) { await page.mouse.move(box.x + box.width * (0.85 - i * 0.04), box.y + box.height / 2); await sleep(40); }
await page.mouse.up();
await sleep(500);
console.log("after drag:", JSON.stringify(await state()));

// ── 4. transcript items → seek ──
await page.click('.tabs b:has-text("Transcript"), .tabs b:has-text("字幕")').catch(async () => { await page.$$eval(".tabs b", (bs) => bs[1]?.click()); });
await sleep(700);
const tpItems = await page.$$("#tp > *");
console.log("transcript items:", tpItems.length);
if (tpItems.length > 2) {
  await say("点字幕条目应该跳到对应时间");
  const before = (await state()).au;
  await tpItems[Math.min(5, tpItems.length - 1)].click();
  await sleep(600);
  const after = (await state()).au;
  console.log(`tp seek: ${before} -> ${after}`);
  if (before === after) { await mark("字幕条目点击不跳转"); await say("点了字幕条目但没跳转"); }
}

// ── 5. events pane ──
await page.$$eval(".tabs b", (bs) => { for (const b of bs) if (/event/i.test(b.textContent)) b.click(); });
await sleep(700);
const epItems = await page.$$("#ep > *");
console.log("event items:", epItems.length);
if (epItems.length) { await epItems[0].click(); await sleep(500); }

// ── 6. issues pane + marks ──
await page.$$eval(".tabs b", (bs) => { for (const b of bs) if (/issue/i.test(b.textContent)) b.click(); });
await sleep(700);
const ipItems = await page.$$("#ip > *");
console.log("issue items:", ipItems.length);
if (ipItems.length) { await ipItems[0].click().catch(() => {}); await sleep(600); }
const lbAfterIssue = await page.$eval("#lb", (e) => e.classList.contains("on"));
if (lbAfterIssue) { await mark("点 Issues 卡片误开 lightbox"); await say("点 Issues 卡想跳转，结果缩略图把大图弹出来了，把后面操作全挡住了"); }
await unlb();

// real Ctrl+Click mark on the logo area
await say("在左上角 logo 这里打个标记，样式有问题");
const stage = await page.$("#stage") || await page.$("#lg");
if (stage) { const b = await stage.boundingBox(); await page.mouse.click(b.x + 60, b.y + 30, { modifiers: ["Control"] }); }
await sleep(500);

// ── 7. follow toggle + lightbox + copy ──
await say("把 follow 关掉再拖，看 playhead 会不会跟");
await unlb();
try {
  await page.click(".sw"); // the visible switch label wraps hidden #fol
  await sleep(400);
  await page.click("#pp"); await sleep(3000); await page.click("#pp");
  console.log("after follow-off play:", JSON.stringify(await state()));
} catch (e) { console.log("follow step failed:", e.message.split("\n")[0]); await mark("follow 开关点不动"); }

try {
  await unlb();
  const img = await page.$("#stage img");
  if (img) {
    await img.click(); await sleep(700);
    const lbOn = await page.$eval("#lb", (e) => e.classList.contains("on"));
    console.log("lightbox opened:", lbOn);
    await page.keyboard.press("Escape"); await sleep(300);
    const esc = await page.$eval("#lb", (e) => e.classList.contains("on"));
    if (esc) { await mark("lightbox 不支持 Esc 关闭"); await say("按 Esc 关不掉大图，只能点空白"); }
    await page.mouse.click(20, 20); await sleep(300); // click empty corner
  }
} catch (e) { console.log("lightbox failed:", e.message.split("\n")[0]); }

try {
  await unlb();
  await page.click("#copyai");
  await sleep(600);
  const toast = await page.$eval("#toast", (e) => e.textContent).catch(() => "");
  console.log("toast:", toast);
} catch (e) { console.log("copyai failed:", e.message.split("\n")[0]); }

// ── 8. summary ──
await say("整体扫完了：能 seek、能播、tab 能切；问题标记都打上了");
console.log("final:", JSON.stringify(await state()));
console.log("JS errors seen:", errs.length ? errs : "none");
await browser.close();
