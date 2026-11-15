/** Local ASR management: uv bootstrap, speaches-free faster-whisper server lifecycle, health probes. */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync, statSync, openSync, closeSync, writeSync } from "node:fs";
import { homedir, platform, arch } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readConfig, setConfig } from "./config.js";

export interface LocalAsrCfg { enabled?: boolean; port?: number; model?: string; baseUrl?: string; hfEndpoint?: string; live?: { enabled?: boolean; modelDir?: string } }

export const LOCAL_ASR_DEFAULT_PORT = 8791;
export const LOCAL_ASR_DEFAULT_MODEL = "Systran/faster-whisper-small";

/** Friendly preset → faster-whisper (CT2) HuggingFace repo id. */
export const MODEL_PRESETS: Record<string, string> = {
  tiny: "Systran/faster-whisper-tiny",
  base: "Systran/faster-whisper-base",
  small: "Systran/faster-whisper-small",
  medium: "Systran/faster-whisper-medium",
  large: "Systran/faster-whisper-large-v3",
  turbo: "deepdml/faster-whisper-large-v3-turbo-ct2",
};

export function resolveModelPreset(v?: string): string {
  if (!v) return LOCAL_ASR_DEFAULT_MODEL;
  return MODEL_PRESETS[v.toLowerCase()] ?? v; // raw HF repo id passes through
}

export function localAsrConfig(): LocalAsrCfg {
  return (readConfig() as { localAsr?: LocalAsrCfg }).localAsr ?? {};
}

/** Ordered transcription candidates. index 0 = highest priority.
 *  WHISPER_BASE_URL env is an explicit per-run override → first.
 *  Persisted local-asr config next (local-first: keeps audio on-device),
 *  then hosted keys. */
export interface TranscribeTarget { kind: "local" | "openai"; baseURL: string; model: string; apiKey?: string }

export function transcribeTargets(): TranscribeTarget[] {
  const out: TranscribeTarget[] = [];
  if (process.env.WHISPER_BASE_URL) {
    out.push({ kind: "openai", baseURL: process.env.WHISPER_BASE_URL.replace(/\/+$/, ""), model: process.env.WHISPER_MODEL ?? "whisper-1", apiKey: process.env.WHISPER_API_KEY ?? "local" });
  }
  const cfg = localAsrConfig();
  if (cfg.enabled !== false) {
    // configured = any localAsr field present; enabled:false opts out entirely
    if (cfg.baseUrl || cfg.port || cfg.model || cfg.enabled) {
      const base = cfg.baseUrl
        ? cfg.baseUrl.replace(/\/+$/, "")
        : `http://127.0.0.1:${cfg.port ?? LOCAL_ASR_DEFAULT_PORT}/v1`;
      out.push({ kind: "local", baseURL: base, model: cfg.model ?? LOCAL_ASR_DEFAULT_MODEL });
    }
  }
  if (process.env.GROQ_API_KEY) out.push({ kind: "openai", baseURL: "https://api.groq.com/openai/v1", model: "whisper-large-v3-turbo", apiKey: process.env.GROQ_API_KEY });
  if (process.env.OPENAI_API_KEY) out.push({ kind: "openai", baseURL: "https://api.openai.com/v1", model: "whisper-1", apiKey: process.env.OPENAI_API_KEY });
  return out;
}

export function hasLocalAsr(): boolean {
  const cfg = localAsrConfig();
  return !!(cfg.baseUrl || cfg.port || cfg.model || cfg.enabled === true);
}

// ---- model management: list / switch / download / remove ----

/** huggingface_hub cache root (~/.cache/huggingface, overridable via HF_HOME). */
export function hfCacheHub(): string {
  const home = process.env.HF_HOME ?? join(homedir(), ".cache", "huggingface");
  return join(home, "hub");
}

