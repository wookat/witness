// ASR lab — REAL streaming edition.
// Browser captures 16kHz mono PCM via AudioWorklet, pushes over WS while you speak.
// Streaming providers get live PCM; batch providers run on the full WAV at stop.
// usage: node scripts/asr-lab.mjs [existing-audio.webm]
import http from "node:http";
import { WebSocketServer } from "ws";
import { writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const PORT = 8393;
const SR = 16000;

const page = `<!doctype html><meta charset="utf8"><title>WIT ASR Lab — realtime</title><style>
body{font:14px/1.6 system-ui;max-width:900px;margin:40px auto;padding:0 20px;background:#fafaf8;color:#222}
button{font-size:16px;padding:10px 26px;border-radius:10px;border:0;background:#ff4f00;color:#fff;cursor:pointer}
#st{color:#888;margin:12px 0}
#sr{background:#f0efe9;padding:12px 14px;border-radius:10px;min-height:40px;white-space:pre-wrap;color:#555;font-size:13px;margin-bottom:18px}
.card{background:#fff;border:1px solid #e5e3dc;border-radius:12px;padding:14px 16px;margin-bottom:12px}
.card h3{margin:0 0 2px;font-size:15px;display:flex;gap:8px;align-items:center}
.badge{font-size:11px;padding:2px 8px;border-radius:99px;font-weight:600}
.b-st{background:#e7f3ff;color:#0969da}.b-ba{background:#f5f0e6;color:#8a6d1f}
.meta{font-size:12px;color:#999}
.txt{margin-top:8px;white-space:pre-wrap}
.txt .partial{color:#bbb}
.err{color:#c00;font-size:13px;margin-top:6px}
.spin{display:inline-block;width:10px;height:10px;border:2px solid #ddd;border-top-color:#ff4f00;border-radius:50%;animation:sp .8s linear infinite}
@keyframes sp{to{transform:rotate(360deg)}}
</style>
<h2>WIT ASR Lab — realtime</h2>
<p>点「开始」直接说：<b>流式引擎边听边出字</b>；批处理引擎停录后跑（它们拿不到流）。</p>
<button id="b">● 开始</button> <span id="st"></span>
<h4 style="margin:18px 0 6px;color:#999">浏览器 SR 实时预览（糙，对照组）</h4><div id="sr">—</div>
<div id="out"></div>
<script>
let ws, ctx, node, stream, rec, recording=false;
const R_ = () => ctx.sampleRate / 16000;
let carry = new Float32Array(0), phase = 0;
function resample(f32) {
  const all = new Float32Array(carry.length + f32.length);
  all.set(carry); all.set(f32, carry.length);
  const R = R_(), out = [];
  for (; phase < all.length - 1; phase += R) {
    const i = Math.floor(phase), s = all[i] + (all[i+1]-all[i])*(phase-i);
    out.push(Math.max(-32768, Math.min(32767, Math.round(s * 32768))));
  }
  carry = all.slice(Math.floor(phase)); phase -= Math.floor(phase);
  if (!out.length) return null;
  const b = new Int16Array(out); return b.buffer;
}
const cards = {};
function card(ev){
  let c = cards[ev.name];
  if(!c){
    c = document.createElement('div'); c.className='card';
    c.innerHTML = '<h3><span class="spin"></span>'+ (ev.label||ev.name) +
      '<span class="badge '+(ev.streaming?'b-st':'b-ba')+'">'+(ev.streaming?'流式':'批处理')+'</span></h3>'+
      '<div class="meta">'+(ev.streaming?'live':'waiting…')+'</div><div class="txt"></div>';
    cards[ev.name]=c; out.appendChild(c);
  }
  if(ev.partial!==undefined){
    c.querySelector('.txt').innerHTML='<span class="partial">'+ev.partial.replace(/</g,'&lt;')+'</span>';
    c.querySelector('.meta').textContent='live · '+new Date().toLocaleTimeString();
    return;
  }
  c.querySelector('.spin')?.remove();
  c.querySelector('.meta').textContent=ev.ms!=null?(ev.ms/1000).toFixed(1)+'s':'done';
  const t=c.querySelector('.txt');
  if(ev.ok){const full=(ev.segs||[]).map(s=>s.text).join(' ');t.textContent=full||'(空)'}
  else t.innerHTML='<div class="err">✗ '+String(ev.error).replace(/</g,'&lt;')+'</div>';
}
b.onclick = async () => {
  if (recording) {
    recording=false;
    ws.send(JSON.stringify({type:'stop'}));
    try{node?.disconnect();ctx?.close();stream?.getTracks().forEach(t=>t.stop())}catch{}
    try{rec?.stop()}catch{}
    b.textContent='● 开始'; st.textContent='收尾中…';
    return;
  }
  out.innerHTML=''; for(const k in cards) delete cards[k]; sr.textContent='—';
  ws = new WebSocket('ws://'+location.host+'/audio');
  ws.binaryType='arraybuffer';
  ws.onmessage = e => { const ev=JSON.parse(e.data); if(ev.type==='done'){st.textContent='完成';return} card(ev) };
  ws.onopen = async () => {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount:1, echoCancellation:true } });
    ctx = new AudioContext();
    await ctx.audioWorklet.addModule('/worklet.js');
    const src = ctx.createMediaStreamSource(stream);
    node = new AudioWorkletNode(ctx, 'cap');
    node.port.onmessage = e => { const p = resample(e.data); if (p && ws.readyState===1) ws.send(p); };
    const mute = ctx.createGain(); mute.gain.value=0;
    src.connect(node); node.connect(mute); mute.connect(ctx.destination);
    carry = new Float32Array(0); phase = 0;
    ws.send(JSON.stringify({type:'start'}));
    recording=true; b.textContent='■ 停止'; st.textContent='录中… 说';
    try {
      const C = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!C) { sr.textContent='(此浏览器无 SR)'; }
      else {
        rec = new C(); rec.lang = 'zh-CN'; rec.continuous = true; rec.interimResults = true;
        rec.onresult = e => { let f=''; for (const x of e.results) f += x[0].transcript; sr.textContent = f; };
        rec.onerror = e => { sr.textContent='SR 挂了: '+e.error+'（后端是 Google，国内网络常断——这就是为什么要逆向接口）'; };
        rec.onend = () => { if(recording) try{rec.start()}catch{} }; // SR 自己会超时断，重启续上
        rec.start();
      }
    } catch(e){ sr.textContent='SR 启动失败: '+e.message; }
  };
};
</script>`;

const worklet = `class P extends AudioWorkletProcessor {
  process(i){ const c=i[0][0]; if(c) this.port.postMessage(c.slice(0)); return true }
}
registerProcessor('cap', P);`;

function wavHeader(pcmLen) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcmLen, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(pcmLen, 40);
  return h;
}

