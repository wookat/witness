// browser-level check for issue #7: does the document-level route patch flip
// permissionsPolicy.allowsFeature("microphone") when the site sends mic=()?
import { createServer } from "node:http";
import { chromium } from "playwright";
import { relaxMicPolicy } from "../dist/recorder.js";

const server = createServer((req, res) => {
  res.writeHead(200, {
    "content-type": "text/html",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    "set-cookie": ["a=1; Path=/", "b=2; Path=/"], // dup headers survive fulfill
  });
  res.end(`<html><body>policy test</body></html>`);
});
await new Promise(r => server.listen(0, r));
const url = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch({ headless: true, args: [
  "--use-fake-ui-for-media-stream",
  "--use-fake-device-for-media-stream",
]});

async function probe(withPatch) {
  const ctx = await browser.newContext({ permissions: ["microphone"] });
  if (withPatch) {
    await ctx.route("**/*", async route => {
      if (route.request().resourceType() !== "document") return route.fallback();
      try {
        const response = await route.fetch();
        const pp = response.headers()["permissions-policy"];
        if (pp == null) return route.fulfill({ response });
        await route.fulfill({ response, headers: { "permissions-policy": relaxMicPolicy(pp) } });
      } catch { return route.fallback(); }
    });
  }
  const page = await ctx.newPage();
  await page.goto(url);
  const r = await page.evaluate(async () => ({
    permState: await navigator.permissions.query({ name: "microphone" }).then(p => p.state).catch(e => "err:" + e.name),
    gum: await navigator.mediaDevices.getUserMedia({ audio: true })
      .then(s => { s.getTracks().forEach(t => t.stop()); return "ok"; })
      .catch(e => e.name),
  }));
  await ctx.close();
  return r;
}

const before = await probe(false);
const after = await probe(true);
console.log("unpatched:", JSON.stringify(before));
console.log("patched:  ", JSON.stringify(after));
await browser.close(); server.close();
if (before.gum !== "NotAllowedError") { console.error("FAIL: baseline should block mic, got " + before.gum); process.exit(1); }
if (after.gum !== "ok") { console.error("FAIL: patch did not enable mic, got " + after.gum); process.exit(1); }
console.log("PASS: permissions-policy mic rewrite verified in real chromium");