/** `Org/name` → `models--Org--name` cache dir name. */
export function modelCacheDirName(modelId: string): string {
  return "models--" + modelId.replace(/\//g, "--");
}

/** Repo ids present in the HF cache with at least one snapshot file. */
export function installedModels(): string[] {
  const hub = hfCacheHub();
  if (!existsSync(hub)) return [];
  const out: string[] = [];
  for (const d of readdirSync(hub)) {
    if (!d.startsWith("models--")) continue;
    const snaps = join(hub, d, "snapshots");
    try {
      const ok = readdirSync(snaps).some(s => readdirSync(join(snaps, s)).length > 0);
      if (ok) out.push(d.slice("models--".length).replace(/--/g, "/"));
    } catch { /* partial download — skip */ }
  }
  return out.sort();
}

export function modelInstalled(modelId: string): boolean {
  return installedModels().includes(modelId);
}

export function removeModel(modelId: string): boolean {
  const p = join(hfCacheHub(), modelCacheDirName(modelId));
  if (!existsSync(p)) return false;
  rmSync(p, { recursive: true, force: true });
  return true;
}

/** Rough on-disk size of a cached model dir (bytes), 0 if absent. */
export function modelDirSize(modelId: string): number {
  const p = join(hfCacheHub(), modelCacheDirName(modelId));
  let total = 0;
  const walk = (d: string) => {
    for (const f of readdirSync(d, { withFileTypes: true })) {
      const fp = join(d, f.name);
      if (f.isDirectory()) walk(fp);
      else { try { total += statSync(fp).size; } catch { /* locked file — skip */ } }
    }
  };
  try { walk(p); } catch { /* absent */ }
  return total;
}

/** GET {base}/models — true if an OpenAI-compatible server answers. */
export async function probeEndpoint(baseURL: string, timeoutMs = 1800): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`${baseURL.replace(/\/+$/, "")}/models`, { signal: ctrl.signal });
    clearTimeout(t);
    return res.ok;
  } catch { return false; }
}

/** GET {base}/health (our bundled server) — richer status than /models. */
export async function probeHealth(baseURL: string, timeoutMs = 1800): Promise<{ ok: boolean; status?: string; model?: string }> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`${baseURL.replace(/\/+$/, "").replace(/\/v1$/, "")}/health`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return { ok: false };
    const j = await res.json() as { status?: string; model?: string };
    return { ok: j.status === "ok" || j.status === "loading", status: j.status, model: j.model };
  } catch { return { ok: false }; }
}

// ---------- uv bootstrap ----------

function witBinDir(): string {
  const d = join(homedir(), ".wit", "bin");
  mkdirSync(d, { recursive: true });
  return d;
}

const UV_ASSETS: Record<string, string> = {
  "win32:x64": "uv-x86_64-pc-windows-msvc.zip",
  "win32:arm64": "uv-aarch64-pc-windows-msvc.zip",
  "linux:x64": "uv-x86_64-unknown-linux-gnu.tar.gz",
  "linux:arm64": "uv-aarch64-unknown-linux-gnu.tar.gz",
  "darwin:x64": "uv-x86_64-apple-darwin.tar.gz",
  "darwin:arm64": "uv-aarch64-apple-darwin.tar.gz",
};

function whichUv(): string | null {
  const exe = platform() === "win32" ? "uv.exe" : "uv";
  for (const dir of [witBinDir(), join(homedir(), ".local", "bin"), join(homedir(), ".cargo", "bin")]) {
    const p = join(dir, exe);
    if (existsSync(p)) return p;
  }
  const r = spawnSync(platform() === "win32" ? "where" : "which", ["uv"], { encoding: "utf8" });
  const first = r.stdout?.split(/\r?\n/)[0]?.trim();
  return first && existsSync(first) ? first : null;
}

