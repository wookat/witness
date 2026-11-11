/** Persisted recorder config: <cwd>/.witness/config.json, overridable by env + flags. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AsrChoice } from "./live-asr.js";

export interface WitConfig { asr?: AsrChoice }

const path = () => join(process.cwd(), ".witness", "config.json");

export function readConfig(): WitConfig {
  try { return JSON.parse(readFileSync(path(), "utf8")); } catch { return {}; }
}

export function setConfig<K extends keyof WitConfig>(key: K, val: WitConfig[K]): void {
  const c = readConfig();
  c[key] = val;
  try { mkdirSync(join(process.cwd(), ".witness"), { recursive: true }); } catch {}
  writeFileSync(path(), JSON.stringify(c, null, 2));
}

/** Resolution order: flag > WIT_ASR env > .witness/config.json > "auto". */
export function resolveAsr(flag?: string): AsrChoice {
  const v = flag ?? process.env.WIT_ASR ?? readConfig().asr ?? "auto";
  return (["auto", "doubao-web", "doubao-ime", "sr", "off"] as AsrChoice[]).includes(v as AsrChoice) ? v as AsrChoice : "auto";
}