async function batchProviders(wavFile, emit) {
  const m = await import("../dist/asr-providers.js");
  const list = [["bcut 必剪(B站)", "bcut"]]; // dead providers removed: 快手/剪映/uncloseai/notetakers all confirmed gone
  await Promise.all(list.map(async ([label, fn]) => {
    const t0 = Date.now();
    try { emit({ name: fn, label, ok: true, streaming: false, ms: Date.now() - t0, segs: await m[fn](wavFile) }); }
    catch (e) { emit({ name: fn, label, ok: false, streaming: false, ms: Date.now() - t0, error: e.message?.slice(0, 160) }); }
  }));
}

const srv = http.createServer((req, res) => {
  if (req.url === "/") { res.end(page); return; }
  if (req.url === "/worklet.js") { res.writeHead(200, { "Content-Type": "application/javascript" }); res.end(worklet); return; }
  res.statusCode = 404; res.end();
});

const wss = new WebSocketServer({ server: srv, path: "/audio" });
wss.on("connection", ws => {
  const send = ev => { try { ws.send(JSON.stringify(ev)); } catch {} };
  const pcmAll = [];
  const live = []; // {s, name, label, t0, sent}
  let stopped = false;

  const flush = setInterval(() => {
    const all = Buffer.concat(pcmAll);
    for (const l of live) {
      if (all.length > l.sent) { l.s.push(all.subarray(l.sent)); l.sent = all.length; }
    }
  }, 40);

  ws.on("message", async (m, isBin) => {
    if (isBin) { pcmAll.push(Buffer.from(m)); return; }
    let msg; try { msg = JSON.parse(m.toString()); } catch { return; }

    if (msg.type === "start") {
      const { openLiveVg } = await import("../dist/doubao-web.js");
      const { openLiveIme } = await import("../dist/doubao.js");
      const t0 = Date.now();
      openLiveVg().then(s => {
        live.push({ s, name: "doubao-web", sent: 0 });
        s.onPartial((t, fin) => send({ name: "doubao-web", label: "doubao-web 豆包网页(VoiceGenie)", streaming: true, partial: t }));
      }).catch(e => send({ name: "doubao-web", label: "doubao-web 豆包网页(VoiceGenie)", streaming: true, ok: false, error: "open: " + e.message.slice(0, 120) }));
      openLiveIme().then(s => {
        live.push({ s, name: "doubao", sent: 0 });
        s.onPartial(t => send({ name: "doubao", label: "doubao 豆包输入法(Seed-ASR)", streaming: true, partial: t }));
      }).catch(e => send({ name: "doubao", label: "doubao 豆包输入法(Seed-ASR)", streaming: true, ok: false, error: "open: " + e.message.slice(0, 120) }));
    }

    if (msg.type === "stop" && !stopped) {
      stopped = true;
      const pcm = Buffer.concat(pcmAll);
      const wavFile = join(process.env.TEMP ?? ".", "wit-asr-live.wav");
      writeFileSync(wavFile, Buffer.concat([wavHeader(pcm.length), pcm]));
      console.log(`recorded ${(pcm.length / 32000).toFixed(1)}s → ${wavFile}`);
      const labels = { "doubao-web": "doubao-web 豆包网页(VoiceGenie)", "doubao": "doubao 豆包输入法(Seed-ASR)" };
      const liveDone = live.map(async l => {
        const t0 = Date.now();
        try { const segs = await l.s.end(); send({ name: l.name, label: labels[l.name], streaming: true, ok: true, ms: Date.now() - t0, segs }); }
        catch (e) { send({ name: l.name, label: labels[l.name], streaming: true, ok: false, ms: Date.now() - t0, error: e.message?.slice(0, 160) }); }
      });
      await Promise.all([...liveDone, batchProviders(wavFile, send)]);
      send({ type: "done" });
    }
  });
  ws.on("close", () => clearInterval(flush));
});

