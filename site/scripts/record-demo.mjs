// Records a scripted witness session against public/demo-app.html using
// Playwright's built-in video recorder. Output: public/demo.mp4 (+ .webm).
// Run from site/:  node scripts/record-demo.mjs
import { chromium } from "playwright";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const siteDir = path.resolve(here, "..");
const appUrl = "file:///" + path.join(siteDir, "public", "demo-app.html").replace(/\\/g, "/");
const tmpDir = path.join(siteDir, ".video-tmp");
fs.mkdirSync(tmpDir, { recursive: true });

const WIT_UI = `
(() => {
  const css = document.createElement("style");
  css.textContent = \`
    .w-tb{position:fixed;top:14px;right:14px;z-index:999999;display:flex;align-items:center;gap:8px;
      background:#17181c;border-radius:9px;padding:7px 12px;font:600 11px ui-monospace,monospace;color:#f4f3ef;
      box-shadow:0 8px 24px #17181c40}
    .w-tb .d{width:8px;height:8px;border-radius:50%;background:#e5484d;animation:wb 1.3s infinite}
    @keyframes wb{50%{opacity:.3}}
    .w-tb kbd{color:#8f8ba8;background:#26262e;border-radius:3px;padding:1px 5px;font-size:9px}
    .w-tb .s{width:1px;height:12px;background:#383845}
    .w-tb .sq{width:8px;height:8px;border-radius:2px;background:#f4f3ef;cursor:pointer}
    .w-tb .tm{color:#b6b3c9;min-width:34px}
    .w-tr{position:fixed;top:52px;right:14px;z-index:999999;max-width:340px;background:#17181cee;color:#f4f3ef;
      border-radius:10px 10px 3px 10px;padding:9px 13px;font:500 12.5px -apple-system,sans-serif;
      box-shadow:0 10px 26px #17181c33;opacity:0;transition:opacity .3s}
    .w-tr.on{opacity:1}
    .w-tr .m{color:#e5484d;font-size:9px;margin-right:7px}
    .w-cur{position:fixed;z-index:999998;width:20px;height:20px;pointer-events:none;
      filter:drop-shadow(0 2px 4px #0004)}
    .w-mark{position:fixed;z-index:999997;border:2px solid #e5484d;border-radius:6px;pointer-events:none;
      box-shadow:0 0 0 4px #e5484d22;opacity:0;transition:all .25s}
    .w-chip{position:fixed;z-index:999999;right:14px;bottom:14px;background:#17181c;color:#f4f3ef;
      border-radius:10px;padding:11px 14px;font:11.5px ui-monospace,monospace;box-shadow:0 12px 30px #17181c40;
      opacity:0;transform:translateY(10px);transition:all .3s;max-width:330px}
    .w-chip.on{opacity:1;transform:none}
    .w-chip b{color:#e5484d}
    .w-chip p{color:#b6b3c9;margin-top:3px}
    .w-rip{position:fixed;z-index:999996;border:2px solid #e5484d;border-radius:50%;pointer-events:none;opacity:0}
  \`;
  document.head.appendChild(css);
  const tb = document.createElement("div");
  tb.className = "w-tb";
  tb.innerHTML = '<span class="d"></span><b>wit</b><span class="tm">00:00</span><span class="s"></span><kbd>M</kbd><kbd>N</kbd><kbd>P</kbd><span class="s"></span><span class="sq" id="w-stop"></span>';
  document.body.appendChild(tb);
  const tr = document.createElement("div"); tr.className = "w-tr"; tr.innerHTML = '<span class="m">●</span><span class="tx"></span>';
  document.body.appendChild(tr);
  const cur = document.createElementNS("http://www.w3.org/2000/svg","svg");
  cur.setAttribute("class","w-cur"); cur.setAttribute("viewBox","0 0 24 24");
  cur.innerHTML = '<path d="M5 3l14 8-6.5 1.5L9 19z" fill="#17181c" stroke="#fff" stroke-width="1.4"/>';
  document.body.appendChild(cur);
  const mark = document.createElement("div"); mark.className = "w-mark"; document.body.appendChild(mark);
  const chip = document.createElement("div"); chip.className = "w-chip"; document.body.appendChild(chip);
  const rip = document.createElement("div"); rip.className = "w-rip"; document.body.appendChild(rip);

  const t0 = Date.now();
  setInterval(()=>{ const s = Math.floor((Date.now()-t0)/1000);
    tb.querySelector(".tm").textContent = "00:"+String(s).padStart(2,"0"); },250);

  window.__w = {
    say(text, cps = 26){ return new Promise(res => {
      tr.classList.add("on"); const tx = tr.querySelector(".tx"); tx.textContent = ""; let i = 0;
      const iv = setInterval(()=>{ tx.textContent += text[i++]; if(i>=text.length){clearInterval(iv);res();} }, 1000/cps);
    });},
    hideSay(){ tr.classList.remove("on"); },
    moveTo(x, y, ms = 700){ return new Promise(res => {
      const sx = parseFloat(cur.style.left||"640"), sy = parseFloat(cur.style.top||"380"), st = performance.now();
      const step = n => { const p = Math.min(1,(n-st)/ms), e = 1-Math.pow(1-p,3);
        cur.style.left = sx+(x-sx)*e+"px"; cur.style.top = sy+(y-sy)*e+"px";
        if(p<1) requestAnimationFrame(step); else res(); };
      cur.style.left = sx+"px"; cur.style.top = sy+"px"; requestAnimationFrame(step);
    });},
    click(){ rip.style.left = (parseFloat(cur.style.left)-14)+"px"; rip.style.top = (parseFloat(cur.style.top)-14)+"px";
      rip.style.width = rip.style.height = "28px"; rip.style.opacity = ".9";
      requestAnimationFrame(()=>{ rip.style.transition = "all .5s"; rip.style.transform = "scale(2)"; rip.style.opacity = "0";
        setTimeout(()=>{rip.style.transition="";rip.style.transform="";},550); }); },
    mark(el){ const r = el.getBoundingClientRect();
      mark.style.left = r.left-4+"px"; mark.style.top = r.top-4+"px";
      mark.style.width = r.width+8+"px"; mark.style.height = r.height+8+"px"; mark.style.opacity = "1"; },
    unmark(){ mark.style.opacity = "0"; },
    note(html, sub, hold = 2600){ chip.innerHTML = "<b>"+html+"</b><p>"+sub+"</p>"; chip.classList.add("on");
      return new Promise(r=>setTimeout(()=>{chip.classList.remove("on");r();},hold)); },
    stop(){ tb.querySelector(".tm").textContent = "saving"; }
  };
})();
`;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const cx = el => el.boundingBox().then(b => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 }));

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  recordVideo: { dir: tmpDir, size: { width: 1920, height: 1080 } },
});
const page = await ctx.newPage();
await page.goto(appUrl);
await page.evaluate(WIT_UI);
await sleep(1200);

