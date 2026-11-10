// ASR benchmark: latency + accuracy probe for bcut (and friends)
// usage: node scripts/asr-bench.mjs <sessionDir|audio.webm>
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const arg = process.argv[2];
const dir = arg?.endsWith(".webm") ? null : arg;
const audioPath = arg?.endsWith(".webm") ? arg : join(arg, "audio.webm");
const eventsPath = dir ? join(dir, "events.jsonl") : null;

const { transcribeBcut } = await import("../dist/bcut.js");
const { webmToWav } = await import("../dist/webm2wav.js");

console.log("== decode webm→wav ==");
let t0 = Date.now();
const wav = await webmToWav(audioPath);
console.log(`  ${(Date.now() - t0) / 1000}s  ${(wav.length / 1e6).toFixed(1)}MB`);

// ---- batch: whole file ----
console.log("\n== batch: whole file → bcut ==");
t0 = Date.now();
const tmp = join(process.env.TEMP ?? ".", "wit-bench-full.wav");
const { writeFileSync } = await import("node:fs");
writeFileSync(tmp, wav);
const full = await transcribeBcut(tmp);
console.log(`  total ${(Date.now() - t0) / 1000}s  ${full.segments.length} segs`);

// ---- pseudo-realtime probe: a 20s chunk ----
console.log("\n== chunk probe: 20s slice → bcut (is near-real-time viable?) ==");
const sr = 16000, secs = 20, off = 44, n = sr * secs * 2;
const chunk = Buffer.concat([wav.subarray(0, off), wav.subarray(off, off + n)]);
chunk.writeUInt32LE(36 + n, 4); chunk.writeUInt32LE(n, 40);
const ctmp = join(process.env.TEMP ?? ".", "wit-bench-20s.wav");
writeFileSync(ctmp, chunk);
t0 = Date.now();
const part = await transcribeBcut(ctmp);
console.log(`  ${(Date.now() - t0) / 1000}s round-trip for 20s of audio, ${part.segments.length} segs`);

// ---- accuracy: browser-SR vs bcut at same time window ----
if (eventsPath && existsSync(eventsPath)) {
  console.log("\n== accuracy: browser-SR  vs  bcut (same windows) ==");
  const srs = readFileSync(eventsPath, "utf8").split("\n").filter(Boolean)
    .map(l => JSON.parse(l)).filter(e => e.kind === "say");
  for (const s of srs.slice(0, 14)) {
    const near = full.segments.filter(x => x.start * 1000 >= s.t - 6000 && x.start * 1000 <= s.t + 6000)
      .map(x => x.text).join(" ");
    console.log(`\n  [${(s.t / 1000).toFixed(0)}s]`);
    console.log(`    SR  : ${s.text}`);
    console.log(`    bcut: ${near || "—"}`);
  }
}
