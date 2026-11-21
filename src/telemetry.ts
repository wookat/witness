import { arch, platform } from "node:os";
import { createRequire } from "node:module";
import { readConfig } from "./config.js";

// Anonymous usage stats. Sent once per command run to our own
// Cloudflare Worker (no third party, no cookies, no session content).
// Disable with WIT_TELEMETRY=0 or `wit config telemetry off`.

const ENDPOINT = process.env.WIT_TELEMETRY_URL
  ?? "https://witness-stats.mxd79b86.workers.dev/e";

// Honor HTTP(S)_PROXY env vars for fetch (Node ≥20.18); no-op elsewhere.
process.env.NODE_USE_ENV_PROXY ??= "1";

const pkgVersion: string = (() => {
  try { return createRequire(import.meta.url)("../package.json").version ?? ""; }
  catch { return ""; }
})();

export function telemetryEnabled(): boolean {
  const v = (process.env.WIT_TELEMETRY ?? "").toLowerCase();
  if (["0", "off", "false", "no"].includes(v)) return false;
  if (process.env.CI) return false;
  if (readConfig().telemetry === false) return false;
  return true;
}

/** Fire-and-forget; never throws, never blocks exit. */
export function track(command: string, extra: Record<string, string> = {}): void {
  if (!telemetryEnabled()) return;
  const b = [
    command,
    pkgVersion,
    `${platform()}-${arch()}`,
    process.version.replace(/^v/, "").split(".")[0],
    Object.entries(extra).map(([k, v]) => `${k}=${v}`).join(";").slice(0, 120),
  ];
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 1500);
  t.unref?.();
  void fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ e: "cli", b }),
    signal: ctrl.signal,
  }).catch(() => {}).finally(() => clearTimeout(t));
}
