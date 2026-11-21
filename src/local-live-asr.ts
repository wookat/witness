/** Local live ASR session: streams mic PCM16/16k/mono to the sherpa-onnx server. */
import WebSocket from "ws";
import { LIVE_ASR_PORT, liveModelReady, probeLive, startLiveAsr, localAsrConfig } from "./local-asr.js";
import type { AsrSeg } from "./asr-types.js";

export interface LocalLive {
  push(pcm: Buffer): void;
  end(): Promise<AsrSeg[]>;
  onPartial(cb: (t: string) => void): void;
  onSentence(cb: (s: { text: string; start: number; end: number }) => void): void;
}

/** Open a session against the local sherpa-onnx live server (auto-starts it). */
export async function openLocalLive(): Promise<LocalLive> {
  const cfg = localAsrConfig();
  if (!cfg.live?.enabled && !liveModelReady()) {
    throw new Error("local live asr not installed — run `wit local-asr live setup`");
  }
  if (!(await probeLive())) await startLiveAsr();
  const ws = new WebSocket(`ws://127.0.0.1:${LIVE_ASR_PORT}/live`);
  await new Promise<void>((res, rej) => {
    ws.once("open", () => res());
    ws.once("error", rej);
    setTimeout(() => rej(new Error("live ws connect timeout")), 8000);
  });

  let partialCb: (t: string) => void = () => {};
  let sentenceCb: (s: { text: string; start: number; end: number }) => void = () => {};
  const segs: AsrSeg[] = [];
  let bytesSent = 0;
  let cursor = 0; // seconds — segment start for the next final
  const nowSec = () => bytesSent / 2 / 16000;
  let ended = false;

  ws.on("message", raw => {
    let m: any;
    try { m = JSON.parse(String(raw)); } catch { return; }
    if (m.type === "partial") partialCb(m.text ?? "");
    else if (m.type === "final" && m.text?.trim()) {
      const end = nowSec();
      const seg = { text: m.text.trim(), start: cursor, end };
      cursor = end;
      segs.push(seg);
      sentenceCb(seg);
    }
  });

  return {
    push(pcm) {
      if (ws.readyState === WebSocket.OPEN) { ws.send(pcm); bytesSent += pcm.length; }
    },
    end() {
      if (ended) return Promise.resolve(segs);
      ended = true;
      return new Promise(resolve => {
        const done = () => { try { ws.close(); } catch {} resolve(segs); };
        ws.send(JSON.stringify({ type: "eof" }));
        setTimeout(done, 4000); // server flushes endpoint + final before close
        ws.once("close", done);
      });
    },
    onPartial(c) { partialCb = c; },
    onSentence(c) { sentenceCb = c; },
  };
}
