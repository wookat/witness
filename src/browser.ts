/** Shared Playwright browser launcher — system Edge/Chrome first, bundled Chromium fallback. */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { chromium, type Browser, type LaunchOptions } from "playwright";

export type BrowserChannel = "msedge" | "chrome" | undefined;

let cachedChannel: BrowserChannel | null = null;

/** Detect available system browser channel (cached per process). */
export async function detectBrowserChannel(): Promise<{ channel: BrowserChannel; installed: boolean }> {
  if (cachedChannel !== null) return { channel: cachedChannel, installed: true };
  for (const ch of ["msedge", "chrome"] as const) {
    try {
      const b = await chromium.launch({ channel: ch, headless: true });
      await b.close();
      cachedChannel = ch;
      return { channel: ch, installed: true };
    } catch { /* not installed */ }
  }
  try {
    if (existsSync(chromium.executablePath())) {
      cachedChannel = undefined;
      return { channel: undefined, installed: true };
    }
  } catch { /* not installed */ }
  return { channel: undefined, installed: false };
}

/**
 * Launch Chromium preferring system Edge/Chrome in a single attempt (no redundant probe launch).
 * Installs Playwright's bundled Chromium only if no system or bundled browser exists.
 */
export async function launchBrowser(opts: LaunchOptions = {}): Promise<{ browser: Browser; channel: BrowserChannel }> {
  if (cachedChannel !== null) {
    return { browser: await chromium.launch({ ...opts, channel: cachedChannel }), channel: cachedChannel };
  }
  for (const ch of ["msedge", "chrome"] as const) {
    try {
      const browser = await chromium.launch({ ...opts, channel: ch });
      cachedChannel = ch;
      return { browser, channel: ch };
    } catch { /* try next */ }
  }
  try {
    if (existsSync(chromium.executablePath())) {
      cachedChannel = undefined;
      return { browser: await chromium.launch(opts), channel: undefined };
    }
  } catch { /* install below */ }
  console.log("no system Edge/Chrome found — installing bundled chromium …");
  execSync("npx playwright install chromium", { stdio: "inherit" });
  cachedChannel = undefined;
  return { browser: await chromium.launch(opts), channel: undefined };
}
