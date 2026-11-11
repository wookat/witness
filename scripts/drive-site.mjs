// Drive the deployed witness.zalize.com/zh/ as a recorded QA session.
// Connects over CDP to the wit-managed browser and acts as the test subject.
import { chromium } from "playwright";

const note = async (page, text) =>
  page.evaluate(t => window.__witEmit?.({ kind: "note", text: t }), text);

const b = await chromium.connectOverCDP("http://127.0.0.1:9222");
const page = b.contexts()[0].pages().find(p => p.url().includes("witness.zalize.com"));
if (!page) { console.log("no page found"); process.exit(1); }
await page.bringToFront();
console.log("connected:", page.url());

const errors = [];
page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", e => errors.push("PAGEERROR " + e.message));

const closeLb = async () => page.evaluate(() => {
  const lb = document.querySelector("#lb.on"); if (lb) lb.classList.remove("on");
});

// 1 — hero / first paint
await note(page, "打开中文落地页。先看首屏：hero 标题、打字机 install 行和下面那行'丢给你的 AI agent'提示。");
await page.waitForTimeout(2500);
const heroText = await page.locator("h1, .hero h1, header h1").first().textContent().catch(() => null);
console.log("hero:", heroText?.trim().slice(0, 60));

// 2 — scroll through every section, let rv animations fire
const secs = await page.$$eval("section[id], [id^='s']", els => els.map(e => e.id).filter(Boolean));
console.log("sections:", secs);
for (const id of secs) {
  await closeLb();
  try {
    await page.locator("#" + id).scrollIntoViewIfNeeded({ timeout: 5000 });
    await page.waitForTimeout(1100);
  } catch { console.log("skip", id); }
}
await note(page, `从头到尾把 ${secs.length} 个区段滚了一遍——rv 入场动画、ruler 分隔带、三轨 Tape、证据 Demo、AudSplit 双受众、MCP 网格、对话剧本都渲染了。`);

// 3 — nav anchor links
for (const label of ["如何工作", "工作原理"]) {
  const link = page.locator("nav a, header a").filter({ hasText: label }).first();
  if (await link.count()) {
    await closeLb();
    try { await link.click({ timeout: 4000 }); await page.waitForTimeout(900); console.log("nav:", label); } catch {}
    break;
  }
}

// 4 — docs CTA → /zh/docs, then exercise the new chapter strip
const docsLink = page.locator("a").filter({ hasText: "文档|Docs|使用文档" }).first();
if (await docsLink.count()) {
  await closeLb();
  await note(page, "点导航里的文档链接——去 /zh/docs 验新版头版和章节导航条。");
  try { await docsLink.click({ timeout: 5000 }); } catch {}
  await page.waitForTimeout(2200);
  console.log("now:", page.url());

  const chaps = await page.$$eval(".chaps .ch", es => es.map(e => ({ t: e.textContent.trim(), href: e.getAttribute("href") })));
  console.log("chapter strip:", chaps.length, "items");
  if (chaps.length) await note(page, `docs 页章节条出来了：${chaps.length} 章（${chaps.slice(0,3).map(c=>c.t).join(" · ")}…）——逐个点击验证锚点跳转。`);

  for (const c of chaps) {
    await closeLb();
    try {
      await page.locator(`.chaps .ch[href="${c.href}"]`).click({ timeout: 4000 });
      await page.waitForTimeout(700);
      const y = await page.evaluate(() => Math.round(scrollY));
      console.log("  ch", c.t, "→ y:", y);
    } catch { console.log("  ch click fail", c.t); }
  }

  // 5 — back to landing via home nav
  const home = page.locator("nav a, header a").filter({ hasText: /^Witness$|首页/ }).first();
  if (await home.count()) { await closeLb(); try { await home.click({ timeout: 5000 }); await page.waitForTimeout(1500); } catch {} }
} else console.log("docs link not found");

// 6 — footer docs link + github link presence
await closeLb();
const foot = await page.$$eval("footer a", es => es.map(e => ({ t: e.textContent.trim(), h: e.getAttribute("href") })));
console.log("footer links:", foot);
await note(page, "收尾检查：footer 链接、GitHub 外链、整页 console 是否有报错。");

console.log("console errors:", errors.length ? errors : "none");
await note(page, errors.length ? `发现 ${errors.length} 条 console 报错。` : "整页零 console 报错——干净。");
await page.waitForTimeout(600);
await b.close();
console.log("done");
