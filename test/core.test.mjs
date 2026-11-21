import { test } from "node:test";
import assert from "node:assert/strict";
import { align } from "../dist/align.js";
import { renderMarkdown, renderPrompt, renderReviewHtml } from "../dist/session.js";

const say = (t, text, segStart = t, segEnd = t + 500) => ({ kind: "say", t, text, segStart, segEnd });
const click = (t, text = "按钮") => ({ kind: "click", t, sel: "button", x: 1, y: 2, text });
const meta = { url: "http://x", startedAt: 0, durationMs: 60000 };

// ---------- align ----------

test("align: whisper segments become say events sorted into stream", () => {
  const evs = [click(5000)];
  const out = align(evs, [{ start: 1, end: 2, text: "你好" }]);
  const i = out.findIndex(e => e.kind === "say");
  assert.equal(out[i].text, "你好");
  assert.equal(out[i].segStart, 1000);
  assert.ok(i < out.findIndex(e => e.kind === "click"));
});

test("align: real transcript replaces live SR fragments", () => {
  const evs = [say(1000, "碎片"), click(5000)];
  const out = align(evs, [{ start: 1, end: 2, text: "完整句子" }]);
  assert.equal(out.filter(e => e.kind === "say").length, 1);
  assert.equal(out.find(e => e.kind === "say").text, "完整句子");
});

test("align: no transcript keeps live SR says verbatim (no rewrite)", () => {
  const evs = [say(1000, "第一句。"), say(1600, "第二句。")];
  const out = align(evs, []);
  assert.deepEqual(out.filter(e => e.kind === "say").map(e => e.text), ["第一句。", "第二句。"]);
});

// ---------- renderMarkdown: speech-run grouping ----------

