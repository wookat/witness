/** Free cloud transcription — no API key, zh-optimized.
 *  doubao batch (Seed-ASR, real sentence timestamps) → bcut fallback.
 *  Used when no whisper backend is configured, or it failed. */
import { doubaoWebStt } from "./doubao-web.js";
import { transcribeBcut } from "./bcut.js";
import type { Transcript, Segment } from "./transcribe.js";

export async function transcribeFreeCloud(file: string, lang?: string): Promise<Transcript> {
  const errors: string[] = [];
  try {
    const segs = await doubaoWebStt(file, undefined, 2, lang);
    const segments: Segment[] = segs
      .filter(s => s.text)
      .map(s => ({ start: s.start, end: s.end || s.start, text: s.text }));
    if (segments.length) return { segments, words: [], text: segments.map(s => s.text).join("\n"), model: "doubao-batch", lang };
    errors.push("doubao: empty result");
  } catch (e) {
    errors.push(`doubao: ${(e as Error).message.slice(0, 100)}`);
  }
  try {
    return await transcribeBcut(file);
  } catch (e) {
    errors.push(`bcut: ${(e as Error).message.slice(0, 100)}`);
  }
  throw new Error(`free cloud failed — ${errors.join(" | ")}`);
}