const existing = process.argv[2];
if (existing && existsSync(existing)) {
  // offline bench: file → all providers (streaming ones at file pacing)
  (async () => {
    const m = await import("../dist/asr-providers.js");
    const web = await import("../dist/doubao-web.js");
    const list = [
      { name: "doubao-web", label: "doubao-web 豆包网页(VoiceGenie)", streaming: true, run: f => web.doubaoWebStt(f, t => console.log("  [vg]", t.slice(-40)), 2) },
      { name: "doubao", label: "doubao 豆包输入法(Seed-ASR)", streaming: true, run: f => m.doubao(f) },
      { name: "bcut", label: "bcut 必剪(B站)", streaming: false, run: f => m.bcut(f) },
    ];
    await Promise.all(list.map(async p => {
      const t0 = Date.now();
      try { const segs = await p.run(existing); console.log(`■ ${p.label} [${p.streaming ? "流式" : "批处理"}] ${((Date.now() - t0) / 1000).toFixed(1)}s → ${segs.length}段 ${segs.map(s => s.text).join(" ").slice(0, 200)}`); }
      catch (e) { console.log(`■ ${p.label} ✗ ${e.message?.slice(0, 100)}`); }
    }));
    process.exit(0);
  })();
} else {
  const boot = (tries = 5) => srv.once("error", e => {
    if (e.code === "EADDRINUSE" && --tries) { console.log(`port busy, retry in 1.5s (${tries} left)`); setTimeout(() => srv.listen(PORT), 1500); }
    else throw e;
  }).listen(PORT, () => console.log(`ASR lab (realtime) → http://localhost:${PORT}\n边说边出字，停录后跑批处理对照。`));
  boot();
}
