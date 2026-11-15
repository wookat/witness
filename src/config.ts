/**
 * Persisted recorder config, two scopes merged on read:
 *   global  ~/.witness/config.json      — machine-level (localAsr endpoint/model paths)
 *   project <cwd>/.witness/config.json  — per-project prefs (asr engine, lang, hotwords)
 * Resolution at use sites: flag > env > merged config > default.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { AsrChoice } from "./live-asr.js";
import type { LocalAsrCfg } from "./local-asr.js";

export interface WitConfig { asr?: AsrChoice; localAsr?: LocalAsrCfg; asrPrompt?: string; lang?: string }

/**
 * Which file each key calls home (the other file can still override on read):
 *   global  — machine/user prefs valid everywhere: localAsr, asr engine, lang
 *   project — domain vocab that differs per project: asrPrompt
 */
const GLOBAL_KEYS = new Set<keyof WitConfig>(["localAsr", "asr", "lang"]);

const globalPath = () => join(homedir(), ".witness", "config.json");
const projectPath = () => join(process.cwd(), ".witness", "config.json");
const readJson = (p: string): Partial<WitConfig> => {
  try { return JSON.parse(readFileSync(p, "utf8")); } catch { return {}; }
};
const writeJson = (p: string, c: unknown): void => {
  try { mkdirSync(dirname(p), { recursive: true }); } catch {}
  writeFileSync(p, JSON.stringify(c, null, 2));
};

/** merged view: global underneath, project overrides on top */
export function readConfig(): WitConfig {
  const g = readJson(globalPath()), p = readJson(projectPath());
  // shallow merge per key — project's copy wins when both define the same key
  return { ...g, ...p };
}

export function setConfig<K extends keyof WitConfig>(key: K, val: WitConfig[K]): void {
  const global = GLOBAL_KEYS.has(key);
  writeJson(global ? globalPath() : projectPath(), { ...readJson(global ? globalPath() : projectPath()), [key]: val });
  // scrub the same key from the other file so a stale shadow can't override the new value
  const other = global ? projectPath() : globalPath();
  const o = readJson(other);
  if (key in o) { delete o[key]; writeJson(other, o); }
}

/** where each scope lives — for `wit config` display */
export function configPaths(): { global: string; project: string } {
  return { global: globalPath(), project: projectPath() };
}

/** Resolution order: flag > WIT_ASR env > config.json (project>global) > "auto". */
export function resolveAsr(flag?: string): AsrChoice {
  const v = flag ?? process.env.WIT_ASR ?? readConfig().asr ?? "auto";
  return (["auto", "doubao-web", "doubao-ime", "local", "sr", "off"] as AsrChoice[]).includes(v as AsrChoice) ? v as AsrChoice : "auto";
}

/** Resolution order: --lang flag > config.json lang (project>global) > undefined (browser/OS default). */
export function resolveLang(flag?: string): string | undefined {
  return flag ?? readConfig().lang;
}
