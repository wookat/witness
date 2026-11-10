/** Free/reverse-engineered ASR providers — uniform shape for bench + recorder fallback. */
import { readFileSync } from "node:fs";
import { webmToWav } from "./webm2wav.js";
import { doubaoStt } from "./doubao.js";

export interface AsrSeg { start: number; end: number; text: string }
export interface AsrResult { engine: string; streaming: boolean; ms: number; segments: AsrSeg[]; error?: string }

async function toWav(file: string): Promise<Buffer> {
  if (file.endsWith(".wav")) return readFileSync(file);
  return webmToWav(file);
}

/* ---------------- bcut (bilibili 必剪) ---------------- */
const BCUT = "https://member.bilibili.com/x/bcut/rubick-interface";
const BH = { "User-Agent": "Bilibili/1.0.0 (https://www.bilibili.com)", "Content-Type": "application/json" };
export async function bcut(file: string): Promise<AsrSeg[]> {
  const buf = await toWav(file);
  const jpost = async (url: string, body: unknown) => {
    const r = await fetch(url, { method: "POST", headers: BH, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`${r.status}`); return (await r.json()).data;
  };
  const up = await jpost(`${BCUT}/resource/create`, { type: 2, name: "audio.wav", size: buf.length, ResourceFileType: "wav", model_id: "8" });
  const etags: string[] = [];
  for (let i = 0; i < up.upload_urls.length; i++) {
    const r = await fetch(up.upload_urls[i], { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: new Uint8Array(buf.subarray(i * up.per_size, (i + 1) * up.per_size)) as BodyInit });
    etags.push(r.headers.get("etag") ?? "");
  }
  const commit = await jpost(`${BCUT}/resource/create/complete`, { InBossKey: up.in_boss_key, ResourceId: up.resource_id, Etags: etags.join(","), UploadId: up.upload_id, model_id: "8" });
  const task = await jpost(`${BCUT}/task`, { resource: commit.download_url, model_id: "8" });
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 1200));
    const d = (await (await fetch(`${BCUT}/task/result?model_id=7&task_id=${task.task_id}`, { headers: BH })).json()).data;
    if (d.state === 4) {
      return (JSON.parse(d.result).utterances ?? [])
        .map((u: any) => ({ start: u.start_time / 1000, end: u.end_time / 1000, text: String(u.transcript ?? "").trim() }))
        .filter((s: AsrSeg) => s.text);
    }
    if (d.state === 3) throw new Error("task failed");
  }
  throw new Error("timeout");
}

/* ---------------- 快手 ---------------- */
export async function kuaishou(file: string): Promise<AsrSeg[]> {
  const buf = await toWav(file);
  const fd = new FormData();
  fd.append("typeId", "1");
  fd.append("file", new Blob([new Uint8Array(buf)], { type: "audio/wav" }), "test.wav");
  const r = await fetch("https://ai.kuaishou.com/api/effects/subtitle_generate", { method: "POST", body: fd });
  const j = await r.json();
  const arr = j?.data?.text ?? [];
  return arr.map((u: any) => ({ start: u.start_time / 1000, end: u.end_time / 1000, text: String(u.text ?? "").trim() })).filter((s: AsrSeg) => s.text);
}