/** Locate uv or download a standalone binary into ~/.wit/bin. Returns absolute path. */
export async function ensureUv(log: (s: string) => void = console.log): Promise<string> {
  const found = whichUv();
  if (found) return found;
  const key = `${platform()}:${arch()}`;
  const asset = UV_ASSETS[key];
  if (!asset) throw new Error(`no uv build for ${key} — install uv manually: https://docs.astral.sh/uv/getting-started/installation/`);
  const url = `https://github.com/astral-sh/uv/releases/latest/download/${asset}`;
  const dest = witBinDir();
  const archive = join(dest, asset);
  log(`  downloading uv (${asset})…`);
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`uv download failed: HTTP ${res.status}`);
  writeFileSync(archive, Buffer.from(await res.arrayBuffer()));
  // bsdtar (Win10+/macOS) and GNU tar both read .zip via libarchive/zip
  const t = spawnSync("tar", ["-xf", archive, "-C", dest], { encoding: "utf8" });
  rmSync(archive, { force: true });
  if (t.status !== 0) throw new Error(`uv extract failed: ${t.stderr?.slice(0, 200)}`);
  const exe = platform() === "win32" ? "uv.exe" : "uv";
  // uv zips nest binaries under uv-x86_64-*/ sometimes; find it
  let bin = join(dest, exe);
  if (!existsSync(bin)) {
    for (const e of readdirSync(dest)) {
      const cand = join(dest, e, exe);
      if (existsSync(cand)) { bin = cand; break; }
    }
  }
  if (!existsSync(bin)) throw new Error("uv binary not found after extract");
  if (platform() !== "win32") spawnSync("chmod", ["+x", bin]);
  log(`  uv installed → ${bin}`);
  return bin;
}

// ---------- server lifecycle ----------

const HERE = dirname(fileURLToPath(import.meta.url));
export function serverScriptPath(): string {
  // dist/local-asr.js → ../local-asr/server.py ; src/local-asr.ts (dev) → ../local-asr/server.py
  return join(HERE, "..", "local-asr", "server.py");
}

function stateDir(): string {
  const d = join(process.cwd(), ".witness");
  mkdirSync(d, { recursive: true });
  return d;
}
const pidFile = () => join(stateDir(), "local-asr.pid");
const logFile = () => join(stateDir(), "local-asr.log");

function readPid(): number | null {
  try { const p = parseInt(readFileSync(pidFile(), "utf8").trim(), 10); return Number.isFinite(p) ? p : null; } catch { return null; }
}

export function localAsrPidAlive(): boolean {
  const pid = readPid();
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

export function localAsrPid(): number | null { return readPid(); }

function endpointFor(cfg: LocalAsrCfg): { baseURL: string; port: number } {
  const port = cfg.port ?? LOCAL_ASR_DEFAULT_PORT;
  return { baseURL: cfg.baseUrl ?? `http://127.0.0.1:${port}/v1`, port };
}

/** Spawn the bundled faster-whisper server detached. Resolves when /health reports ok/loading. */
export async function startLocalAsr(opts: { port?: number; model?: string; uv?: string; hfEndpoint?: string } = {}): Promise<{ baseURL: string; port: number; pid: number }> {
  const cfg = localAsrConfig();
  const port = opts.port ?? cfg.port ?? LOCAL_ASR_DEFAULT_PORT;
  const model = resolveModelPreset(opts.model ?? cfg.model);
  if (localAsrPidAlive()) {
    const ep = endpointFor({ ...cfg, port });
    return { ...ep, pid: readPid()! };
  }
  const uv = opts.uv ?? await ensureUv();
  const script = serverScriptPath();
  if (!existsSync(script)) throw new Error(`server script missing: ${script}`);
  const logPath = logFile();
  const logFd = openSync(logPath, "a");
  writeSync(logFd, `\n--- wit local-asr start ${new Date().toISOString()} model=${model} port=${port} ---\n`);
  const env = { ...process.env };
  const hf = opts.hfEndpoint ?? cfg.hfEndpoint ?? process.env.HF_ENDPOINT;
  if (hf) env.HF_ENDPOINT = hf;
  const child = spawn(uv, ["run", script, "--model", model, "--port", String(port), "--host", "127.0.0.1"], {
    detached: true,
    stdio: ["ignore", logFd, logFd],
    windowsHide: true,
    env,
  });
  closeSync(logFd); // child holds its own dup of the fd
  child.unref();
  writeFileSync(pidFile(), String(child.pid));
  setConfig("localAsr", { ...cfg, enabled: true, port, model });
  const baseURL = `http://127.0.0.1:${port}/v1`;
  // first run downloads deps+model — can take minutes; poll generously
  const deadline = Date.now() + 10 * 60_000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 2000));
    const h = await probeHealth(baseURL, 1500);
    if (h.ok) return { baseURL, port, pid: child.pid! };
    if (h.status === "error") throw new Error(`model failed to load — see ${logFile()}`);
    if (!localAsrPidAlive()) throw new Error(`server exited early — see ${logFile()}`);
  }
  throw new Error(`server did not become ready in 10min — see ${logFile()}`);
}

