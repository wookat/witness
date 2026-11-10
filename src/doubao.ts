/** Doubao IME (ByteDance Seed-ASR) — true streaming ASR, no key.
 *  Protocol reverse-engineered by voxgate (github.com/WEIFENG2333/voxgate). */
import { createHash, randomUUID, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { webmToWav } from "./webm2wav.js";
import type { AsrSeg } from "./asr-providers.js";

const AID = 401734;
const UA = "com.bytedance.android.doubaoime/100102018 (Linux; U; Android 16; en_US; Pixel 7 Pro; Build/BP2A.250605.031.A2; Cronet/TTNetVersion:94cf429a 2025-11-17 QuicVersion:1f89f732 2025-05-08)";
const REGISTER_URL = "https://log.snssdk.com/service/2/device_register/";
const SETTINGS_URL = "https://is.snssdk.com/service/settings/v3/";
const WS_URL = "wss://frontier-audio-ime-ws.doubao.com/ocean/api/v1/ws";
const FRAME = 640; // 20ms @16kHz mono s16le

interface Creds { deviceId: string; token: string; cdid: string; ts: number }

const CREDS_PATH = join(homedir(), ".witness", "doubao-creds.json");
const CREDS_TTL_MS = 12 * 3600 * 1000; // token ~24h, refresh early

async function credentials(): Promise<Creds> {
  try {
    const c = JSON.parse(readFileSync(CREDS_PATH, "utf8")) as Creds;
    if (c.token && Date.now() - c.ts < CREDS_TTL_MS) return c;
  } catch {}
  const c = { ...(await register()), ts: Date.now() };
  try { mkdirSync(join(homedir(), ".witness"), { recursive: true }); writeFileSync(CREDS_PATH, JSON.stringify(c), { mode: 0o600 }); } catch {}
  return c;
}

async function register(): Promise<Omit<Creds, "ts">> {
  const cdid = randomUUID();
  const params = new URLSearchParams({
    device_platform: "android", os: "android", ssmix: "a", _rticket: String(Date.now()),
    cdid, channel: "official", aid: String(AID), app_name: "oime",
    version_code: "100102018", version_name: "1.1.2", manifest_version_code: "100102018",
    update_version_code: "100102018", resolution: "1080*2400", dpi: "420",
    device_type: "Pixel 7 Pro", device_brand: "google", language: "zh", os_api: "34", os_version: "16", ac: "wifi",
  });
  const r = await fetch(REGISTER_URL + "?" + params, {
    method: "POST", headers: { "Content-Type": "application/json", "User-Agent": UA },
    body: JSON.stringify({ magic_tag: "ss_app_log", _gen_time: Date.now(), header: {
      device_id: 0, install_id: 0, aid: AID, app_name: "oime",
      version_code: 100102018, version_name: "1.1.2", manifest_version_code: 100102018, update_version_code: 100102018,
      channel: "official", package: "com.bytedance.android.doubaoime", device_platform: "android", os: "android",
      os_api: "34", os_version: "16", device_type: "Pixel 7 Pro", device_brand: "google", device_model: "Pixel 7 Pro",
      resolution: "1080*2400", dpi: "420", language: "zh", timezone: 8, access: "wifi",
      rom: "UP1A.231005.007", rom_version: "UP1A.231005.007", region: "CN", tz_name: "Asia/Shanghai",
      tz_offset: 28800, sim_region: "cn", carrier_region: "cn", cpu_abi: "arm64-v8a",
      openudid: randomBytes(8).toString("hex"), clientudid: randomUUID(), cdid,
    } }),
  });
  const j = await r.json() as any;
  const deviceId = String(j.device_id_str ?? j.device_id ?? "");
  if (!deviceId || deviceId === "0") throw new Error("device register: " + JSON.stringify(j).slice(0, 120));
  // token
  const body = "body=null";
  const tp = new URLSearchParams({
    device_platform: "android", os: "android", ssmix: "a", channel: "official", aid: String(AID),
    app_name: "oime", version_code: "100102018", version_name: "1.1.2",
    device_id: deviceId, cdid, _rticket: String(Date.now()),
  });
  const tr = await fetch(SETTINGS_URL + "?" + tp, {
    method: "POST", headers: { "User-Agent": UA, "x-ss-stub": createHash("md5").update(body).digest("hex").toUpperCase(), "Content-Type": "application/octet-stream" }, body,
  });
  const tj = await tr.json() as any;
  const token = tj?.data?.settings?.asr_config?.app_key;
  if (!token) throw new Error("token missing: " + JSON.stringify(tj).slice(0, 150));
  return { deviceId, token, cdid };
}

// --- minimal protobuf ---
function vlen(v: number): Buffer { const o: number[] = []; do { let b = v & 0x7f; v = Math.floor(v / 128); if (v) b |= 0x80; o.push(b); } while (v); return Buffer.from(o); }
function field(field: number, data: Buffer | string): Buffer { const d = typeof data === "string" ? Buffer.from(data) : data; return Buffer.concat([vlen(field << 3 | 2), vlen(d.length), d]); }
function marshalReq(o: { token?: string; svc?: string; method?: string; payload?: string; audio?: Buffer; rid?: string; state?: number }): Buffer {
  const parts: Buffer[] = [];
  if (o.token) parts.push(field(2, o.token));
  if (o.svc) parts.push(field(3, o.svc));
  if (o.method) parts.push(field(5, o.method));
  if (o.payload) parts.push(field(6, o.payload));
  if (o.audio?.length) parts.push(field(7, o.audio));
  if (o.rid) parts.push(field(8, o.rid));
  if (o.state) parts.push(Buffer.concat([vlen(9 << 3), vlen(o.state)]));
  return Buffer.concat(parts);
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

/** Stream WAV/PCM through Doubao Seed-ASR. onPartial(cumulativeText). */
export async function doubaoStt(file: string, onPartial?: (t: string) => void): Promise<AsrSeg[]> {
  let wav = file.endsWith(".wav") ? readFileSync(file) : await webmToWav(file);
  wav = wav.subarray(44);
  let lastErr: Error = new Error("doubao failed");
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await doubaoSession(wav, onPartial); }
    catch (e) { lastErr = e as Error; if (!text0) continue; break; }
  }
  throw lastErr;
}

