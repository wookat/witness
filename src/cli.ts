#!/usr/bin/env node
import { config } from "dotenv";
import { existsSync, readdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { Command } from "commander";
import { record } from "./recorder.js";
import { transcribe } from "./transcribe.js";
import { align } from "./align.js";
import { writeSessionFiles } from "./session.js";
import { correctSays, hasCorrector } from "./correct.js";
import { associateSays, hasAssociator } from "./associate.js";
import { loadSession } from "./store-read.js";
import { track } from "./telemetry.js";

config({ path: [join(process.cwd(), ".env"), join(import.meta.dirname, "..", ".env")] });

const program = new Command();
const { version } = createRequire(import.meta.url)("../package.json");
program.name("wit").description("witness — voice-anchored evidence recorder for AI agents").version(version);

// Anonymous usage stats (WIT_TELEMETRY=0 to disable). Never includes
// URLs, session content, file paths or any recorded data.
program.hook("preAction", (_this, cmd) => {
  const o = cmd.opts?.() ?? {};
  track(cmd.name(), cmd.name() === "start" ? { asr: o.asr ?? "auto", lang: o.lang ?? "auto" } : {});
});

program
  .command("start <url>")
  .description("open a managed browser, record voice + page evidence, emit session.md")
  .option("-o, --out <dir>", "output base dir (default: <cwd>/.witness/sessions)")
  .option("--no-transcribe", "skip whisper transcription")
  .option("--duration <sec>", "auto-stop after N seconds")
  .option("--lang <bcp47>", "speech recognition language (default: browser/OS language)")
  .option("--correct", "LLM-polish SAY text via zhipu GLM (off by default — transcript stays verbatim)")
  .option("--associate", "LLM-pick relevant evidence per speech block (needs ZHIPU_API_KEY)", false)
  .option("--no-rr", "skip rrweb full-DOM replay capture")
  .option("--keyframes", "after stop, render rrweb → per-segment keyframe jpgs (agent-consumable replay)")
  .option("--asr <engine>", "live speech engine: auto|doubao-web|doubao-ime|sr|off (see `wit config asr` to persist)")
  .option("--shot-interval <ms>", "periodic screenshot interval", "10000")
  .option("--width <px>", "viewport width", "1560")
  .option("--height <px>", "viewport height", "960")
  .option("--dsf <n>", "device pixel ratio for screenshots (1=default, 2=retina)", "1")
  .option("--shot-format <fmt>", "screenshot codec: jpeg|webp (jpeg=compat, webp=smaller)", "jpeg")
  .action(async (url, o) => {
    await record({
      url,
      outBase: o.out,
      transcribe: o.transcribe,
      shotInterval: Number(o.shotInterval),
      width: Number(o.width),
      height: Number(o.height),
      dsf: Number(o.dsf),
      shotFormat: o.shotFormat === "webp" ? "webp" : "jpeg",
      duration: o.duration ? Number(o.duration) : undefined,
      lang: o.lang,
      correct: !!o.correct,
      associate: !!o.associate,
      rr: o.rr !== false,
      asr: o.asr,
      keyframes: !!o.keyframes,
    });
  });

program
  .command("transcribe <sessionDir>")
  .description("(re)transcribe a session's audio.webm and rebuild session.md with SAY blocks")
  .action(async dir => {
    const audioPath = join(dir, "audio.webm");
    const eventsPath = join(dir, "events.jsonl");
    if (!existsSync(audioPath) || !existsSync(eventsPath)) { console.log("missing audio.webm or events.jsonl in " + dir); return; }
    const s = await loadSession(dir);
    const { hasTranscriber, shouldUseBcut } = await import("./transcribe.js");
    let t;
    if (hasTranscriber()) {
      console.log("transcribing (whisper chain)…");
      t = await transcribe(audioPath, { language: s.meta.lang });
    } else if (shouldUseBcut(s.meta.lang)) {
      console.log("transcribing (bcut)…");
      t = await (await import("./bcut.js")).transcribeBcut(audioPath);
    } else {
      console.log(`no backend for lang=${s.meta.lang} — run \`wit setup local-asr\` or set WHISPER_BASE_URL/GROQ_API_KEY/OPENAI_API_KEY`);
      return;
    }
    console.log(`  ${t.segments.length} segments`);
    // audio t=0 is mic-arm, not nav — shift into session time
    const bias = (s.events.find(e => e.kind === "note" && ((e as { tag?: string }).tag === "mic-start" || /mic recording/i.test(e.text ?? "")))?.t ?? 0) / 1000;
    const segs = bias ? t.segments.map(x => ({ ...x, start: x.start + bias, end: x.end + bias })) : t.segments;
    const aligned = align(s.events, segs);
    await writeSessionFiles(s.dir, aligned, s.meta, { ...t, segments: segs });
    console.log("✔ session.md rebuilt with SAY blocks → " + join(dir, "session.md"));
  });

program
  .command("correct <sessionDir>")
  .description("re-run LLM say-correction on an existing session and rebuild session.md")
  .action(async dir => {
    const eventsPath = join(dir, "events.jsonl");
    if (!existsSync(eventsPath)) { console.log("missing events.jsonl in " + dir); return; }
    if (!hasCorrector()) { console.log("no ZHIPU_API_KEY in .env"); return; }
    const s = await loadSession(dir);
    const corrected = await correctSays(align(s.events, []), s.meta.url);
    await writeSessionFiles(s.dir, corrected, s.meta);
    const diffs = corrected.filter((e, i) =>
      e.kind === "say" && s.events[i]?.kind === "say" && e.text !== (s.events[i] as { text?: string }).text);
    console.log(`✔ corrected ${diffs.length} say event(s) → ` + join(dir, "session.md"));
  });

program
  .command("recover <sessionDir>")
  .description("rebuild session.md/review.html from events.jsonl after a crash or interrupted recording")
  .action(async dir => {
    const s = await loadSession(dir);
    await writeSessionFiles(s.dir, align(s.events, s.transcript?.segments ?? []), s.meta, s.transcript);
    console.log("✔ recovered → " + s.dir);
  });

program
  .command("associate <sessionDir>")
  .description("LLM-pick which events are relevant evidence for each SAY, save assoc.json, rebuild session.md")
  .action(async dir => {
    if (!hasAssociator()) { console.log("no ZHIPU_API_KEY in .env"); return; }
    const s = await loadSession(dir);
    const events = align(s.events, s.transcript?.segments ?? []);
    console.log("associating…");
    const assoc = await associateSays(events);
    await writeSessionFiles(s.dir, events, s.meta, s.transcript, assoc);
    console.log(`✔ ${assoc.size} SAY block(s) annotated → ` + join(s.dir, "session.md"));
  });

program
  .command("segments <sessionDir>")
  .description("(re)generate SEGMENTS.md + segments/NN.md + segments.json — speech anchors with evidence bundles the agent reads first (semantic grouping is the agent's job)")
  .action(async dir => {
    const s = await loadSession(dir);
    const { writeSegments } = await import("./segments.js");
    const n = writeSegments(s.dir, align(s.events, s.transcript?.segments ?? []), s.meta).length;
    console.log(`✔ ${n} speech segment(s) → ` + join(s.dir, "SEGMENTS.md"));
  });

program
  .command("keyframes <sessionDir>")
  .description("render rrweb.jsonl into per-segment keyframe JPEGs (keyframes/S{n}-{0|1|2}.jpg) — the agent-consumable replay; re-indexes segments after")
  .action(async dir => {
    const s = await loadSession(dir);
    const { extractSegments, writeSegments } = await import("./segments.js");
    const { align } = await import("./align.js");
    const events = align(s.events, s.transcript?.segments ?? []);
    const segs = extractSegments(events);
    const { renderKeyframes } = await import("./keyframes.js");
    const n = await renderKeyframes(s.dir, s.meta, segs);
    writeSegments(s.dir, events, s.meta); // pick up keyframe refs in the index
    console.log(`✔ ${n} keyframes → ` + join(s.dir, "keyframes"));
  });

program
  .command("config [key] [value]")
  .description("show or set recorder config (.witness/config.json) — keys: asr = auto|doubao-web|doubao-ime|sr|off")
  .action(async (key, value) => {
    const { readConfig, setConfig } = await import("./config.js");
    const { ASR_ENGINES } = await import("./live-asr.js");
    if (!key) {
      const c = readConfig();
      console.log("asr =", c.asr ?? "auto", " (default)");
      const la = c.localAsr;
      console.log("local-asr =", la ? `${la.model ?? "small"} @ ${la.baseUrl ?? `127.0.0.1:${la.port ?? 8791}`} ${la.enabled === false ? "(disabled)" : "(enabled)"}` : "not configured — `wit setup local-asr`");
      console.log("engines:", ASR_ENGINES.join(" | "));
      console.log("set: wit config asr <engine>  ·  one-off: wit start --asr <engine>  ·  env: WIT_ASR");
      return;
    }
    if (key === "asr") {
      if (!ASR_ENGINES.includes(value)) { console.log(`asr must be one of: ${ASR_ENGINES.join(" | ")}`); return; }
      setConfig("asr", value);
      console.log(`✔ asr = ${value} (persisted to .witness/config.json)`);
      return;
    }
    console.log(`unknown key "${key}" — supported: asr`);
  });

program
  .command("setup")
  .description("one-time environment setup")
  .command("local-asr")
  .description("install + configure a local whisper transcription backend (offline, private, multilingual)")
  .option("--model <preset>", "tiny|base|small|medium|large|turbo or a faster-whisper HF repo id", "small")
  .option("--port <n>", "server port", "8791")
  .option("--skip-download", "write config only — model downloads on first transcription")
  .action(async o => {
    const la = await import("./local-asr.js");
    const { setConfig } = await import("./config.js");
    const model = la.resolveModelPreset(o.model);
    const port = Number(o.port);
    console.log(`\n\x1b[36mwit setup local-asr\x1b[0m — local whisper backend\n`);
    console.log(`  model : ${model}`);
    console.log(`  port  : ${port} (127.0.0.1 only)`);
    console.log(`  runtime: uv-managed python + faster-whisper (one-time ~1-2GB deps + model download)\n`);
    const uv = await la.ensureUv();
    const cfg: import("./local-asr.js").LocalAsrCfg = { enabled: true, port, model };
    if (!o.skipDownload) {
      try {
        await la.warmLocalAsrModel(uv, model);
      } catch (e) {
        const msg = (e as Error).message;
        if (la.looksLikeHubNetworkError(msg) && !process.env.HF_ENDPOINT) {
          console.log(`  ! huggingface.co unreachable — retrying via hf-mirror.com…`);
          try {
            await la.warmLocalAsrModel(uv, model, console.log, la.HF_MIRROR);
            cfg.hfEndpoint = la.HF_MIRROR;
            console.log(`  ✓ model ready via mirror`);
          } catch (e2) {
            console.log(`  ! warm-up failed: ${(e2 as Error).message} — will retry on first use`);
          }
        } else {
          console.log(`  ! warm-up failed: ${msg} — will retry on first use`);
        }
      }
    }
    setConfig("localAsr", cfg);
    console.log(`\n✔ configured → .witness/config.json`);
    console.log(`  start server : wit local-asr start`);
    console.log(`  check status : wit local-asr status`);
    console.log(`  once running, every \`wit start\` / \`wit transcribe\` uses it automatically (falls back to keys/bcut if down)`);
    console.log(`  hotwords     : set WIT_ASR_PROMPT="product names, error codes" to bias recognition\n`);
  });

program
  .command("local-asr <action>")
  .description("manage the local ASR server: start | stop | status")
  .option("--port <n>", "override port (start)")
  .option("--model <preset>", "override model preset/id (start)")
  .action(async (action, o) => {
    const la = await import("./local-asr.js");
    if (action === "start") {
      console.log("starting local ASR… (first run downloads python deps + model — be patient)\n");
      const r = await la.startLocalAsr({ port: o.port ? Number(o.port) : undefined, model: o.model });
      console.log(`\n✔ local ASR ready → ${r.baseURL} (pid ${r.pid})`);
      console.log(`  logs: ${join(process.cwd(), ".witness", "local-asr.log")}`);
      console.log(`  transcription picks it up automatically — no restart of wit needed`);
      return;
    }
    if (action === "stop") {
      console.log(la.stopLocalAsr() ? "✔ local ASR stopped" : "not running");
      return;
    }
    if (action === "status") {
      const cfg = la.localAsrConfig();
      const configured = !!(cfg.baseUrl || cfg.port || cfg.model || cfg.enabled);
      if (!configured) {
        console.log("local-asr: not configured — run `wit setup local-asr`");
        return;
      }
      const pid = la.localAsrPid();
      const pidAlive = la.localAsrPidAlive();
      const port = cfg.port ?? la.LOCAL_ASR_DEFAULT_PORT;
      const isCustom = !!cfg.baseUrl;
      const base = cfg.baseUrl ?? `http://127.0.0.1:${port}/v1`;
      // bundled server exposes /health; remote OpenAI-compat servers only /v1/models
      const h = isCustom ? { ok: await la.probeEndpoint(base) } : await la.probeHealth(base);
      console.log(`config : ${cfg.model ?? la.LOCAL_ASR_DEFAULT_MODEL} @ ${base}${cfg.enabled === false ? " (disabled)" : ""}`);
      console.log(`process: ${pidAlive ? `running (pid ${pid})` : "not running"}`);
      console.log(`server : ${h.ok ? "reachable" : "unreachable — start with: wit local-asr start"}`);
      return;
    }
    console.log("usage: wit local-asr start|stop|status");
  });

program
  .command("doctor")
  .description("preflight checks: browser, live-ASR reachability, transcription keys, sessions dir")
  .action(async () => { const { doctor } = await import("./doctor.js"); await doctor(); });

program
  .command("mcp [sessionDir]")
  .description("serve session evidence over stdio MCP so agents can query it (default: latest session)")
  .action(async dir => {
    const { serveMcp } = await import("./mcp.js");
    await serveMcp(dir);
  });

program
  .command("list")
  .description("list recorded sessions")
  .option("-d, --dir <dir>", "sessions base dir", join(process.cwd(), ".witness", "sessions"))
  .action(async o => {
    if (!existsSync(o.dir)) { console.log("no sessions yet"); return; }
    const dirs = readdirSync(o.dir).filter(x => existsSync(join(o.dir, x, "session.md"))).reverse();
    if (!dirs.length) { console.log("no sessions yet"); return; }
    for (const d of dirs) {
      let info = "";
      try {
        const meta = JSON.parse(await readFile(join(o.dir, d, "session.json"), "utf8"));
        const says = (await readFile(join(o.dir, d, "events.jsonl"), "utf8")).split('"kind":"say"').length - 1;
        const dur = Math.round((meta.durationMs ?? 0) / 1000);
        info = `${new URL(meta.url).host}${new URL(meta.url).pathname === "/" ? "" : new URL(meta.url).pathname}  ${dur}s  ${says} say`;
      } catch {}
      console.log(`  ${d}  ${info}`);
    }
  });

program
  .command("open [id]")
  .description("open latest (or named) session's review.html")
  .option("-d, --dir <dir>", "sessions base dir", join(process.cwd(), ".witness", "sessions"))
  .action((id, o) => {
    const base = o.dir;
    const all = existsSync(base) ? readdirSync(base).filter(x => existsSync(join(base, x, "session.md"))).reverse() : [];
    const target = id === "latest" || !id ? all[0] : all.find(d => d.startsWith(id));
    if (!target) { console.log("no matching session"); return; }
    const p = join(base, target, "review.html");
    console.log(p);
    try { execSync(`cmd /c start "" "${p}"`, { stdio: "ignore" }); } catch {}
  });

program.parse();
