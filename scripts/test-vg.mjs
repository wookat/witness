// VoiceGenie session test — try each DNS IP until a real WSS handshake completes
import { randomUUID } from "node:crypto";
import dns from "node:dns";
import tls from "node:tls";
import WebSocket from "ws";
import OpusScript from "opusscript";
import { webmToWav } from "../dist/webm2wav.js";

const FILE = process.argv[2] ?? "D:/yotal/Documents/Projects/ticketing/CPP+BZ/.witness/sessions/2026-11-10_16-29-15_localhost-8391-2026-11-10_12-57-51_witne/audio.webm";
const HOST = "frontier-audio-web-ws.doubao.com";

function vlen(v) { const o = []; do { let b = v & 0x7f; v = Math.floor(v / 128); if (v) b |= 0x80; o.push(b); } while (v); return Buffer.from(o); }
function fld(f, d) { const x = typeof d === "string" ? Buffer.from(d) : d; return Buffer.concat([vlen(f << 3 | 2), vlen(x.length), x]); }
function req(o) {
  const p = [];
  if (o.token) p.push(fld(2, o.token));
  if (o.svc) p.push(fld(3, o.svc));
  if (o.m) p.push(fld(5, o.m));
  if (o.j) p.push(fld(6, o.j));
  if (o.a?.length) p.push(fld(7, o.a));
  if (o.r) p.push(fld(8, o.r));
  if (o.s) p.push(Buffer.concat([vlen(9 << 3), vlen(o.s)]));
  return Buffer.concat(p);
}

const wsUrl = (tab) => `wss://${HOST}/api/v2/sami/voicegenie?api_app_key=GOqQpfo1fO7slHv8&namespace=VoiceGenie&version_code=20800&language=zh&device_platform=web&pkg_type=release_version&pc_version=3.45.1&region=CN&sys_region=CN&samantha_web=1&use-olympus-account=1&doubao_device_platform=web&aid=497858&real_aid=497858&device_id=7706602184038204971&doubao_pc_version=3.45.1&web_id=7706602180723263017&tea_uuid=7706602180723263017&web_platform=browser&web_tab_id=${tab}`;

function connectWs(ip) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl(randomUUID()), {
      headers: { "Origin": "https://www.doubao.com", "User-Agent": "Mozilla/5.0 Chrome/158" },
      createConnection: () => tls.connect({ host: ip, servername: HOST, port: 443 }),
      handshakeTimeout: 8000,
    });
    ws.on("open", () => resolve(ws));
    ws.on("error", (e) => reject(e));
    ws.on("unexpected-response", (_req, res) => reject(new Error("unexpected " + res.statusCode)));
  });
}

const ips = await dns.promises.resolve4(HOST);
console.log("candidate IPs:", ips.join(", "));
let ws = null, ip = null;
for (const cand of ips) {
  try { ws = await connectWs(cand); ip = cand; console.log("WS open via", ip); break; }
  catch (e) { console.log("fail", cand, e.message); }
}
if (!ws) { console.log("no working IP"); process.exit(1); }

const rid = randomUUID(); const t0 = Date.now(); let stage = 0, parts = 0, last = "";
const wav = (await webmToWav(FILE)).subarray(44);
const enc = new OpusScript(16000, 1, OpusScript.Application.AUDIO);

ws.send(req({ token: "GOqQpfo1fO7slHv8", svc: "VoiceGenie", m: "StartTask", r: rid }));
ws.on("message", (b) => {
  const u8 = b.toString("utf8");
  const strs = b.toString("latin1").match(/[\x20-\x7e]{6,}/g) || [];
  const j2 = strs.join(" | ");
  if (j2.includes("TaskStarted") && stage === 0) {
    stage = 1; console.log(`[+${Date.now() - t0}ms] task ok`);
    const session = {
      business: 1, enable_audio_input: true, query_mode: 2, interrupt_type: 0, request_type: 3,
      chat: { bot_id: "7234781073513644036", message_id: "", uid: "279691410283040", conversation_id: "local_" + Date.now(), is_conf_fetched: false, is_dora_onboarding: false, new_conversation: false, question_id: "" },
      asr: { audio_info: { channel: 1, format: process.env.FORMAT ?? "speech_opus", sample_rate: 16000 }, enable_punctuation: true, extra: { use_vad: true, use_itn: true, use_ddc: true, strong_ddc: true, enable_asr_twopass: true, disable_user_words: true } },
    };
    ws.send(req({ token: "GOqQpfo1fO7slHv8", svc: "VoiceGenie", m: "StartSession", r: rid, j: JSON.stringify(session) }));
    return;
  }
  if (j2.includes("SessionStarted") && stage === 1) {
    stage = 2;
    const SPEED = Number(process.env.SPEED ?? 1); // 1 = realtime pacing
    console.log(`[+${Date.now() - t0}ms] session ok, streaming ${Math.floor(wav.length / 640)} frames @${SPEED}x`);
    const useRaw = (process.env.FORMAT ?? "speech_opus") === "raw";
    const frames = [];
    for (let i = 0, f = 0; i < wav.length; i += 640, f++) {
      const lastF = i + 640 >= wav.length;
      const payload = useRaw
        ? wav.subarray(i, i + 640)
        : Buffer.from(enc.encode(new Int16Array(wav.buffer, wav.byteOffset + i, Math.min(320, (wav.length - i) / 2)), Math.min(320, (wav.length - i) / 2)));
      frames.push({ opus: payload, lastF, f });
    }
    let n = 0;
    const tick = setInterval(() => {
      if (n >= frames.length) {
        clearInterval(tick);
        ws.send(req({ token: "GOqQpfo1fO7slHv8", svc: "VoiceGenie", m: "EndASR", j: "{}", r: rid }));
        ws.send(req({ token: "GOqQpfo1fO7slHv8", svc: "VoiceGenie", m: "FinishSession", r: rid }));
        return;
      }
      const fr = frames[n];
      ws.send(req({ token: "GOqQpfo1fO7slHv8", svc: "VoiceGenie", m: "TaskRequest", j: "{}", a: fr.opus, r: rid, s: fr.lastF ? 9 : n === 0 ? 1 : 3 }));
      n++;
    }, 20 / SPEED);
    return;
  }
  const ji = u8.indexOf('{"results"');
  if (ji >= 0) {
    try {
      const j = JSON.parse(u8.slice(ji, u8.lastIndexOf("}") + 1));
      console.log(`  RES`, JSON.stringify(j.results?.map(r => ({ t: r.text, i: r.is_interim, st: r.start_time, et: r.end_time }))).slice(0, 300));
      const t = j.results?.[0]?.text;
      if (t && t !== last) { last = t; parts++; }
    } catch (e) { console.log("  parse err", String(e).slice(0, 60)); }
  }
  if (j2.includes("Failed")) console.log("FAIL", j2.slice(0, 250));
  if (j2.includes("SessionFinished")) { console.log(`=== DONE ${Date.now() - t0}ms, ${parts} partials ===`); console.log("FINAL:", last); process.exit(0); }
});
ws.on("error", (e) => console.log("WS ERR", e.message));
ws.on("close", (c, r) => { console.log("CLOSE", c, r.toString().slice(0, 100)); process.exit(0); });
setTimeout(() => { console.log("TIMEOUT parts=" + parts + " last:", last.slice(-80)); process.exit(0); }, 260000);
