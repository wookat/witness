import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { webmToWav } from "./webm2wav.js";
import type { Transcript, Segment, Word } from "./transcribe.js";

/** 必剪 (bilibili bcut) ASR — reverse-engineered editor endpoint, no key needed. */
const API = "https://member.bilibili.com/x/bcut/rubick-interface";
const HEADERS = { "User-Agent": "Bilibili/1.0.0 (https://www.bilibili.com)", "Content-Type": "application/json" };
const MODEL = "8";

async function jpost(url: string, body: unknown) {
  const r = await fetch(url, { method: "POST", headers: HEADERS, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`bcut ${url} → ${r.status}`);
  return (await r.json()).data;
}

export async function transcribeBcut(file: string, pollMs = 120_000): Promise<Transcript> {
  let buf: Buffer = readFileSync(file);
  let ftype = "wav", fname = "audio.wav";
  if (!file.endsWith(".wav")) buf = await webmToWav(file); // bcut wants a real container

  // 1. request upload slot
  const up = await jpost(`${API}/resource/create`, {
    type: 2, name: fname, size: buf.length, ResourceFileType: ftype, model_id: MODEL,
  });

  // 2. PUT each shard, collect etags
  const etags: string[] = [];
  for (let i = 0; i < up.upload_urls.length; i++) {
    const part = buf.subarray(i * up.per_size, (i + 1) * up.per_size);
    const r = await fetch(up.upload_urls[i], { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: new Uint8Array(part) as BodyInit });
    if (!r.ok) throw new Error(`bcut shard ${i} → ${r.status}`);
    etags.push(r.headers.get("etag") ?? "");
  }

  // 3. commit → download_url
  const commit = await jpost(`${API}/resource/create/complete`, {
    InBossKey: up.in_boss_key, ResourceId: up.resource_id,
    Etags: etags.join(","), UploadId: up.upload_id, model_id: MODEL,
  });

  // 4. create task + poll
  const task = await jpost(`${API}/task`, { resource: commit.download_url, model_id: MODEL });
  const deadline = Date.now() + pollMs;
  let data: any;
  for (;;) {
    await new Promise(r => setTimeout(r, 1200));
    const r = await fetch(`${API}/task/result?model_id=7&task_id=${task.task_id}`, { headers: HEADERS });
    data = (await r.json()).data;
    if (data.state === 4) break;
    if (data.state === 3 || Date.now() > deadline) throw new Error(`bcut task state ${data.state}`);
  }

  const res = JSON.parse(data.result);
  const segments: Segment[] = (res.utterances ?? [])
    .map((u: any) => ({ start: u.start_time / 1000, end: u.end_time / 1000, text: String(u.transcript ?? "").trim() }))
    .filter((s: Segment) => s.text);
  return { segments, words: [], text: segments.map(s => s.text).join("\n"), model: "bcut" };
}