test("grouping: adjacent fragments render as ONE block with per-frag quotes", () => {
  const md = renderMarkdown([
    say(9000, "这个反馈。", 9400, 10100),
    say(11500, "有问题。", 11496, 11600),
    say(30000, "新问题了。", 29900, 30500),
  ], meta);
  const blocks = md.match(/### \d\d:\d\d · SAY/g) ?? [];
  assert.equal(blocks.length, 2);
  assert.ok(md.includes('> [`00:09`] “这个反馈。”'));
  assert.ok(md.includes('> [`00:11`] “有问题。”'));
  assert.ok(md.includes('### 00:30 · SAY “新问题了。”'));
});

test("grouping: interaction between fragments splits the run", () => {
  const md = renderMarkdown([
    say(9000, "前半句。", 9400, 10100),
    click(10500, "点了"),
    say(12000, "后半句。", 11400, 12000),
  ], meta);
  const blocks = md.match(/### \d\d:\d\d · SAY/g) ?? [];
  assert.equal(blocks.length, 2);
});

test("issue: explicit boundary splits runs and renders divider", () => {
  const md = renderMarkdown([
    say(9000, "第一个问题", 9000, 9500),
    { kind: "issue", t: 10000, n: 2 },
    say(11000, "第二个问题", 11000, 11500),
  ], meta);
  assert.ok(md.includes("### 00:10 · ⏺ ISSUE #2"));
  assert.equal((md.match(/### \d\d:\d\d · SAY/g) ?? []).length, 2);
});

test("grouping: >4s silence splits the run", () => {
  const md = renderMarkdown([
    say(9000, "第一段。", 9000, 9500),
    say(15000, "第二段。", 15000, 15500),
  ], meta);
  assert.equal((md.match(/### \d\d:\d\d · SAY/g) ?? []).length, 2);
});

// ---------- renderMarkdown: noise filtering ----------

test("noise: static-asset requests collapse into a hidden count", () => {
  const md = renderMarkdown([
    { kind: "req", t: 100, method: "GET", url: "http://x/app.js", resType: "script" },
    { kind: "req", t: 200, method: "GET", url: "http://x/style.css", resType: "stylesheet" },
    { kind: "req", t: 300, method: "GET", url: "http://x/api/data", resType: "fetch" },
    { kind: "res", t: 350, url: "http://x/api/data", status: 200 },
    say(5000, "嗯", 5000, 5500),
  ], meta);
  assert.ok(md.includes("hidden — see events.jsonl"));
  assert.ok(md.includes("/api/data"));
  assert.ok(!md.includes("app.js"));
});

test("noise: failed responses & console errors are NEVER hidden", () => {
  const md = renderMarkdown([
    { kind: "res", t: 100, url: "http://x/api/x", status: 500 },
    { kind: "console", t: 200, level: "error", text: "boom" },
    say(5000, "嗯", 5000, 5500),
  ], meta);
  assert.ok(md.includes("**500**"));
  assert.ok(md.includes("CONSOLE ERROR"));
});

// ---------- renderMarkdown: causal burst grouping ----------

test("burst: consequences within 1.8s of a click render indented under it", () => {
  const md = renderMarkdown([
    say(1000, "嗯", 1000, 1500),
    click(5000, "提交"),
    { kind: "res", t: 5300, url: "http://x/api/order", status: 500 },
    { kind: "mut", t: 5400, sel: "button", summary: "disabled" },
  ], meta);
  assert.ok(md.includes("  - `00:05` **NET ←** **500**"));
  assert.ok(md.includes("  - `00:05` **MUT**"));
});

test("burst: click followed by nothing reports 'no reaction' as evidence", () => {
  const md = renderMarkdown([
    say(1000, "嗯", 1000, 1500),
    click(5000, "没反应的按钮"),
  ], meta);
  assert.ok(md.includes("no page reaction"));
});

test("burst: consequence outside the window stays a standalone line", () => {
  const md = renderMarkdown([
    say(1000, "嗯", 1000, 1500),
    click(5000, "慢请求"),
    { kind: "res", t: 9000, url: "http://x/api/slow", status: 200 },
  ], meta);
  assert.ok(!md.includes("  - `00:09` **NET ←**"));
  assert.ok(md.includes("- `00:09` **NET ←**"));
});

test("burst: ambient scroll/shot does not close an open burst", () => {
  const md = renderMarkdown([
    say(1000, "嗯", 1000, 1500),
    click(5000, "提交"),
    { kind: "scroll", t: 5100, y: 900 },
    { kind: "res", t: 5600, url: "http://x/api/ok", status: 200 },
  ], meta);
  assert.ok(md.includes("  - `00:06` **NET ←**"));
});

// ---------- renderMarkdown: LLM assoc map ----------

test("assoc: featured hits only; title rendered; raw stays in jsonl", () => {
  const s = say(1000, "接口不对", 1000, 1500);
  const r = { kind: "res", t: 1200, url: "http://x/api/orders", status: 200 };
  const noise = { kind: "mut", t: 1300, sel: "div", summary: "unrelated" };
  const assoc = new Map([[s, { title: "订单列表为空", hits: new Set([r]) }]]);
  const md = renderMarkdown([s, r, noise], meta, undefined, assoc);
  assert.ok(md.includes("**→ 订单列表为空**"));
  assert.ok(md.includes("/api/orders"));
  assert.ok(!md.includes("unrelated"));
  assert.ok(md.includes("1 other events hidden"));
});

// ---------- v0.4.0: input values, id pairing, ws collapse, audio warning ----------

test("input: non-masked value renders verbatim, masked stays hidden", () => {
  const md = renderMarkdown([
    { kind: "input", t: 100, sel: "#q", masked: false, len: 5, value: "hello" },
    { kind: "input", t: 200, sel: "#pw", masked: true, len: 8 },
    say(5000, "嗯", 5000, 5500),
  ], meta);
  assert.ok(md.includes("“hello” (5 chars)"));
  assert.ok(md.includes("🔒masked"));
  assert.ok(!md.includes("8 chars”"));
});

test("net: req/res pair by id even when urls collide", () => {
  const md = renderMarkdown([
    { kind: "req", t: 100, id: 1, method: "GET", url: "http://x/api/a", resType: "fetch" },
    { kind: "req", t: 110, id: 2, method: "POST", url: "http://x/api/a", resType: "fetch" },
    { kind: "res", t: 200, id: 2, url: "http://x/api/a", status: 500 },
    { kind: "res", t: 210, id: 1, url: "http://x/api/a", status: 200 },
    say(5000, "嗯", 5000, 5500),
  ], meta);
  // the POST (id 2) must show **500**, GET (id 1) **200** — url-only pairing would swap them
  assert.ok(md.includes("POST http://x/api/a → **500**"));
  assert.ok(md.includes("GET http://x/api/a → **200**"));
});

test("net: truncated body is flagged", () => {
  const md = renderMarkdown([
    { kind: "req", t: 100, id: 1, method: "GET", url: "http://x/api/big", resType: "fetch" },
    { kind: "res", t: 200, id: 1, url: "http://x/api/big", status: 200, bodyPath: "bodies/r1.json", bodyTrunc: true },
    say(5000, "嗯", 5000, 5500),
  ], meta);
  assert.ok(md.includes("body, truncated](bodies/r1.json)"));
});

test("ws: frame floods collapse into one ×n line", () => {
  const md = renderMarkdown([
    say(1000, "嗯", 1000, 1500),
    { kind: "ws", t: 5000, url: "wss://x/chat", dir: "in", data: "{\"m\":1}" },
    { kind: "ws", t: 5100, url: "wss://x/chat", dir: "in", data: "{\"m\":2}" },
    { kind: "ws", t: 5200, url: "wss://x/chat", dir: "in", data: "{\"m\":3}" },
  ], meta);
  assert.ok(md.includes("WS ←"));
  assert.ok(md.includes("×3"));
  assert.equal((md.match(/WS ←/g) ?? []).length, 1);
});

test("header: audio captured but zero says → explicit warning", () => {
  const md = renderMarkdown([click(5000)], { ...meta, audio: true });
  assert.ok(md.includes("zero speech was recognized"));
  const md2 = renderMarkdown([say(5000, "有说话", 5000, 5500)], { ...meta, audio: true });
  assert.ok(!md2.includes("zero speech was recognized"));
});

// ---------- renderPrompt: vocab + rules ----------

test("prompt: carries page vocab and the no-inference rule", () => {
  const p = renderPrompt("/tmp/s", [
    click(100, "提交订单"), { kind: "mark", t: 200, sel: "h3", text: "教程" },
    say(5000, "嗯", 5000, 5500),
  ]);
  assert.ok(p.includes("提交订单"));
  assert.ok(p.includes("教程"));
  assert.ok(p.includes("never infer"));
  assert.ok(p.includes("homophone"));
});

test("prompt: empty vocab omits the vocab line", () => {
  const p = renderPrompt("/tmp/s", [say(5000, "嗯", 5000, 5500)]);
  assert.ok(!p.includes("Page element text"));
});

// ---------- renderReviewHtml ----------

test("review html: audio player + blocks data + no external deps", () => {
  const html = renderReviewHtml([
    say(1000, "你好", 1000, 1500), say(1800, "在吗", 1800, 2300), click(9000),
  ], meta);
  assert.ok(html.includes('<audio id="au" src="audio.webm"'));
  assert.ok(html.includes('"frags"'));
  assert.ok(!html.includes("https://cdn."));
});

// ---------- local-asr / transcription provider chain ----------

import { whisperLang, shouldUseFreeCloud, hasTranscriber } from "../dist/transcribe.js";
import { transcribeTargets, resolveModelPreset, MODEL_PRESETS, LOCAL_ASR_DEFAULT_MODEL } from "../dist/local-asr.js";

test("whisperLang: BCP-47 → ISO-639-1, undefined stays undefined", () => {
  assert.equal(whisperLang("zh-CN"), "zh");
  assert.equal(whisperLang("en-US"), "en");
  assert.equal(whisperLang("ko"), "ko");
  assert.equal(whisperLang(undefined), undefined);
  assert.equal(whisperLang(""), undefined);
});

test("shouldUseFreeCloud: zh/auto allowed, explicit non-zh skipped", () => {
  assert.equal(shouldUseFreeCloud(undefined), true);
  assert.equal(shouldUseFreeCloud("zh-CN"), true);
  assert.equal(shouldUseFreeCloud("zh"), true);
  assert.equal(shouldUseFreeCloud("en-US"), false);
  assert.equal(shouldUseFreeCloud("ko-KR"), false);
  assert.equal(shouldUseFreeCloud("ja"), false);
});

test("resolveModelPreset: presets map to faster-whisper HF repos, raw ids pass through", () => {
  assert.equal(resolveModelPreset("small"), "Systran/faster-whisper-small");
  assert.equal(resolveModelPreset("TINY"), "Systran/faster-whisper-tiny");
  assert.equal(resolveModelPreset("turbo"), "deepdml/faster-whisper-large-v3-turbo-ct2");
  assert.equal(resolveModelPreset("vendor/custom-model"), "vendor/custom-model");
  assert.equal(resolveModelPreset(undefined), LOCAL_ASR_DEFAULT_MODEL);
  for (const id of Object.values(MODEL_PRESETS)) assert.ok(id.includes("/"), id);
});

test("transcribeTargets: WHISPER_BASE_URL env wins, then local config, then keys", () => {
  const saved = { ...process.env };
  try {
    delete process.env.WHISPER_BASE_URL; delete process.env.GROQ_API_KEY; delete process.env.OPENAI_API_KEY;
    const noEnv = transcribeTargets();
    // local config in repo .witness/config.json may or may not exist — env part must be empty
    assert.ok(!noEnv.some(t => t.baseURL.includes("groq") || t.baseURL.includes("openai.com")));

    process.env.WHISPER_BASE_URL = "http://localhost:9999/v1/";
    process.env.WHISPER_MODEL = "whisper-custom";
    const withEnv = transcribeTargets();
    assert.equal(withEnv[0].baseURL, "http://localhost:9999/v1"); // trailing slash stripped
    assert.equal(withEnv[0].model, "whisper-custom");
    assert.equal(withEnv[0].kind, "openai");

    process.env.GROQ_API_KEY = "gsk_test";
    const withGroq = transcribeTargets();
    const groq = withGroq.find(t => t.baseURL.includes("groq"));
    assert.equal(groq.model, "whisper-large-v3-turbo");
    assert.equal(hasTranscriber(), true);
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
});

// ---------- 0.6.0: ASR confidence ----------

test("align: low-confidence segments flag say events", () => {
  const out = align([], [
    { start: 0, end: 1, text: "清晰的话", conf: 0.9 },
    { start: 2, end: 3, text: "模糊的部分", conf: 0.3, lowConf: true },
  ]);
  const says = out.filter(e => e.kind === "say");
  assert.equal(says[0].lowConf, undefined);
  assert.equal(says[1].lowConf, true);
});

test("markdown: low-confidence say run carries the warning marker", () => {
  const md = renderMarkdown([
    { kind: "say", t: 1000, text: "可能听错了", segStart: 1000, segEnd: 2000, lowConf: true },
  ], meta);
  assert.ok(md.includes("low-confidence ASR"), md.slice(0, 400));
});

test("markdown: confident say run has no marker", () => {
  const md = renderMarkdown([say(1000, "正常的一句。")], meta);
  assert.ok(!md.includes("low-confidence ASR"));
});

// ---------- 0.6.0: model management helpers ----------

test("modelCacheDirName / installedModels shape", async () => {
  const la = await import("../dist/local-asr.js");
  assert.equal(la.modelCacheDirName("Systran/faster-whisper-small"), "models--Systran--faster-whisper-small");
  assert.ok(Array.isArray(la.installedModels()));
  assert.equal(la.liveModelReady("Z:/nonexistent-dir-xyz"), false);
});

// ---------- issue #7: Permissions-Policy mic rewrite ----------

test("relaxMicPolicy: microphone directive → (self), others untouched", async () => {
  const { relaxMicPolicy } = await import("../dist/recorder.js");
  assert.equal(relaxMicPolicy("microphone=()"), "microphone=(self)");
  assert.equal(relaxMicPolicy("camera=(), microphone=(), geolocation=()"), "camera=(), microphone=(self), geolocation=()");
  assert.equal(relaxMicPolicy('microphone=(self "https://x.com"), camera=()'), "microphone=(self), camera=()");
  assert.equal(relaxMicPolicy("geolocation=*, camera=()"), "geolocation=*, camera=()");
  assert.equal(relaxMicPolicy("MICROPHONE=()"), "microphone=(self)");
});

// ---------- audit fixes: review.html, page-script, associate, segments, network ----------

import vm from "node:vm";

test("review html: single-fragment SAY blocks are preserved and embedded script is valid JS", () => {
  const html = renderReviewHtml([
    say(1000, "单独一句报错", 1000, 1800),
    click(3000, "支付"),
    say(9000, "另一句单独的话", 9000, 9600),
  ], { ...meta, url: 'https://example.com/"<script>', title: 'Demo <tag>' });
  const dm = html.match(/<script>const D=(\{[\s\S]*?\});<\/script>/);
  assert.ok(dm, "embedded D payload present");
  const parsed = JSON.parse(dm[1]);
  const sayBlocks = parsed.blocks.filter(b => b.frags && b.frags.length);
  assert.equal(sayBlocks.length, 2);
  assert.equal(sayBlocks[0].frags[0].text, "单独一句报错");
  assert.equal(sayBlocks[1].frags[0].text, "另一句单独的话");
  // XSS escaping in title & header
  assert.ok(!html.includes('<title>Witness · https://example.com/"<script></title>'));
  // Validate main inline script parses cleanly
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  assert.ok(scripts.length >= 2);
  assert.doesNotThrow(() => new vm.Script(scripts.at(-1)));
});

test("review html: blocks javascript: URLs in header href", () => {
  const html = renderReviewHtml([], { ...meta, url: "javascript:alert(1)" });
  assert.ok(!html.includes('href="javascript:'));
});

test("page-script: compiles as valid JS with pause PCM guard and plain-key guard", async () => {
  const { PAGE_SCRIPT } = await import("../dist/page-script.js");
  const code = PAGE_SCRIPT("zh-CN", { sr: false, pcm: true, asrLabel: "local" });
  assert.doesNotThrow(() => new vm.Script(code));
  assert.ok(code.includes("if (W.paused || W.stopped)"));
  assert.ok(code.includes("const plain = !e.ctrlKey && !e.metaKey && !e.altKey"));
});

test("associate: briefEvent extracts real input.value, error.message, and mut.sel/summary", async () => {
  const { briefEvent } = await import("../dist/associate.js");
  assert.ok(briefEvent({ kind: "input", t: 1, sel: "#code", masked: false, len: 4, value: "SAVE" }).includes("SAVE"));
  assert.ok(briefEvent({ kind: "input", t: 2, sel: "#pw", masked: true, len: 8 }).includes("[masked]"));
  assert.ok(briefEvent({ kind: "error", t: 3, message: "TypeError: boom" }).includes("TypeError: boom"));
  assert.ok(briefEvent({ kind: "mut", t: 4, sel: "button.pay", summary: "attr disabled: → true" }).includes("button.pay attr disabled"));
});

test("segments: flags status=0 failures, ignores console.debug, scopes vocab per segment", async () => {
  const { extractSegments } = await import("../dist/segments.js");
  const segs = extractSegments([
    say(1000, "支付按钮坏了", 1000, 1500),
    click(1600, "支付按钮"),
    { kind: "res", t: 1800, id: 1, url: "http://x/api/pay", status: 0 },
    { kind: "console", t: 1900, level: "debug", text: "noisy debug" },
    say(9000, "样式不对", 9000, 9500),
    click(9600, "支付按钮"),
  ]);
  assert.equal(segs.length, 2);
  assert.equal(segs[0].errors.length, 1); // status=0 counted, console.debug ignored
  assert.ok(segs[0].suspects.some(s => s.via === "vocab"));
  assert.ok(!segs[1].suspects.some(s => s.via === "vocab")); // segment 2 didn't say 支付
});

test("network: redactUrl masks sensitive query params and preserves normal params", async () => {
  const { redactUrl, maskPostData } = await import("../dist/network.js");
  assert.equal(redactUrl("https://api.example.com/v1?page=2&token=secret123&api_key=abc"), "https://api.example.com/v1?page=2&token=***&api_key=***");
  assert.equal(redactUrl("https://api.example.com/v1?page=2&q=hello"), "https://api.example.com/v1?page=2&q=hello");
  assert.equal(maskPostData('{"password":"p1","user":"alice"}'), '{"password":"***","user":"alice"}');
});
