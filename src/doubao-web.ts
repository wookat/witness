/** Doubao web VoiceGenie — true streaming ASR via the doubao.com web socket.
 *  No device registration: api_app_key is embedded in the web bundle.
 *  Captured from a live doubao.com session; raw PCM 16kHz mono, 20ms frames. */
import { randomUUID } from "node:crypto";
import dns from "node:dns";
import tls from "node:tls";
import { readFileSync } from "node:fs";
import WebSocket from "ws";
import { webmToWav } from "./webm2wav.js";
import type { AsrSeg } from "./asr-providers.js";

const HOST = "frontier-audio-web-ws.doubao.com";
const APP_KEY = "GOqQpfo1fO7slHv8";
const DEVICE_ID = "7706602184038204971";
const WEB_ID = "7706602180723263017";
const FRAME = 640; // 20ms @16kHz mono s16le

const wsUrl = (tab: string, lang?: string) =>
  `wss://${HOST}/api/v2/sami/voicegenie?api_app_key=${APP_KEY}&namespace=VoiceGenie` +
  `&version_code=20800&language=${lang ?? "zh"}&device_platform=web&pkg_type=release_version&pc_version=3.45.1` +
  `&region=CN&sys_region=CN&samantha_web=1&use-olympus-account=1&doubao_device_platform=web` +
  `&aid=497858&real_aid=497858&device_id=${DEVICE_ID}&doubao_pc_version=3.45.1` +
  `&web_id=${WEB_ID}&tea_uuid=${WEB_ID}&web_platform=browser&web_tab_id=${tab}`;

// --- minimal protobuf (same SAMI family as src/doubao.ts) ---
function vlen(v: number): Buffer { const o: number[] = []; do { let b = v & 0x7f; v = Math.floor(v / 128); if (v) b |= 0x80; o.push(b); } while (v); return Buffer.from(o); }
function field(f: number, d: Buffer | string): Buffer { const x = typeof d === "string" ? Buffer.from(d) : d; return Buffer.concat([vlen(f << 3 | 2), vlen(x.length), x]); }
function marshalReq(o: { token?: string; svc?: string; method?: string; payload?: string; audio?: Buffer; rid?: string; state?: number }): Buffer {
  const p: Buffer[] = [];
  if (o.token) p.push(field(2, o.token));
  if (o.svc) p.push(field(3, o.svc));
  if (o.method) p.push(field(5, o.method));
  if (o.payload) p.push(field(6, o.payload));
  if (o.audio?.length) p.push(field(7, o.audio));
  if (o.rid) p.push(field(8, o.rid));
  if (o.state) p.push(Buffer.concat([vlen(9 << 3), vlen(o.state)]));
  return Buffer.concat(p);
}
interface Resp { msgType: string; code: number; msg: string; resultJson: string }
function unmarshalResp(data: Buffer): Resp {
  const r: Resp = { msgType: "", code: 0, msg: "", resultJson: "" };
  let off = 0;
  const rv = (): number => { let v = 0, s = 0; while (true) { const c = data[off++]; v += (c & 0x7f) * 2 ** s; s += 7; if (!(c & 0x80)) return v; } };
  while (off < data.length) {
    const tag = rv(); const f = tag >> 3, w = tag & 7;
    if (w === 0) { if (f === 5) r.code = rv(); else rv(); }
    else if (w === 2) { const l = rv(); const s = data.subarray(off, off + l).toString(); off += l;
      if (f === 4) r.msgType = s; else if (f === 6) r.msg = s; else if (f === 7) r.resultJson = s; }
    else if (w === 1) off += 8;
    else if (w === 5) off += 4;
    else break;
  }
  return r;
}

