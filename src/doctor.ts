/** `wit doctor` — preflight diagnostics: browser, mic path, ASR engines, transcription, config. */
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { hasTranscriber } from "./transcribe.js";
import { resolveAsr, readConfig } from "./config.js";

const ok = (s: string) => console.log(`  \x1b[32m✓\x1b[0m ${s}`);
const warn = (s: string) => console.log(`  \x1b[33m!\x1b[0m ${s}`);
const bad = (s: string) => console.log(`  \x1b[31m✗\x1b[0m ${s}`);
const info = (s: string) => console.log(`    ${s}`);

async function checkBrowser() {
  console.log("browser");
  let found: string | undefined;
  for (const ch of ["msedge", "chrome"] as const) {
    try {
      const b = await chromium.launch({ channel: ch, headless: true });
      await b.close();
      found = ch;
      break;
    } catch { /* not installed */ }
  }
  if (found) { ok(`system ${found} (zero-download path)`); return; }
  try {
    const p = chromium.executablePath();
    if (existsSync(p)) { ok("bundled chromium installed"); return; }
    bad("no Edge/Chrome and bundled chromium missing — run: npx playwright install chromium");
  } catch {
    bad("no Edge/Chrome and playwright browsers not installed — run: npx playwright install chromium");
  }
}

async function checkAsr() {
  console.log("live asr");
  const mode = resolveAsr();
  info(`engine: ${mode}${readConfig().asr ? " (persisted)" : " (default)"} — override: --asr / WIT_ASR / wit config asr`);
  if (mode === "sr") { warn("browser SpeechRecognition — weakest accuracy, no cloud fallback"); return; }
  if (mode === "off") { warn("live captions disabled — post-session transcript only"); return; }
  const { openLiveAsr } = await import("./live-asr.js");
  const choice = mode === "auto" ? "auto" : mode;
  const t0 = Date.now();
  try {
    const s = await Promise.race([
      openLiveAsr(choice as "auto" | "doubao-web" | "doubao-ime"),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout 12s")), 12_000)),
    ]);
    await s.end().catch(() => {});
    ok(`${s.name} reachable (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    if (mode === "auto") info("auto order: doubao-web → doubao-ime → browser SR fallback");
  } catch (e) {
    bad(`live asr unreachable: ${(e as Error).message.slice(0, 140)}`);
    info("recording still works — falls back to browser SpeechRecognition, then post-session bcut/whisper");
  }
}

async function checkTranscribe() {
  console.log("post-session transcription");
  const la = await import("./local-asr.js");
  const cfg = la.localAsrConfig();
  if (cfg.baseUrl || cfg.port || cfg.model || cfg.enabled) {
    const port = cfg.port ?? la.LOCAL_ASR_DEFAULT_PORT;
    const base = cfg.baseUrl ?? `http://127.0.0.1:${port}/v1`;
    info(`local-asr configured: ${cfg.model ?? la.LOCAL_ASR_DEFAULT_MODEL} @ ${base}`);
    if (await la.probeEndpoint(base)) ok(`local endpoint reachable — audio stays on this machine`);
    else warn(`local endpoint not reachable — start it: wit local-asr start (falls through to next backend)`);
  }
  if (process.env.WHISPER_BASE_URL) ok(`WHISPER_BASE_URL → ${process.env.WHISPER_BASE_URL} (model: ${process.env.WHISPER_MODEL ?? "whisper-1"})`);
  if (process.env.GROQ_API_KEY) ok("GROQ_API_KEY → whisper-large-v3-turbo");
  if (process.env.OPENAI_API_KEY) ok("OPENAI_API_KEY → whisper-1");
  if (!hasTranscriber()) {
    warn("no backend — falls back to free bcut for zh/auto sessions only");
    info("recommended: `wit setup local-asr` (offline, multilingual, private) or set GROQ_API_KEY/OPENAI_API_KEY");
  }
  if (process.env.ZHIPU_API_KEY) ok("ZHIPU_API_KEY set — --correct / --associate available");
  if (process.env.WIT_ASR_PROMPT) info(`WIT_ASR_PROMPT set — hotword bias for local ASR: "${process.env.WIT_ASR_PROMPT.slice(0, 60)}"`);
}

function checkEnv() {
  console.log("environment");
  const dir = join(process.cwd(), ".witness", "sessions");
  try {
    mkdirSync(dir, { recursive: true });
    const probe = join(dir, ".probe");
    writeFileSync(probe, "x"); rmSync(probe);
    ok(`sessions dir writable: ${dir}`);
  } catch { bad(`cannot write ${dir}`); }
  info(`node ${process.version} · ${process.platform} ${process.arch}`);
  info(`telemetry: ${process.env.WIT_TELEMETRY === "0" ? "off (WIT_TELEMETRY=0)" : "on — anonymous command stats only, WIT_TELEMETRY=0 disables"}`);
  info("mic note: getUserMedia needs a secure context — https:// or http://localhost only; plain http:// pages record without mic");
}

export async function doctor() {
  console.log("\n\x1b[36mwit doctor\x1b[0m — preflight checks\n");
  checkEnv();
  await checkBrowser();
  await checkAsr();
  await checkTranscribe();
  console.log("");
}
