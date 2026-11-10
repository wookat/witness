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
  assert.ok(md.includes("无任何反应"));
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

// ---------- renderPrompt: vocab + rules ----------

test("prompt: carries page vocab and the no-inference rule", () => {
  const p = renderPrompt("/tmp/s", [
    click(100, "提交订单"), { kind: "mark", t: 200, sel: "h3", text: "教程" },
    say(5000, "嗯", 5000, 5500),
  ]);
  assert.ok(p.includes("提交订单"));
  assert.ok(p.includes("教程"));
  assert.ok(p.includes("绝对不要从点击/滚动行为推断"));
  assert.ok(p.includes("同音字误识别"));
});

test("prompt: empty vocab omits the vocab line", () => {
  const p = renderPrompt("/tmp/s", [say(5000, "嗯", 5000, 5500)]);
  assert.ok(!p.includes("页面元素文字"));
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
