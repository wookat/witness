// Renders public/og.png (1200x630 social card) with Playwright.
// Run from site/: node scripts/render-og.mjs
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "..", "public", "og.png");

const html = `<!doctype html><html><body style="margin:0;background:#f7f6f3;font-family:-apple-system,'Segoe UI',sans-serif;
  width:1200px;height:630px;display:flex;flex-direction:column;justify-content:center;align-items:center;position:relative;overflow:hidden">
  <div style="position:absolute;inset:0;background-image:linear-gradient(#e3e1da 1px,transparent 1px),linear-gradient(90deg,#e3e1da 1px,transparent 1px);background-size:52px 52px;mask-image:radial-gradient(ellipse 70% 60% at 50% 42%,#000 20%,transparent 75%)"></div>
  <div style="position:absolute;top:40px;left:56px;right:56px;height:26px;border-top:1px solid #e3e1da;border-bottom:1px solid #e3e1da;
    background:repeating-linear-gradient(90deg,#d4d2ca 0 1px,transparent 1px 56px),repeating-linear-gradient(90deg,#e3e1da 0 1px,transparent 1px 14px);
    background-position:0 100%,0 100%;background-size:auto 9px,auto 5px;background-repeat:repeat-x"></div>
  <div style="display:flex;align-items:center;gap:18px;margin-bottom:34px">
    <svg width="72" height="72" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#17181c"/>
      <path d="M5.4 16C8 10.9 11.9 8.5 16 8.5s8 2.4 10.6 7.5C24 21.1 20.1 23.5 16 23.5S8 21.1 5.4 16Z" fill="none" stroke="#f7f6f3" stroke-width="2"/>
      <rect x="9.8" y="13.8" width="2" height="4.4" rx="1" fill="#f7f6f3"/><rect x="12.7" y="12" width="2" height="8" rx="1" fill="#f7f6f3"/>
      <rect x="15" y="10" width="2" height="12" rx="1" fill="#e5484d"/>
      <rect x="17.3" y="12" width="2" height="8" rx="1" fill="#f7f6f3"/><rect x="20.2" y="13.8" width="2" height="4.4" rx="1" fill="#f7f6f3"/></svg>
    <span style="font-size:44px;font-weight:800;letter-spacing:-.03em;color:#17181c">witness</span>
    <span style="font:600 15px ui-monospace,monospace;color:#e5484d;background:#fceeee;border:1px solid #f2d4d4;border-radius:999px;padding:6px 16px;margin-left:8px">OPEN SOURCE · MIT</span>
  </div>
  <h1 style="font-size:76px;font-weight:800;letter-spacing:-.035em;color:#17181c;text-align:center;line-height:1.08;margin:0 80px">
    You say it. Witness proves <span style="color:#e5484d">it.</span></h1>
  <p style="font-size:25px;color:#67676d;margin-top:28px;max-width:840px;text-align:center;line-height:1.5">
    Voice-anchored causal evidence recorder for AI coding agents.<br/>Talk, point — get an evidence package your agent can act on.</p>
  <div style="display:flex;gap:12px;margin-top:44px;font:600 13px ui-monospace,monospace">
    <span style="border:1px solid #e3e1da;background:#fff;border-radius:999px;padding:9px 20px;color:#17181c">voice</span>
    <span style="border:1px solid #e3e1da;background:#fff;border-radius:999px;padding:9px 20px;color:#17181c">causal bursts</span>
    <span style="border:1px solid #e3e1da;background:#fff;border-radius:999px;padding:9px 20px;color:#17181c">rrweb replay</span>
    <span style="border:1px solid #e3e1da;background:#fff;border-radius:999px;padding:9px 20px;color:#17181c">MCP</span>
    <span style="border:1px solid #e3e1da;background:#fff;border-radius:999px;padding:9px 20px;color:#e5484d">local-first</span>
  </div>
  <span style="position:absolute;bottom:44px;font:500 14px ui-monospace,monospace;color:#9c9ca2;letter-spacing:.1em">witness.zalize.com&nbsp;&nbsp;·&nbsp;&nbsp;github.com/wookat/witness</span>
</body></html>`;

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
await p.setContent(html);
await p.screenshot({ path: out });
await b.close();
console.log("og:", out);
