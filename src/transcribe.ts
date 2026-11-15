import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import OpenAI from "openai";
import { transcribeTargets, localAsrConfig, probeEndpoint, startLocalAsr, type TranscribeTarget } from "./local-asr.js";
import { readConfig } from "./config.js";

export interface Word { word: string; start: number; end: number; prob?: number }
export interface Segment { start: number; end: number; text: string; conf?: number; lowConf?: boolean }
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
    // hosted whisper APIs reject unknown fields. env WIT_ASR_PROMPT > .witness/config.json asrPrompt
    ...(t.kind === "local" && (process.env.WIT_ASR_PROMPT ?? readConfig().asrPrompt) ? { prompt: process.env.WIT_ASR_PROMPT ?? readConfig().asrPrompt } : {}),
  } as any);
  const r = res as any;
  const words: Word[] = (r.words || []).map((w: any) => ({ word: w.word, start: w.start, end: w.end, prob: typeof w.probability === "number" ? w.probability : undefined }));
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

/** Elapsed-time ticker for long transcriptions — providers give no real progress,
 *  but local whisper on CPU can take minutes for hour-long audio. */
export async function withTranscribeProgress<T>(p: Promise<T>, audioMs?: number): Promise<T> {
  const t0 = Date.now();
  const iv = setInterval(() => {
    const el = Math.round((Date.now() - t0) / 1000);
    const dur = audioMs ? ` · audio ~${Math.round(audioMs / 60000)}m` : "";
    process.stdout.write(`\r  … transcribing ${el}s elapsed${dur}   `);
  }, 15000);
  iv.unref?.();
  try { return await p; } finally { clearInterval(iv); process.stdout.write("\n"); }
}

/** bcut is a zh-tuned free endpoint — skip it when the user explicitly asked for another language. */
export function shouldUseBcut(lang?: string): boolean {
  const primary = whisperLang(lang);
  return !primary || primary === "zh";
}

const LOW_CONF = 0.55; // mean word probability below this → flag as possibly-misheard

function segment(words: Word[]): Segment[] {
  const out: Segment[] = [];
  let cur: Segment | null = null;
  let probSum = 0, probN = 0;
  const flush = () => {
    if (!cur) return;
    cur.text = cur.text.trim();
    if (probN) {
      cur.conf = +(probSum / probN).toFixed(3);
      cur.lowConf = cur.conf < LOW_CONF;
    }
    out.push(cur);
  };
  for (const w of words) {
    if (!cur || w.start - cur.end > GAP || w.start - cur.start > MAX_SEG) {
      flush();
      cur = { start: w.start, end: w.end, text: "" };
      probSum = 0; probN = 0;
    }
    cur.text += /^\s/.test(cur.text) || /^[一-鿿]/.test(w.word) || cur.text === "" ? w.word.trim() : " " + w.word.trim();
    cur.end = w.end;
    if (typeof w.prob === "number") { probSum += w.prob; probN++; }
  }
  flush();
  return out.filter(s => s.text.length > 0);
}