/* ---------------- 剪映 (needs 3rd-party sign svc — fragile) ---------------- */
async function jySign(url: string, tdid: string): Promise<{ sign: string; t: string }> {
  const t = String(Math.floor(Date.now() / 1000));
  const r = await fetch("https://asrtools-update.bkfeng.top/sign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url, current_time: t, pf: "4", appvr: "4.0.0", tdid }) });
  return { sign: (await r.json()).sign.toLowerCase(), t };
}
const TDID = "3943278516897751";
const jyHeaders = (sign: string, t: string) => ({
  "User-Agent": "Cronet/TTNetVersion:01594da2", appvr: "4.0.0", "device-time": t, pf: "4", sign, "sign-ver": "1", tdid: TDID, "Content-Type": "application/json",
});
export async function jianying(file: string): Promise<AsrSeg[]> {
  const buf = await toWav(file);
  const crc = (await import("node:zlib")).crc32(buf).toString(16);
  // upload_sign
  let s = await jySign("/lv/v1/upload_sign", TDID);
  const upSign = await (await fetch("https://lv-pc-api-sinfonlinec.ulikecam.com/lv/v1/upload_sign", { method: "POST", headers: jyHeaders(s.sign, s.t), body: JSON.stringify({ biz: "pc-recognition" }) })).json();
  const { access_key_id, secret_access_key, session_token } = upSign.data;
  // apply upload (AWS4 signed GET to bytedance vod)
  const qs = `Action=ApplyUploadInner&FileSize=${buf.length}&FileType=object&IsInner=1&SpaceName=lv-mac-recognition&Version=2020-11-19&s=5y0udbjapi`;
  const amz = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z/, "Z");
  const datestamp = amz.slice(0, 8);
  const crypto = await import("node:crypto");
  const hmac = (k: Buffer | string, m: string) => crypto.createHmac("sha256", k).update(m).digest();
  const kDate = hmac("AWS4" + secret_access_key, datestamp);
  const kRegion = hmac(kDate, "cn");
  const kSvc = hmac(kRegion, "vod");
  const kSign = hmac(kSvc, "aws4_request");
  const canon = `GET\n/\n${qs}\nx-amz-date:${amz}\nx-amz-security-token:${session_token}\n\nx-amz-date;x-amz-security-token\n${crypto.createHash("sha256").update("").digest("hex")}`;
  const sig = crypto.createHmac("sha256", kSign).update(`AWS4-HMAC-SHA256\n${amz}\n${datestamp}/cn/vod/aws4_request\n${crypto.createHash("sha256").update(canon).digest("hex")}`).digest("hex");
  const authR = await (await fetch(`https://vod.bytedanceapi.com/?${qs}`, { headers: { "x-amz-date": amz, "x-amz-security-token": session_token, authorization: `AWS4-HMAC-SHA256 Credential=${access_key_id}/${datestamp}/cn/vod/aws4_request, SignedHeaders=x-amz-date;x-amz-security-token, Signature=${sig}` } })).json();
  const si = authR.Result.UploadAddress.StoreInfos[0];
  const host = authR.Result.UploadAddress.UploadHosts[0];
  const uh = { "User-Agent": "Mozilla/5.0 Thea/1.0.1", Authorization: si.Auth, "Content-CRC32": crc };
  await (await fetch(`https://${host}/${si.StoreUri}?partNumber=1&uploadID=${si.UploadID}`, { method: "PUT", headers: uh, body: new Uint8Array(buf) as BodyInit })).json();
  await (await fetch(`https://${host}/${si.StoreUri}?uploadID=${si.UploadID}`, { method: "POST", headers: uh, body: `1:${crc}` })).json();
  await fetch(`https://${host}/${si.StoreUri}?uploadID=${si.UploadID}&partNumber=1&x-amz-security-token=${session_token}`, { method: "PUT", headers: uh, body: new Uint8Array(buf) as BodyInit });
  // submit + query
  s = await jySign("/lv/v1/audio_subtitle/submit", TDID);
  const sub = await (await fetch("https://lv-pc-api-sinfonlinec.ulikecam.com/lv/v1/audio_subtitle/submit", { method: "POST", headers: jyHeaders(s.sign, s.t), body: JSON.stringify({ adjust_endtime: 200, audio: si.StoreUri, caption_type: 2, client_request_id: crypto.randomUUID(), max_lines: 1, songs_info: [{ end_time: 6000, id: "", start_time: 0 }], words_per_line: 16 }) })).json();
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 1500));
    s = await jySign("/lv/v1/audio_subtitle/query", TDID);
    const q = await (await fetch("https://lv-pc-api-sinfonlinec.ulikecam.com/lv/v1/audio_subtitle/query", { method: "POST", headers: jyHeaders(s.sign, s.t), body: JSON.stringify({ id: sub.data.id, pack_options: { need_attribute: true } }) })).json();
    const utt = q?.data?.utterances;
    if (Array.isArray(utt) && utt.length) return utt.map((u: any) => ({ start: u.start_time / 1000, end: u.end_time / 1000, text: String(u.text ?? "").trim() })).filter((x: AsrSeg) => x.text);
  }
  throw new Error("jianying poll timeout");
}

/* ---------------- doubao (豆包输入法 Seed-ASR, true streaming) ---------------- */
export async function doubao(file: string): Promise<AsrSeg[]> {
  return doubaoStt(file);
}

/* ---------------- uncloseai (parakeet, OpenAI-compatible, no key) ---------------- */
export async function uncloseai(file: string): Promise<AsrSeg[]> {
  const fd = new FormData();
  fd.append("file", new Blob([new Uint8Array(readFileSync(file))], { type: "audio/webm" }), "audio.webm");
  fd.append("model", "stt-1-parakeet");
  fd.append("response_format", "verbose_json");
  fd.append("timestamp_granularities[]", "segment");
  const r = await fetch("https://speech.ai.unturf.com/v1/audio/transcriptions", { method: "POST", body: fd });
  if (!r.ok) throw new Error(`${r.status}`);
  const j = await r.json();
  return (j.segments ?? [{ start: 0, end: j.usage?.seconds ?? 0, text: j.text }]).map((s: any) => ({ start: s.start, end: s.end, text: String(s.text).trim() }));
}

/* ---------------- notetakers (whisper/qwen3 free, 10/day) ---------------- */
export async function notetakers(file: string): Promise<AsrSeg[]> {
  const fd = new FormData();
  fd.append("file", new Blob([new Uint8Array(readFileSync(file))], { type: "audio/webm" }), "audio.webm");
  fd.append("engine", "qwen3");
  fd.append("language", "zh");
  const r = await fetch("https://notetakers.vipresearch.ca/stt/v1/transcribe", { method: "POST", body: fd });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 80)}`);
  const j = await r.json();
  return [{ start: 0, end: j.duration_seconds ?? 0, text: String(j.text ?? "").trim() }];
}