export function stopLocalAsr(): boolean {
  const pid = readPid();
  rmSync(pidFile(), { force: true });
  if (!pid) return false;
  try {
    if (platform() === "win32") {
      // uv run → python grandchild: kill the whole tree or the port stays bound
      spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      // detached spawn → child is a process-group leader; -pid hits the tree
      try { process.kill(-pid, "SIGTERM"); } catch { process.kill(pid, "SIGTERM"); }
    }
    return true;
  } catch { return false; }
}

/** Pre-download model + warm uv cache without starting the server. */
export async function warmLocalAsrModel(uv: string, model: string, log: (s: string) => void = console.log, hfEndpoint?: string): Promise<void> {
  const script = serverScriptPath();
  log(`  downloading model ${model} (first run also fetches python deps — one-time)…`);
  const env = { ...process.env };
  if (hfEndpoint) env.HF_ENDPOINT = hfEndpoint;
  const r = spawnSync(uv, ["run", script, "--model", model, "--check"], { stdio: "inherit", timeout: 30 * 60_000, env });
  if (r.status !== 0) throw new Error(`model warm-up failed (exit ${r.status})`);
}

/** HF hub is unreachable directly for many CN users — hf-mirror.com is the standard proxy. */
export const HF_MIRROR = "https://hf-mirror.com";
export function looksLikeHubNetworkError(msg: string): boolean {
  return /connect|timed?\s?out|timeout|10060|10054|econn|enotfound|network|huggingface|hub/i.test(msg);
}

// ---- local LIVE asr (sherpa-onnx streaming zipformer, fully offline) ----

export const LIVE_ASR_PORT = 8792;
const LIVE_MODEL_REPO = "csukuangfj/sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20";
// int8 = ~4x smaller/faster on CPU; zh+en bilingual covers the primary user base
const LIVE_FILES: Record<string, string> = {
  "encoder-epoch-99-avg-1.int8.onnx": "encoder.int8.onnx",
  "decoder-epoch-99-avg-1.int8.onnx": "decoder.int8.onnx",
  "joiner-epoch-99-avg-1.int8.onnx": "joiner.int8.onnx",
  "tokens.txt": "tokens.txt",
};

export function liveScriptPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..", "local-asr", "live_server.py");
}

export function liveModelDir(): string {
  return localAsrConfig().live?.modelDir ?? join(homedir(), ".witness", "models", "sherpa-zipformer-zh-en");
}

export function liveModelReady(dir = liveModelDir()): boolean {
  return existsSync(join(dir, "encoder.int8.onnx")) && existsSync(join(dir, "tokens.txt"));
}

