/** Unified live-ASR entry: pick an engine, get a normalized push/end/callback session. */
import { openLiveVg, type LiveVg } from "./doubao-web.js";
import { openLiveIme, type LiveIme } from "./doubao.js";
import type { AsrSeg } from "./asr-providers.js";

export type AsrChoice = "auto" | "doubao-web" | "doubao-ime" | "sr" | "off";
export const ASR_ENGINES: AsrChoice[] = ["auto", "doubao-web", "doubao-ime", "sr", "off"];

export interface LiveAsrSession {
  name: "doubao-web" | "doubao-ime";
  push(pcm: Buffer): void;
  end(): Promise<AsrSeg[]>;
  onPartial(cb: (t: string) => void): void;
  onSentence(cb: (s: { text: string; start: number; end: number }) => void): void;
}

function wrap(s: LiveVg | LiveIme, name: LiveAsrSession["name"]): LiveAsrSession {
  return {
    name,
    push: p => s.push(p),
    end: () => s.end(),
    onPartial: c => s.onPartial((t: string) => c(t)),
    onSentence: c => s.onSentence(c),
  };
}

/** Open a live ASR session. "auto" tries doubao-web → doubao-ime; throws if all fail. */
export async function openLiveAsr(choice: Exclude<AsrChoice, "sr" | "off">): Promise<LiveAsrSession> {
  if (choice === "doubao-web") return wrap(await openLiveVg(), "doubao-web");
  if (choice === "doubao-ime") return wrap(await openLiveIme(), "doubao-ime");
  // auto
  try { return wrap(await openLiveVg(), "doubao-web"); }
  catch (e1) {
    try { return wrap(await openLiveIme(), "doubao-ime"); }
    catch (e2) {
      throw new Error(`auto asr failed — doubao-web: ${(e1 as Error).message} | doubao-ime: ${(e2 as Error).message}`);
    }
  }
}
