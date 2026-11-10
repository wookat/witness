/** Microsoft consumer STT (Edge dictation backend) — true streaming, no key.
 *  Sec-MS-GEC algorithm public via edge-tts community. */
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { webmToWav } from "./webm2wav.js";
import type { AsrSeg } from "./asr-providers.js";

const TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const WIN_EPOCH = 11644473600;

function gec(): string {
  const ticks = Math.floor((Date.now() / 1000 + WIN_EPOCH) / 300) * 300 * 10_000_000; // filetime, 5-min window
  return createHash("sha256").update(ticks.toString() + TOKEN).digest("hex").toUpperCase();
}

const reqId = () => randomUUID().replace(/-/g, "");
const ts = () => new Date().toISOString().replace(/\.\d+Z$/, "Z");

function audioMsg(pcm: Buffer, requestId: string): Buffer {
  const head = Buffer.from(`Path: audio\r\nX-RequestId: ${requestId}\r\nX-Timestamp: ${ts()}\r\nContent-Type: audio/x-wav\r\n\r\n`);
  const out = Buffer.alloc(2 + head.length + pcm.length);
  out.writeUInt16BE(head.length, 0);
  head.copy(out, 2);
  pcm.copy(out, 2 + head.length);
  return out;
}

/** Streaming STT over Bing consumer WS. onPartial fires with interim text. */
export async function bingStt(file: string, lang = "zh-CN", onPartial?: (t: string) => void): Promise<AsrSeg[]> {
  let wav = file.endsWith(".wav") ? readFileSync(file) : await webmToWav(file);
  wav = wav.subarray(44); // strip WAV header → raw 16k mono PCM
  const connId = randomUUID().replace(/-/g, "");
  const url = `wss://speech.platform.bing.com/consumer/speech/recognize?ConnectionId=${connId}&TrustedClientToken=${TOKEN}&Sec-MS-GEC=${gec()}&Sec-MS-GEC-Version=1-143.0.3650.75`;

  return await new Promise<AsrSeg[]>((resolve, reject) => {
    const ws = new WebSocket(url);
    const segs: AsrSeg[] = [];
    const rid = reqId();
    const done = (err?: Error) => { try { ws.close(); } catch {} err ? reject(err) : resolve(segs); };
    const killer = setTimeout(() => done(new Error("bing stt timeout")), 30_000);

    ws.onopen = () => {
      ws.send(`Path: speech.config\r\nX-RequestId: ${rid}\r\nX-Timestamp: ${ts()}\r\nContent-Type: application/json; charset=utf-8\r\n\r\n` +
        JSON.stringify({ context: { system: { version: "1.0", name: "SpeechSDK", build: "1.0", lang: "JavaScript" }, os: { platform: "Browser", name: "Edge", version: "143" }, device: { manufacturer: "Microsoft", model: "Edge", version: "143" } }, recognition: "interactive", language: lang }));
      // stream audio in ~100ms chunks (3200 bytes = 100ms @16k*2B)
      for (let i = 0; i < wav.length; i += 3200) ws.send(audioMsg(wav.subarray(i, i + 3200), rid));
      ws.send(`Path: speech.endDetected\r\nX-RequestId: ${rid}\r\nX-Timestamp: ${ts()}\r\nContent-Type: application/json; charset=utf-8\r\n\r\n{}`);
    };
    ws.onmessage = (ev) => {
      const m = String(ev.data);
      if (m.includes("speech.phrase")) {
        const body = m.slice(m.indexOf("\r\n\r\n") + 4);
        try {
          const j = JSON.parse(body);
          const hyp = j.DisplayText ?? j.Text ?? j.RecognitionStatus;
          segs.push({ start: (j.Offset ?? 0) / 1e7, end: ((j.Offset ?? 0) + (j.Duration ?? 0)) / 1e7, text: String(hyp).trim() });
        } catch {}
      } else if (m.includes("speech.hypothesis") && onPartial) {
        try { onPartial(JSON.parse(m.slice(m.indexOf("\r\n\r\n") + 4)).Text); } catch {}
      } else if (m.includes("turn.end")) { clearTimeout(killer); done(); }
    };
    ws.onerror = () => { clearTimeout(killer); done(new Error("ws error")); };
    ws.onclose = () => { clearTimeout(killer); done(segs.length ? undefined : new Error("no results")); };
  });
}