/** Download the streaming model (~1190MB int8) — HF first, hf-mirror fallback. */
export async function ensureLiveModel(log: (s: string) => void = console.log): Promise<string> {
  const dir = liveModelDir();
  if (liveModelReady(dir)) return dir;
  mkdirSync(dir, { recursive: true });
  const bases = ["https://huggingface.co", HF_MIRROR];
  const curlBin = platform() === "win32" ? "curl.exe" : "curl";
  for (const [remote, local] of Object.entries(LIVE_FILES)) {
    const dest = join(dir, local);
    if (existsSync(dest) && statSync(dest).size > 0) continue;
    let ok = false;
    let lastErr = "";
    for (const base of bases) {
      const url = `${base}/${LIVE_MODEL_REPO}/resolve/main/${remote}`;
      try {
        log(`  … ${remote} (${base.includes("mirror") ? "mirror" : "hf"})`);
        const r = await fetch(url, { signal: AbortSignal.timeout(120_000) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
        ok = true;
        break;
      } catch (e) {
        lastErr = (e as Error).message;
        // undici fetch can fail where curl succeeds (proxy/DNS/redirect quirks) — fall back
        const c = spawnSync(curlBin, ["-fSL", "--max-time", "300", "-o", dest, url], { stdio: "ignore" });
        if (c.status === 0 && existsSync(dest) && statSync(dest).size > 0) { ok = true; break; }
        lastErr += ` | curl: exit ${c.status ?? c.error?.message ?? "?"}`;
      }
    }
    if (!ok) throw new Error(`live model download failed for ${remote}: ${lastErr}`);
  }
  return dir;
}

const livePidFile = () => join(stateDir(), "live-asr.pid");
const liveLogFile = () => join(stateDir(), "live-asr.log");

function livePid(): number | null {
  try { const p = parseInt(readFileSync(livePidFile(), "utf8").trim(), 10); return Number.isFinite(p) ? p : null; } catch { return null; }
}

export function liveAsrPidAlive(): boolean {
  const pid = livePid();
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

export async function probeLive(timeoutMs = 1500): Promise<boolean> {
  try {
    const r = await fetch(`http://127.0.0.1:${LIVE_ASR_PORT}/health`, { signal: AbortSignal.timeout(timeoutMs) });
    return r.ok;
  } catch { return false; }
}

/** Spawn the sherpa-onnx live server detached; resolves when /health answers. */
export async function startLiveAsr(opts: { uv?: string } = {}): Promise<{ port: number; pid: number; modelDir: string }> {
  if (liveAsrPidAlive() && await probeLive()) return { port: LIVE_ASR_PORT, pid: livePid()!, modelDir: liveModelDir() };
  const dir = await ensureLiveModel();
  const uv = opts.uv ?? await ensureUv();
  const script = liveScriptPath();
  if (!existsSync(script)) throw new Error(`live server script missing: ${script}`);
  const logFd = openSync(liveLogFile(), "a");
  writeSync(logFd, `\n--- wit local live-asr start ${new Date().toISOString()} modelDir=${dir} ---\n`);
  const child = spawn(uv, ["run", script, "--model-dir", dir, "--port", String(LIVE_ASR_PORT), "--host", "127.0.0.1"], {
    detached: true, stdio: ["ignore", logFd, logFd], windowsHide: true, env: { ...process.env },
  });
  closeSync(logFd);
  child.unref();
  writeFileSync(livePidFile(), String(child.pid));
  const cfg = localAsrConfig();
  setConfig("localAsr", { ...cfg, live: { ...(cfg.live ?? {}), enabled: true, modelDir: dir } });
  const deadline = Date.now() + 5 * 60_000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 2000));
    if (await probeLive()) return { port: LIVE_ASR_PORT, pid: child.pid!, modelDir: dir };
    if (!liveAsrPidAlive()) throw new Error(`live server exited early — see ${liveLogFile()}`);
  }
  throw new Error(`live server not ready in 5min — see ${liveLogFile()}`);
}

export function stopLiveAsr(): boolean {
  const pid = livePid();
  rmSync(livePidFile(), { force: true });
  if (!pid) return false;
  try {
    if (platform() === "win32") spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
    else { try { process.kill(-pid, "SIGTERM"); } catch { process.kill(pid, "SIGTERM"); } }
    return true;
  } catch { return false; }
}