const pay = page.locator("#pay");
const pc = await cx(pay);

// scene 1 — say the problem while looking at the button
await page.evaluate(() => window.__w.say("点这个支付按钮完全没反应"));
await page.evaluate(([x, y]) => window.__w.moveTo(x, y, 900), [pc.x, pc.y]);
await sleep(400);

// scene 2 — click it: nothing happens (that's the evidence)
await page.evaluate(() => window.__w.click());
await pay.click({ force: true }).catch(() => {});
await sleep(1500);
await page.evaluate(() => window.__w.click());
await sleep(1200);

// scene 3 — Ctrl+mark the element
await page.evaluate(() => window.__w.mark(document.querySelector("#pay")));
await page.evaluate(() => window.__w.note("MARKED  button.pay", "Pay ¥2,720 · #pay · @618,506 · shot saved", 2400));
await sleep(600);
await page.evaluate(() => window.__w.unmark());
await page.evaluate(() => window.__w.hideSay());

// scene 4 — second issue: coupon endpoint 404s
await page.evaluate(() => window.__w.say("这个优惠码接口还报 404"));
const ap = page.locator("#apply");
const ac = await cx(ap);
await page.evaluate(([x, y]) => window.__w.moveTo(x, y, 800), [ac.x, ac.y]);
await page.evaluate(() => window.__w.click());
await ap.click();
await sleep(2200);

// scene 5 — stop
await page.evaluate(() => window.__w.hideSay());
await page.evaluate(() => window.__w.note("■ session saved", ".witness/sessions/2026-11-09_22-14 · 2 issues · 41 events · 6 shots", 2800));
await page.evaluate(() => window.__w.stop());
await sleep(800);

await ctx.close();
await browser.close();

const [webm] = fs.readdirSync(tmpDir).filter(f => f.endsWith(".webm"));
if (!webm) { console.error("no video produced"); process.exit(1); }
const src = path.join(tmpDir, webm);

let ffmpegPath = null;
try { ffmpegPath = require("ffmpeg-static"); } catch {}
if (ffmpegPath) {
  const out = path.join(siteDir, "public", "demo.mp4");
  execFileSync(ffmpegPath, ["-y", "-i", src, "-c:v", "libx264", "-preset", "slow", "-crf", "19", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], { stdio: "inherit" });
  console.log("mp4:", out);
} else {
  fs.copyFileSync(src, path.join(siteDir, "public", "demo.webm"));
  console.log("webm only (no ffmpeg-static)");
}
fs.rmSync(tmpDir, { recursive: true, force: true });
