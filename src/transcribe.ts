import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import OpenAI from "openai";

export interface Word { word: string; start: number; end: number }
export interface Segment { start: number; end: number; text: string }
export interface Transcript { segments: Segment[]; words: Word[]; text: string; model: string; lang?: string }

const GAP = 0.9;        // split on silence > this (s)
const MAX_SEG = 14;     // force split long segments (s)

export const hasTranscriber = () =>
  !!(process.env.WHISPER_BASE_URL || process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY);

export async function transcribe(audioPath: string, opts: { language?: string } = {}): Promise<Transcript> {
  // WHISPER_BASE_URL points at any OpenAI-compatible /audio/transcriptions
  // endpoint — local whisper.cpp server, vLLM, or a provider proxy.
  const custom = process.env.WHISPER_BASE_URL;
  const groq = !custom && !!process.env.GROQ_API_KEY;
  const client = custom
    ? new OpenAI({ apiKey: process.env.WHISPER_API_KEY ?? "local", baseURL: custom })
    : groq
      ? new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: "https://api.groq.com/openai/v1" })
      : new OpenAI();
  const model = process.env.WHISPER_MODEL ?? (groq ? "whisper-large-v3-turbo" : "whisper-1");
  const buf = await readFile(audioPath);
  const file = new File([buf], basename(audioPath), { type: "audio/webm" });
  // whisper wants ISO-639-1 ("en"), not BCP-47 ("en-US")
  const language = opts.language?.split("-")[0].toLowerCase();
  const res = await client.audio.transcriptions.create({
    model,
    file,
    response_format: "verbose_json",
    timestamp_granularities: ["word"],
    ...(language ? { language } : {}),
  } as any);
  const r = res as any;
  const words: Word[] = (r.words || []).map((w: any) => ({ word: w.word, start: w.start, end: w.end }));
  const segments = segment(words.length ? words : (r.segments || []).flatMap((s: any) => [{ word: s.text, start: s.start, end: s.end }]));
  return { segments, words, text: r.text || "", model, lang: language };
}

function segment(words: Word[]): Segment[] {
  const out: Segment[] = [];
  let cur: Segment | null = null;
  for (const w of words) {
    if (!cur || w.start - cur.end > GAP || w.start - cur.start > MAX_SEG) {
      if (cur) { cur.text = cur.text.trim(); out.push(cur); }
      cur = { start: w.start, end: w.end, text: "" };
    }
    cur.text += /^\s/.test(cur.text) || /^[\u4e00-\u9fff]/.test(w.word) || cur.text === "" ? w.word.trim() : " " + w.word.trim();
    cur.end = w.end;
  }
  if (cur) { cur.text = cur.text.trim(); out.push(cur); }
  return out.filter(s => s.text.length > 0);
}
