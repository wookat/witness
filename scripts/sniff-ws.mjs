// Sniff doubao.com network traffic — CDP capture of all WebSocket frames + XHR.
// User logs in manually and uses voice input; we dump the wire protocol.
import { chromium } from "playwright";
import { writeFileSync, appendFileSync } from "node:fs";

const OUT = "D:/yotal/Documents/Projects/witness/.tmp-sniff.jsonl";
writeFileSync(OUT, "");
const log = (o) => { const line = JSON.stringify(o) + "\n"; appendFileSync(OUT, line); const s = JSON.stringify(o); console.log(s.slice(0, 240)); };

const browser = await chromium.launch({ headless: false, args: ["--start-maximized"] });
const ctx = await browser.newContext({ viewport: null });
const page = await ctx.newPage();

const cdp = await ctx.newCDPSession(page);
await cdp.send("Network.enable");

cdp.on("Network.webSocketCreated", (e) => log({ type: "ws.create", url: e.url, ts: Date.now() }));
cdp.on("Network.webSocketFrameSent", (e) => log({ type: "ws.send", rid: e.requestId, data: e.response.payloadData?.slice(0, 8000), ts: Date.now() }));
cdp.on("Network.webSocketFrameReceived", (e) => log({ type: "ws.recv", rid: e.requestId, data: e.response.payloadData?.slice(0, 8000), ts: Date.now() }));
cdp.on("Network.requestWillBeSent", (e) => {
  const u = e.request.url;
  if (/speech|asr|voice|audio|transcri|voice_input|sami|snssdk|frontier|volc|bytedance/i.test(u))
    log({ type: "http.req", method: e.request.method, url: u, headers: e.request.headers, ts: Date.now() });
});
cdp.on("Network.responseReceived", (e) => {
  const u = e.response.url;
  if (/speech|asr|voice|audio|transcri|voice_input|sami|snssdk|frontier|volc|bytedance/i.test(u))
    log({ type: "http.res", status: e.response.status, url: u, ts: Date.now() });
});

console.log("浏览器已开。去 doubao.com 登录 → 开语音输入说几句话 → 我在抓所有 WS 帧。\n日志: " + OUT);
await page.goto("https://www.doubao.com/chat/");

// keep alive; log audio-relevant requests forever until closed
process.on("SIGINT", () => { console.log("saved:", OUT); process.exit(0); });
