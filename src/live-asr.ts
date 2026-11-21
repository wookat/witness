/** Unified live-ASR entry: pick an engine, get a normalized push/end/callback session. */
import { openLiveVg, type LiveVg } from "./doubao-web.js";
import { openLiveIme, type LiveIme } from "./doubao.js";
import { openLocalLive, type LocalLive } from "./local-live-asr.js";
import { localAsrConfig } from "./local-asr.js";
import { liveModelReady } from "./local-asr.js";
import type { AsrSeg } from "./asr-types.js";

export type AsrChoice = "auto" | "doubao-web" | "doubao-ime" | "local" | "sr" | "off";
export const ASR_ENGINES: AsrChoice[] = ["auto", "doubao-web", "doubao-ime", "local", "sr", "off"];

export interface LiveAsrSession {
  name: "doubao-web" | "doubao-ime" | "local";
  push(pcm: Buffer): void;
  end(): Promise<AsrSeg[]>;
  onPartial(cb: (t: string) => void): void;
  onSentence(cb: (s: { text: string; start: number; end: number }) => void): void;
}

function wrap(s: LiveVg | LiveIme | LocalLive, name: LiveAsrSession["name"]): LiveAsrSession {
  return {
    name,
    push: p => s.push(p),
    end: () => s.end(),
    onPartial: c => s.onPartial((t: string) => c(t)),
    onSentence: c => s.onSentence(c),
  };
}

/** Local sherpa-onnx live ASR is "available" once the model is downloaded (setup) — auto-spawns on use. */
function localLiveReady(): boolean {
  const cfg = localAsrConfig();
  return !!(cfg.live?.enabled || liveModelReady());
}

/** Open a live ASR session. "auto" tries local (if installed) → doubao-web → doubao-ime; throws if all fail. */
export async function openLiveAsr(choice: Exclude<AsrChoice, "sr" | "off">, lang?: string): Promise<LiveAsrSession> {
  if (choice === "local") return wrap(await openLocalLive(), "local");
  if (choice === "doubao-web") return wrap(await openLiveVg(lang), "doubao-web");
  if (choice === "doubao-ime") return wrap(await openLiveIme(lang), "doubao-ime");
  // auto: fully-offline local first when installed, then cloud fallbacks
  const errors: string[] = [];
  if (localLiveReady()) {
    try { return wrap(await openLocalLive(), "local"); }
    catch (e) { errors.push(`local: ${(e as Error).message}`); }
  }
  try { return wrap(await openLiveVg(lang), "doubao-web"); }
  catch (e1) {
    errors.push(`doubao-web: ${(e1 as Error).message}`);
    try { return wrap(await openLiveIme(lang), "doubao-ime"); }
    catch (e2) {
      errors.push(`doubao-ime: ${(e2 as Error).message}`);
      throw new Error(`auto asr failed — ${errors.join(" | ")}`);
    }
  }
}