let text0 = false; // set when any partial arrived (don't retry a session that produced text)

async function doubaoSession(wav: Buffer, onPartial?: (t: string) => void): Promise<AsrSeg[]> {
  const creds = await credentials();
  const rid = randomUUID().replace(/-/g, "");

  const { WebSocket } = await import("undici" as any).catch(() => ({ WebSocket: globalThis.WebSocket } as any)) as any;
  const ws = new WebSocket(`${WS_URL}?aid=${AID}&device_id=${creds.deviceId}`, {
    headers: { "User-Agent": UA, "proto-version": "v2", "x-custom-keepalive": "true" },
  });

  return await new Promise<AsrSeg[]>((resolve, reject) => {
    let text = "";
    const sentences = new Map<number, AsrSeg>(); // index → finished sentence with own timestamps
    const buildSegs = (): AsrSeg[] => {
      const sents = [...sentences.values()].filter(s => s.text);
      if (sents.length) return sents;
      return text ? [{ start: 0, end: wav.length / 32000, text }] : [];
    };
    const done = (err?: Error) => { try { ws.close(); } catch {} err ? reject(err) : resolve(buildSegs()); };
    const killer = setTimeout(() => done(new Error("doubao timeout")), 90_000);
    let stage: "task" | "session" | "audio" = "task";

    ws.addEventListener("open", () => {
      ws.send(marshalReq({ token: creds.token, svc: "ASR", method: "StartTask", rid }));
    });
    ws.addEventListener("message", async (ev: any) => {
      const raw: Buffer = typeof ev.data === "string" ? Buffer.from(ev.data)
        : ev.data instanceof ArrayBuffer ? Buffer.from(ev.data)
        : Buffer.from(await (ev.data as Blob).arrayBuffer());
      const resp = unmarshalResp(raw);
      if (resp.msgType === "TaskFailed" || resp.msgType === "SessionFailed") { clearTimeout(killer); return done(new Error(`${resp.msgType} code=${resp.code} ${resp.msg || resp.resultJson}`.trim())); }
      if (resp.msgType === "TaskStarted" && stage === "task") {
        stage = "session";
        const ctx = Buffer.from(JSON.stringify({ chat: [], ime_info: { app_apk_name: "com.android.chrome", input_type: "" } })).toString("base64");
        ws.send(marshalReq({ token: creds.token, svc: "ASR", method: "StartSession", rid, payload: JSON.stringify({
          audio_info: { channel: 1, format: "raw", sample_rate: 16000 },
          enable_punctuation: true, enable_speech_rejection: false,
          extra: { app_name: "com.android.chrome", cell_compress_rate: 8, did: creds.deviceId, input_mode: "tool",
            enable_asr_threepass: true, enable_asr_twopass: true, use_twopass_retry: true, strong_ddc: true,
            remove_space_between_han_num: true, remove_space_between_han_eng: true, enable_print_chinese: false,
            disable_user_words: false, context: ctx },
        }) }));
        return;
      }
      if (resp.msgType === "SessionStarted" && stage === "session") {
        stage = "audio";
        const t0 = Date.now();
        for (let i = 0, f = 0; i < wav.length; i += FRAME, f++) {
          const last = i + FRAME >= wav.length;
          const payload = last
            ? JSON.stringify({ extra: { finish_audio: true, force_asr_twopass: true }, timestamp_ms: t0 + f * 20 })
            : JSON.stringify({ extra: {}, timestamp_ms: t0 + f * 20 });
          ws.send(marshalReq({ svc: "ASR", method: "TaskRequest", payload, audio: wav.subarray(i, i + FRAME), rid, state: last ? 9 : f === 0 ? 1 : 3 }));
        }
        ws.send(marshalReq({ token: creds.token, svc: "ASR", method: "FinishSession", rid }));
        return;
      }
      if (resp.resultJson) {
        try {
          const j = JSON.parse(resp.resultJson);
          const results = j?.results ?? [];
          const t = results[0]?.text;
          if (t && t !== text) { text = t; text0 = true; onPartial?.(t); }
          // results[1..n]: sentence breakdown — finished sentences carry own start/end
          for (const r of results.slice(1)) {
            if (r.stream_asr_finish && r.start_time != null && r.end_time != null)
              sentences.set(r.index ?? sentences.size, { start: r.start_time, end: r.end_time, text: r.text ?? "" });
          }
        } catch {}
      }
      if (resp.msgType === "SessionFinished") { clearTimeout(killer); done(); }
    });
    ws.addEventListener("error", () => { clearTimeout(killer); done(new Error("doubao ws error")); });
    ws.addEventListener("close", () => { clearTimeout(killer); done(text ? undefined : new Error("closed, no result")); });
  });
}
