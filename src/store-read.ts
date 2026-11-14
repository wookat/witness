import { existsSync, readdirSync } from "fs";
import { readFile, stat } from "fs/promises";
import { join, resolve } from "path";
import type { Ev } from "./events.js";
import type { Meta } from "./session.js";
import type { Transcript } from "./transcribe.js";

export function sessionRoot(cwd = process.cwd()): string {
  return join(cwd, ".witness", "sessions");
}

export function latestSession(cwd = process.cwd()): string | undefined {
  const root = sessionRoot(cwd);
  if (!existsSync(root)) return undefined;
  const dirs = readdirSync(root).filter(d => !d.startsWith(".")).sort();
  const last = dirs.at(-1);
  return last ? join(root, last) : undefined;
}

export interface LoadedSession {
  dir: string;
  events: Ev[];
  meta: Meta;
  transcript?: Transcript;
  audio?: boolean;
}

export async function loadSession(sessionDir: string): Promise<LoadedSession> {
  const dir = resolve(sessionDir);
  const eventsPath = join(dir, "events.jsonl");
  const events = (await readFile(eventsPath, "utf8"))
    .split("\n")
    .filter(l => l.trim())
    .map(l => JSON.parse(l) as Ev);
  const navUrl = (events.find(e => e.kind === "nav") as { url?: string } | undefined)?.url;
  let meta: Meta;
  let audio: boolean | undefined;
  try {
    const m = JSON.parse(await readFile(join(dir, "session.json"), "utf8"));
    meta = {
      url: m.url ?? navUrl ?? "unknown",
      startedAt: m.startedAt ?? Date.now(),
      durationMs: m.durationMs ?? events.at(-1)?.t ?? 0,
      lang: m.lang,
    };
    audio = !!m.audio;
    meta.audio = audio;
  } catch {
    meta = {
      url: navUrl ?? "unknown",
      startedAt: (await stat(eventsPath)).birthtimeMs,
      durationMs: events.at(-1)?.t ?? 0,
    };
  }
  let transcript: Transcript | undefined;
  try { transcript = JSON.parse(await readFile(join(dir, "transcript.json"), "utf8")); } catch {}
  return { dir, events, meta, transcript, audio };
}