// CDN IPs rotate and half of them never finish the WSS upgrade — pick by real open
async function openWs(lang?: string): Promise<WebSocket> {
  const ips = await dns.promises.resolve4(HOST).catch(() => [] as string[]);
  const cands = ips.length ? ips : [HOST];
  let lastErr: unknown = new Error("dns failed");
  for (const ip of cands) {
    try {
      return await new Promise<WebSocket>((resolve, reject) => {
        const ws = new WebSocket(wsUrl(randomUUID(), lang), {
          headers: { Origin: "https://www.doubao.com", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/158" },
          createConnection: () => tls.connect({ host: ip, servername: HOST, port: 443 }),
          handshakeTimeout: 8000,
        });
        ws.on("open", () => resolve(ws));
        ws.on("error", reject);
        ws.on("unexpected-response", (_q: unknown, res: { statusCode: number }) => reject(new Error("http " + res.statusCode)));
      });
    } catch (e) { lastErr = e; }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** Live push-mode session for the ASR lab: feed PCM as the mic produces it. */
export interface LiveVg {
  push(pcm: Buffer): void;
  end(): Promise<AsrSeg[]>;
  onPartial(cb: (t: string, fin: boolean) => void): void;
  /** fires when the backend commits a sentence (is_interim=false) with vad timing */
  onSentence(cb: (s: { text: string; start: number; end: number }) => void): void;
}

/** BCP-47 → the short tag VoiceGenie expects ("en-US" → "en"). */
export const langTag = (l?: string) => l ? l.split("-")[0].toLowerCase() : undefined;

/** Open a VoiceGenie session and stream whatever PCM you push, at realtime pace. */
export async function openLiveVg(lang?: string): Promise<LiveVg> {
  const ws = await openWs(langTag(lang));
  const rid = randomUUID();
  const q: Buffer[] = [];
  let carry = Buffer.alloc(0);
  let ended = false, finSent = false, stage: "task" | "session" | "audio" = "task";
  let cb: ((t: string, fin: boolean) => void) | undefined;
  let scb: ((s: { text: string; start: number; end: number }) => void) | undefined;
  let last = "", committed = "", lastEnd = 0, f = 0;
  const sentences = new Map<number, AsrSeg>();

  let finish!: (err?: Error) => void;
  const done = new Promise<AsrSeg[]>((resolve, reject) => {
    finish = (err?: Error) => { clearInterval(tick); try { ws.close(); } catch {} err ? reject(err) : resolve(buildSegs()); };
    const buildSegs = (): AsrSeg[] => {
      const sents = [...sentences.values()].filter(s => s.text);
      if (sents.length) return sents;
      return last ? [{ start: 0, end: 0, text: last }] : [];
    };
    const killer = setTimeout(() => finish(new Error("doubao-web live timeout")), 600_000);

    const tick = setInterval(() => {
      if (stage !== "audio" || finSent) return;
      if (q.length) {
        const isLast = ended && q.length === 1;
        ws.send(marshalReq({ svc: "VoiceGenie", method: "TaskRequest",
          payload: JSON.stringify({ extra: isLast ? { finish_audio: true } : {}, timestamp_ms: Date.now() }),
          audio: q.shift()!, rid, state: isLast ? 9 : f === 0 ? 1 : 3 }));
        f++;
        return;
      }
      if (ended) {
        finSent = true;
        try {
          ws.send(marshalReq({ token: APP_KEY, svc: "VoiceGenie", method: "EndASR", payload: "{}", rid }));
          ws.send(marshalReq({ token: APP_KEY, svc: "VoiceGenie", method: "FinishSession", rid }));
        } catch { return finish(); }
        // server sometimes never answers SessionFinished — settle with the segs we already have
        setTimeout(() => finish(), 8000).unref();
      }
    }, 20);

    ws.on("message", (b: Buffer) => {
      const resp = unmarshalResp(b);
      if (resp.msgType === "TaskFailed" || resp.msgType === "SessionFailed") { clearTimeout(killer); return finish(new Error(`${resp.msgType} code=${resp.code} ${resp.msg || resp.resultJson}`.trim())); }
      if (resp.msgType === "TaskStarted" && stage === "task") {
        stage = "session";
        ws.send(marshalReq({ token: APP_KEY, svc: "VoiceGenie", method: "StartSession", rid, payload: JSON.stringify({
          business: 1, enable_audio_input: true, query_mode: 2, interrupt_type: 0, request_type: 3,
          chat: { bot_id: "7234781073513644036", message_id: "", uid: "279691410283040", conversation_id: "local_" + Date.now(), is_conf_fetched: false, is_dora_onboarding: false, new_conversation: false, question_id: "" },
          asr: { audio_info: { channel: 1, format: "raw", sample_rate: 16000 }, enable_punctuation: true,
            ...(langTag(lang) ? { language: langTag(lang) } : {}),
            extra: { use_vad: true, use_itn: true, use_ddc: true, strong_ddc: true, enable_asr_twopass: true, disable_user_words: true } },
        }) }));
        return;
      }
      if (resp.msgType === "SessionStarted" && stage === "session") { stage = "audio"; return; }
      if (resp.resultJson) {
        try {
          const j = JSON.parse(resp.resultJson);
          const results = j?.results ?? [];
          const t = results[0]?.text;
          const interim = results[0]?.is_interim;
          if (t && t !== last) { last = t; cb?.(t, interim === false); }
          if (t && interim === false) {
            // cumulative text — sentence is the newly-committed delta
            const delta = t.startsWith(committed) ? t.slice(committed.length).trim() : t;
            committed = t;
            const vad = j?.extra?.vad_result?.[0];
            const end = vad?.[1] != null ? vad[1] / 1000 : f * 0.02;
            if (delta) {
              const seg = { text: delta, start: vad?.[0] != null ? vad[0] / 1000 : lastEnd, end };
              sentences.set(sentences.size, seg);
              lastEnd = end;
              scb?.(seg);
            }
          }
          for (const r of results.slice(1)) {
            if ((r.stream_asr_finish || r.is_interim === false) && r.start_time != null && r.end_time != null)
              sentences.set(r.index ?? sentences.size, { start: r.start_time, end: r.end_time, text: r.text ?? "" });
          }
        } catch {}
      }
      if (resp.msgType === "SessionFinished") { clearTimeout(killer); finish(); }
    });
    ws.on("error", () => { clearTimeout(killer); finish(new Error("doubao-web ws error")); });
    ws.on("close", () => { clearTimeout(killer); finish(last ? undefined : new Error("closed, no result")); });
  });
  void done.catch(() => {}); // suppress unhandled rejection until end() attaches

  ws.send(marshalReq({ token: APP_KEY, svc: "VoiceGenie", method: "StartTask", rid }));

  let endPromise: Promise<AsrSeg[]> | null = null;
  return {
    push(pcm) {
      carry = Buffer.concat([carry, pcm]);
      while (carry.length >= FRAME) { q.push(carry.subarray(0, FRAME)); carry = carry.subarray(FRAME); }
    },
    end() {
      if (carry.length) { q.push(Buffer.concat([carry, Buffer.alloc(FRAME - carry.length)])); carry = Buffer.alloc(0); }
      ended = true;
      // stream never reached the audio stage (or socket already dead): no SessionFinished will come
      if (stage !== "audio") queueMicrotask(() => finish());
      return (endPromise ??= done);
    },
    onPartial(c) { cb = c; },
    onSentence(c) { scb = c; },
  };
}

/**
 * Stream a webm/wav file through the web VoiceGenie endpoint (pure-ASR session).
 * Backend runs near-realtime VAD — audio must be paced at ≤ ~1× realtime.
 * onPartial(cumulativeText, isFinal) fires for every interim/final result.
 */
export async function doubaoWebStt(file: string, onPartial?: (t: string, isFinal: boolean) => void, speed = 1, lang?: string): Promise<AsrSeg[]> {
  let wav = file.endsWith(".wav") ? readFileSync(file) : await webmToWav(file);
  wav = wav.subarray(44);
  const ws = await openWs(langTag(lang));
  const rid = randomUUID();

  return await new Promise<AsrSeg[]>((resolve, reject) => {
    let last = "";
    const sentences = new Map<number, AsrSeg>();
    const buildSegs = (): AsrSeg[] => {
      const sents = [...sentences.values()].filter(s => s.text);
      if (sents.length) return sents;
      return last ? [{ start: 0, end: wav.length / 32000, text: last }] : [];
    };
    const done = (err?: Error) => { clearTimeout(killer); try { ws.close(); } catch {} err ? reject(err) : resolve(buildSegs()); };
    const killer = setTimeout(() => done(new Error("doubao-web timeout")), (wav.length / 640 / 50 / speed + 45) * 1000);
    let stage: "task" | "session" | "audio" = "task";
    let timer: NodeJS.Timeout | undefined;

    ws.send(marshalReq({ token: APP_KEY, svc: "VoiceGenie", method: "StartTask", rid }));

    ws.on("message", (b: Buffer) => {
      const resp = unmarshalResp(b);
      if (resp.msgType === "TaskFailed" || resp.msgType === "SessionFailed") {
        return done(new Error(`${resp.msgType} code=${resp.code} ${resp.msg || resp.resultJson}`.trim()));
      }
      if (resp.msgType === "TaskStarted" && stage === "task") {
        stage = "session";
        ws.send(marshalReq({ token: APP_KEY, svc: "VoiceGenie", method: "StartSession", rid, payload: JSON.stringify({
          business: 1, enable_audio_input: true, query_mode: 2, interrupt_type: 0, request_type: 3,
          chat: { bot_id: "7234781073513644036", message_id: "", uid: "279691410283040", conversation_id: "local_" + Date.now(), is_conf_fetched: false, is_dora_onboarding: false, new_conversation: false, question_id: "" },
          asr: { audio_info: { channel: 1, format: "raw", sample_rate: 16000 }, enable_punctuation: true,
            ...(langTag(lang) ? { language: langTag(lang) } : {}),
            extra: { use_vad: true, use_itn: true, use_ddc: true, strong_ddc: true, enable_asr_twopass: true, disable_user_words: true } },
        }) }));
        return;
      }
      if (resp.msgType === "SessionStarted" && stage === "session") {
        stage = "audio";
        const t0 = Date.now();
        let f = 0;
        timer = setInterval(() => {
          const i = f * FRAME;
          if (i >= wav.length) {
            clearInterval(timer);
            ws.send(marshalReq({ token: APP_KEY, svc: "VoiceGenie", method: "EndASR", payload: "{}", rid }));
            ws.send(marshalReq({ token: APP_KEY, svc: "VoiceGenie", method: "FinishSession", rid }));
            return;
          }
          const lastF = i + FRAME >= wav.length;
          const payload = lastF
            ? JSON.stringify({ extra: { finish_audio: true }, timestamp_ms: t0 + f * 20 })
            : JSON.stringify({ extra: {}, timestamp_ms: t0 + f * 20 });
          ws.send(marshalReq({ svc: "VoiceGenie", method: "TaskRequest", payload, audio: wav.subarray(i, i + FRAME), rid, state: lastF ? 9 : f === 0 ? 1 : 3 }));
          f++;
        }, 20 / speed);
        return;
      }
      if (resp.resultJson) {
        try {
          const j = JSON.parse(resp.resultJson);
          const results = j?.results ?? [];
          const t = results[0]?.text;
          const interim = results[0]?.is_interim;
          if (t && t !== last) { last = t; onPartial?.(t, interim === false); }
          for (const r of results.slice(1)) {
            if ((r.stream_asr_finish || r.is_interim === false) && r.start_time != null && r.end_time != null)
              sentences.set(r.index ?? sentences.size, { start: r.start_time, end: r.end_time, text: r.text ?? "" });
          }
        } catch {}
      }
      if (resp.msgType === "SessionFinished") done();
    });
    ws.on("error", () => done(new Error("doubao-web ws error")));
    ws.on("close", () => done(last ? undefined : new Error("closed, no result")));
  });
}
