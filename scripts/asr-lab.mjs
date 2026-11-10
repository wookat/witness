// ASR lab: serve a record page, save user's webm, run all providers, print comparison.
// usage: node scripts/asr-lab.mjs [existing-audio.webm]
import http from "node:http";
import { writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const OUT = join(process.env.TEMP ?? ".", "wit-asr-lab.webm");
const PORT = 8393;

const providers = [
  { name: "doubao-web 豆包网页(VoiceGenie)", streaming: true, fn: "doubaoWeb" },
  { name: "doubao 豆包输入法(Seed-ASR)", streaming: true, fn: "doubao" },
  { name: "bcut 必剪(B站)", streaming: false, fn: "bcut" },
  { name: "快手", streaming: false, fn: "kuaishou" },
  { name: "剪映", streaming: false, fn: "jianying" },
  { name: "uncloseai(parakeet)", streaming: false, fn: "uncloseai" },
  { name: "notetakers(qwen3)", streaming: false, fn: "notetakers" },
];

async function bench(file) {
  const m = await import("../dist/asr-providers.js");
  const runs = providers.map(async p => {
    const t0 = Date.now();
    try {
      const segs = await m[p.fn](file);
      return { ...p, ok: true, ms: Date.now() - t0, segs };
    } catch (e) {
      return { ...p, ok: false, ms: Date.now() - t0, error: e.message?.slice(0, 120) };
    }
  });
  const results = await Promise.all(runs);
  console.log("\n══════════════ ASR BENCH ══════════════");
  for (const r of results) {
    console.log(`\n■ ${r.name}  [${r.streaming ? "流式" : "批处理"}]  ${r.ms}ms`);
    if (!r.ok) { console.log(`   ✗ ${r.error}`); continue; }
    console.log(`   ${r.segs.length} 段`);
    const txt = r.segs.map(s => s.text).join(" ");
    console.log(`   ${txt.slice(0, 400)}${txt.length > 400 ? "…" : ""}`);
  }
  console.log("\n═══════════════════════════════════════");
}

const existing = process.argv[2];
if (existing && existsSync(existing)) { bench(existing).then(() => process.exit(0)); }
else {
  const page = `<!doctype html><meta charset="utf8"><style>
body{font:14px/1.6 system-ui;max-width:640px;margin:60px auto;padding:0 20px}
button{font-size:16px;padding:10px 26px;border-radius:10px;border:0;background:#ff4f00;color:#fff;cursor:pointer}
#st{color:#888;margin:16px 0}#sr{background:#f6f6f4;padding:14px;border-radius:10px;min-height:80px;white-space:pre-wrap}
</style>
<h2>WIT ASR Lab</h2><p>点「开始」说一段话（10~30s），停即测。下方是浏览器实时 SR 预览（糙但即时）。</p>
<button id="b">● 开始</button><div id="st"></div><div id="sr"></div>
<script>
let mr, rec, out = "";
b.onclick = async () => {
  if (mr && mr.state === "recording") { mr.stop(); b.textContent = "● 开始"; return; }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
  const chunks = [];
  mr.ondataavailable = e => chunks.push(e.data);
  mr.onstop = async () => {
    stream.getTracks().forEach(t => t.stop());
    st.textContent = "上传转写中…";
    const r = await fetch("/up", { method: "POST", body: new Blob(chunks) });
    st.textContent = r.ok ? "已保存，看终端输出对比" : "保存失败";
  };
  mr.start(250); b.textContent = "■ 停止";
  try {
    const C = window.SpeechRecognition || window.webkitSpeechRecognition;
    rec = new C(); rec.lang = "zh-CN"; rec.continuous = true; rec.interimResults = true;
    rec.onresult = e => { let f = ""; for (const x of e.results) f += x[0].transcript; sr.textContent = f; };
    rec.start();
  } catch (e) {}
};
</script>`;
  const srv = http.createServer((req, res) => {
    if (req.url === "/") { res.end(page); return; }
    if (req.url === "/up" && req.method === "POST") {
      const ch = []; req.on("data", d => ch.push(d));
      req.on("end", async () => {
        writeFileSync(OUT, Buffer.concat(ch));
        res.end("ok");
        srv.close();
        console.log(`\nsaved ${OUT} — running providers…`);
        await bench(OUT);
        process.exit(0);
      });
      return;
    }
    res.statusCode = 404; res.end();
  });
  srv.listen(PORT, () => console.log(`ASR lab → http://localhost:${PORT}\n对着它说话，停了就自动跑全部接口。`));
}
