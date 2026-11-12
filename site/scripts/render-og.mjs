// Renders public/og.png + public/og-zh.png (1200x630 social cards) with Playwright.
// Run from site/: node scripts/render-og.mjs
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

const T = {
  en: {
    badge: "OPEN SOURCE · MIT",
    h1: `You say it. Witness proves <span style="color:#e5484d">it.</span>`,
    sub: `Voice-anchored causal evidence recorder for AI coding agents.<br/>Talk, point — get an evidence package your agent can act on.`,
    chips: ["voice", "causal bursts", "rrweb replay", "MCP", "local-first"],
    accent: 4,
  },
  zh: {
    badge: "开源 · MIT",
    h1: `你开口，Witness 补全<span style="color:#e5484d">证据。</span>`,
    sub: `语音锚定的因果证据记录仪，为 AI 编码 agent 设计。<br/>说话、指认——拿到一份 agent 能直接修的证据包。`,
    chips: ["语音", "因果爆发链", "rrweb 回放", "MCP", "本地优先"],
    accent: 4,
  },
};

// wordmark: w + ı + red dot + tness — the designed logo, not plain text
const wordmark = `w<span style="position:relative">ı<span style="position:absolute;left:50%;top:.02em;transform:translateX(-50%);width:.24em;height:.24em;border-radius:50%;background:#ff4f00"></span></span>tness`;

const html = (t) => `<!doctype html><html><body style="margin:0;background:#f7f6f3;font-family:-apple-system,'Segoe UI',sans-serif;
  width:1200px;height:630px;display:flex;flex-direction:column;justify-content:center;align-items:center;position:relative;overflow:hidden">
  <div style="position:absolute;inset:0;background-image:linear-gradient(#e3e1da 1px,transparent 1px),linear-gradient(90deg,#e3e1da 1px,transparent 1px);background-size:52px 52px;mask-image:radial-gradient(ellipse 120% 95% at 50% 47%,transparent 75%,#000 100%)"></div>
  <div style="position:absolute;top:40px;left:56px;right:56px;height:26px;border-top:1px solid #e3e1da;border-bottom:1px solid #e3e1da;
    background:repeating-linear-gradient(90deg,#d4d2ca 0 1px,transparent 1px 56px),repeating-linear-gradient(90deg,#e3e1da 0 1px,transparent 1px 14px);
    background-position:0 100%,0 100%;background-size:auto 9px,auto 5px;background-repeat:repeat-x"></div>
  <div style="display:flex;align-items:center;gap:18px;margin-bottom:34px">
    <svg width="72" height="72" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#17181c"/>
      <g transform="translate(-0.35 1.5)"><path d="M7 12 L10.5 20 L14 9 L17.5 20 L21 12" fill="none" stroke="#f7f6f3" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="24.5" cy="14.5" r="2.3" fill="#ff4f00"/></g></svg>
    <span style="font-size:44px;font-weight:800;letter-spacing:-.03em;color:#17181c">${wordmark}</span>
    <span style="font:600 15px ui-monospace,monospace;color:#e5484d;background:#fceeee;border:1px solid #f2d4d4;border-radius:999px;padding:6px 16px;margin-left:8px">${t.badge}</span>
  </div>
  <h1 style="font-size:76px;font-weight:800;letter-spacing:-.035em;color:#17181c;text-align:center;line-height:1.08;margin:0 80px">
    ${t.h1}</h1>
  <p style="font-size:25px;color:#67676d;margin-top:28px;max-width:840px;text-align:center;line-height:1.5">
    ${t.sub}</p>
  <div style="display:flex;gap:12px;margin-top:44px;font:600 13px ui-monospace,monospace">
    ${t.chips.map((c, i) => `<span style="border:1px solid #e3e1da;background:#fff;border-radius:999px;padding:9px 20px;color:${i === t.accent ? "#e5484d" : "#17181c"}">${c}</span>`).join("\n    ")}
  </div>
  <span style="position:absolute;bottom:44px;font:500 14px ui-monospace,monospace;color:#9c9ca2;letter-spacing:.1em">witness.zalize.com&nbsp;&nbsp;·&nbsp;&nbsp;github.com/wookat/witness</span>
</body></html>`;

const b = await chromium.launch();
for (const [lang, t] of Object.entries(T)) {
  const out = path.resolve(here, "..", "public", lang === "en" ? "og.png" : `og-${lang}.png`);
  const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
  await p.setContent(html(t));
  await p.screenshot({ path: out });
  await p.close();
  console.log("og:", out);
}
await b.close();
