import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import OpenAI from "openai";
import { transcribeTargets, localAsrConfig, probeEndpoint, startLocalAsr, type TranscribeTarget } from "./local-asr.js";

export interface Word { word: string; start: number; end: number }
export interface Segment { start: number; end: number; text: string }
export interface Transcript { segments: Segment[]; words: Word[]; text: string; model: string; lang?: string }

const GAP = 0.9;        // split on silence > this (s)
const MAX_SEG = 14;     // force split long segments (s)

/** Any post-session transcription backend configured? (local ASR, WHISPER_*, GROQ_*, OPENAI_*) */
export const hasTranscriber = () => transcribeTargets().length > 0;

/** whisper wants ISO-639-1 ("en"), not BCP-47 ("en-US"); undefined → auto-detect */
export const whisperLang = (bcp47?: string) => bcp47?.split("-")[0].toLowerCase() || undefined;

async function runTarget(audioPath: string, t: TranscribeTarget, language?: string): Promise<Transcript> {
  const client = new OpenAI({ apiKey: t.apiKey ?? "local", baseURL: t.baseURL });
  const buf = await readFile(audioPath);
  const file = new File([buf], basename(audioPath), { type: "audio/webm" });
  const res = await client.audio.transcriptions.create({
    model: t.model,
    file,
    response_format: "verbose_json",
    timestamp_granularities: ["word"],
    ...(language ? { language } : {}),
    // initial_prompt (domain hotwords) — only our local server understands it;
    // hosted whisper APIs reject unknown fields
    ...(t.kind === "local" && process.env.WIT_ASR_PROMPT ? { prompt: process.env.WIT_ASR_PROMPT } : {}),
  } as any);
  const r = res as any;
  const words: Word[] = (r.words || []).map((w: any) => ({ word: w.word, start: w.start, end: w.end }));
  const segments = segment(words.length ? words : (r.segments || []).flatMap((s: any) => [{ word: s.text, start: s.start, end: s.end }]));
  return { segments, words, text: r.text || "", model: t.model, lang: language };
}

/**
 * Transcribe audio.webm through the configured provider chain:
 * local ASR (wit setup local-asr) → WHISPER_BASE_URL → Groq → OpenAI.
 * Unreachable local/edge endpoints are skipped; throws if every candidate fails.
 */
export async function transcribe(audioPath: string, opts: { language?: string } = {}): Promise<Transcript> {
  const targets = transcribeTargets();
  if (!targets.length) throw new Error("no transcription backend — run `wit setup local-asr` or set WHISPER_BASE_URL/GROQ_API_KEY/OPENAI_API_KEY");
  // auto-start the bundled server if local-asr is configured but not running
  // (custom baseUrl = user-managed remote server → never auto-spawn)
  const local = targets.find(t => t.kind === "local");
  const cfg = localAsrConfig();
  if (local && !cfg.baseUrl && !(await probeEndpoint(local.baseURL, 800))) {
    try { await startLocalAsr(); } catch { /* fall through — chain tries next backend */ }
  }
  const language = whisperLang(opts.language);
  const errors: string[] = [];
  for (const t of targets) {
    try {
      return await runTarget(audioPath, t, language);
    } catch (e) {
      errors.push(`${t.kind === "local" ? "local-asr" : t.baseURL}: ${(e as Error).message.slice(0, 120)}`);
    }
  }
  throw new Error(`all transcription backends failed — ${errors.join(" | ")}`);
}

/** bcut is a zh-tuned free endpoint — skip it when the user explicitly asked for another language. */
export function shouldUseBcut(lang?: string): boolean {
  const primary = whisperLang(lang);
  return !primary || primary === "zh";
}

function segment(words: Word[]): Segment[] {
  const out: Segment[] = [];
  let cur: Segment | null = null;
  for (const w of words) {
    if (!cur || w.start - cur.end > GAP || w.start - cur.start > MAX_SEG) {
      if (cur) { cur.text = cur.text.trim(); out.push(cur); }
      cur = { start: w.start, end: w.end, text: "" };
    }
    cur.text += /^\s/.test(cur.text) || /^[一-鿿]/.test(w.word) || cur.text === "" ? w.word.trim() : " " + w.word.trim();
    cur.end = w.end;
  }
  if (cur) { cur.text = cur.text.trim(); out.push(cur); }
  return out.filter(s => s.text.length > 0);
}
