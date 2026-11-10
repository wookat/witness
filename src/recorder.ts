import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, createWriteStream } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { chromium, type BrowserContext, type Page } from "playwright";
import { EventStore } from "./events.js";
import { PAGE_SCRIPT } from "./page-script.js";
import { AudioSink } from "./audio.js";
import { Shots } from "./shots.js";
import { wireNetwork } from "./network.js";
import { transcribe, hasTranscriber, type Transcript } from "./transcribe.js";
import { align } from "./align.js";
import { correctSays, hasCorrector } from "./correct.js";
import { associateSays } from "./associate.js";
import { writeSessionFiles, copyToClipboard } from "./session.js";
import { rrwebUmd } from "./rr.js";

export interface RecOptions {
  url: string;
  outBase?: string;          // default: <cwd>/.witness/sessions
  transcribe?: boolean;      // default true if OPENAI_API_KEY
  shotInterval?: number;     // default 2000
  width?: number;
  height?: number;
  duration?: number;         // auto-stop after N seconds (testing / quick captures)
  lang?: string;             // speech recognition language, default zh-CN
  correct?: boolean;         // opt-in: LLM-polish SAY text (default off — keep verbatim)
  associate?: boolean;       // opt-in: LLM-pick relevant evidence per SAY (needs ZHIPU_API_KEY)
  rr?: boolean;              // default true: rrweb full-DOM replay capture → rrweb.jsonl + review.html player
}

const slug = (s: string) => s.replace(/^https?:\/\//, "").replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
const stamp = () => new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);

async function ensureChromium() {
  // Prefer system Edge/Chrome — zero download, user's real browser.
  // Fall back to playwright's bundled chromium only if none found.
  for (const ch of ["msedge", "chrome"] as const) {
    try {
      const b = await chromium.launch({ channel: ch, headless: true });
      await b.close();
      return ch;
    } catch { /* not installed */ }
  }
  try {
    const p = chromium.executablePath();
    if (existsSync(p)) return undefined;
  } catch { /* fallthrough */ }
  console.log("no system Edge/Chrome found — installing bundled chromium …");
  execSync("npx playwright install chromium", { stdio: "inherit" });
  return undefined;
}

export async function record(opts: RecOptions) {
  const channel = await ensureChromium();

  const outBase = opts.outBase ?? join(process.cwd(), ".witness", "sessions");
  const dir = join(outBase, `${stamp()}_${slug(opts.url) || "page"}`);
  mkdirSync(dir, { recursive: true });

  // gitignore .witness in cwd (best effort)
  try {
    const gi = join(process.cwd(), ".gitignore");
    if (existsSync(gi) && !readFileSync(gi, "utf8").split("\n").some(l => l.trim() === ".witness/")) {
      appendFileSync(gi, "\n# witness sessions\n.witness/\n");
    }
  } catch {}

  const store = new EventStore(dir);
  const audio = new AudioSink(dir);
  const shots = new Shots(dir, store);

  let paused = false;                 // node-side mirror of page pause (via _ui events)
  const rrEnabled = opts.rr !== false && !!rrwebUmd();
  const rrStream = rrEnabled ? createWriteStream(join(dir, "rrweb.jsonl")) : null;
  let rrBytes = 0, rrFull = false;
  mkdirSync(join(dir, "dom"), { recursive: true });
  let domSeq = 0;
  const snapDom = async (page: Page, tag = "") => {
    if (paused || stopping) return;
    try {
      const html = await page.evaluate(() => document.documentElement.outerHTML);
      const rel = `dom/snap-${String(++domSeq).padStart(3, "0")}${tag ? "-" + tag : ""}.html`;
      writeFileSync(join(dir, rel), html.slice(0, 1_500_000));
      store.push({ kind: "dom", path: rel });
    } catch {}
  };

  console.log(`\x1b[36m◉ witness\x1b[0m  ${opts.url}`);
  console.log(`  session → ${dir}`);
  console.log(`  controls: toolbar ■ / Alt+Shift+R / Ctrl+C here — M or Ctrl+Click to mark\n`);

  const browser = await chromium.launch({
    channel,
    headless: false,
    args: [
      "--use-fake-ui-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
      `--window-size=${opts.width ?? 1560},${(opts.height ?? 960) + 120}`,
    ],
  });

  const ctx: BrowserContext = await browser.newContext({
    viewport: { width: opts.width ?? 1560, height: opts.height ?? 960 },
    permissions: ["microphone"],
    ignoreHTTPSErrors: true,
  });

  let stopping = false;
  let transcript: Transcript | undefined;
  const stopFns: (() => void)[] = [];
  const pages = new Set<Page>();
  let lastPage: Page | undefined;

  await ctx.exposeBinding("__witEmit", async (src, e: any) => {
    const page = src.page ?? lastPage; // the page that emitted — never the wrong tab
    if (e?.kind === "_ui" && e.action === "paused") paused = true;
    if (e?.kind === "_ui" && e.action === "resumed") paused = false;
    if (e?.kind === "mark" && page) {
      const clip = e.region ? { x: e.region.x, y: e.region.y, width: e.region.w, height: e.region.h } : undefined;
      const p = await shots.at(page, "mark", clip).catch(() => null);
      if (p) e.shot = p;
      void snapDom(page, "mark");
    }
    // speaking = an anchor: bind the current frame to the utterance (debounced)
    if (e?.kind === "say" && page && !paused) {
      if (Date.now() - lastSayShot >= 2500) { lastSayShot = Date.now(); void shots.at(page, "say").catch(() => {}); }
    }
    store.push(e);
    if (e?.kind === "_ui" && e.action === "stop") void stop("ui");
  });
  await ctx.exposeBinding("__witAudio", (_src, b64: string) => audio.chunk(b64));
  let lastSayShot = 0;
  const rrSrc = rrEnabled ? rrwebUmd() : null;
  if (rrSrc) {
    await ctx.exposeBinding("__witRR", (_src, e: any) => {
      if (paused || rrFull) return;
      const l = JSON.stringify(e) + "\n";
      rrBytes += l.length;
      if (rrBytes > 30_000_000) { rrFull = true; console.log("  rrweb capture >30MB — replay truncated"); return; }
      rrStream?.write(l);
    });
    await ctx.addInitScript(rrSrc);
    await ctx.addInitScript(`location.href !== "about:blank" && window === window.top && window.rrweb && rrweb.record({
      emit: e => { try { window.__witRR && __witRR(e); } catch (_) {} },
      sampling: { mousemove: false, scroll: 150 },
      maskInputOptions: { password: true },
      inlineStylesheet: true, recordCanvas: false,
      slimDOMOptions: { script: true, comment: true },
    });`);
  }
  await ctx.addInitScript(PAGE_SCRIPT(opts.lang ?? "zh-CN"));

  function wirePage(page: Page) {
    if (pages.has(page)) return;
    pages.add(page);
    lastPage = page;
    wireNetwork(page, store);
    page.on("console", m => {
      const loc = m.location();
      store.push({ kind: "console", level: m.type(), text: m.text().slice(0, 1500), stack: loc ? `${loc.url}:${loc.lineNumber}:${loc.columnNumber}` : undefined });
    });
    page.on("pageerror", e => store.push({ kind: "error", message: String(e.message || e).slice(0, 1500), stack: e.stack?.slice(0, 1500) }));
    let lastNav = "";
    page.on("framenavigated", f => {
      if (f === page.mainFrame()) {
        const url = page.url();
        store.push({ kind: "nav", url, title: undefined });
        if (url === lastNav) return;
        lastNav = url;
        setTimeout(() => shots.at(page, "nav").catch(() => {}), 800);
        setTimeout(() => void snapDom(page, "nav"), 1500);
      }
    });
    page.on("close", () => {
      pages.delete(page);
      if (pages.size === 0) void stop("page-closed");
    });
    void shots.arm(page);
    stopFns.push(shots.every(page, opts.shotInterval ?? 10000, () => paused));
    stopFns.push(() => void shots.disarm());
  }

  ctx.on("page", wirePage);
  const domIv = setInterval(() => { if (lastPage) void snapDom(lastPage); }, 30000);
  stopFns.push(() => clearInterval(domIv));

  // crash-safety: events.jsonl already streams to disk; Ctrl+C still runs finalize for md/audio
  const onSigint = () => void stop("sigint");
  process.on("SIGINT", onSigint);
  process.on("SIGHUP", onSigint);

  async function stop(why: string) {
    if (stopping) return;
    stopping = true;
    console.log(`\n\x1b[36m◉\x1b[0m stopping (${why}) — finalizing…`);
    for (const p of pages) await p.evaluate(() => (window as any).__witCmd?.("stop")).catch(() => {});
    await new Promise(r => setTimeout(r, 900)); // let last audio chunk flush
    stopFns.forEach(f => f());
    process.off("SIGINT", onSigint);
    process.off("SIGHUP", onSigint);
    await browser.close().catch(() => {});
    await audio.close();
    if (rrStream) await new Promise<void>(r => rrStream.end(() => r()));
    await store.close();

    if (opts.transcribe !== false && audio.hasAudio && hasTranscriber()) {
      try {
        console.log("  transcribing (whisper)…");
        transcript = await transcribe(audio.path);
        console.log(`  transcript: ${transcript.segments.length} segments`);
      } catch (e) {
        console.log(`  transcription failed: ${(e as Error).message} — continuing without it`);
      }
    } else if (audio.hasAudio && !hasTranscriber()) {
      console.log("  (no GROQ_API_KEY/OPENAI_API_KEY — audio saved, transcript skipped)");
    }

    let events = align(store.events, transcript?.segments ?? []);
    if (opts.correct && hasCorrector()) {
      try { events = await correctSays(events, opts.url); } catch (e) { console.log(`  say-correction failed: ${(e as Error).message}`); }
    }
    let assoc;
    if (opts.associate) {
      try {
        assoc = await associateSays(events);
        if (assoc.size) console.log(`  associated evidence for ${assoc.size} say block(s)`);
      } catch (e) { console.log(`  association failed: ${(e as Error).message}`); }
    }
    const meta = {
      url: opts.url,
      startedAt: store.startTime,
      durationMs: store.now(),
      viewport: { width: opts.width ?? 1560, height: opts.height ?? 960 },
    };
    await writeSessionFiles(dir, events, meta, transcript, assoc);

    // transcript.json for the in-browser SR path too (whisper path writes its own)
    if (!transcript) {
      const srSays = events.filter((e): e is Extract<typeof e, { kind: "say" }> => e.kind === "say");
      if (srSays.length) {
        writeFileSync(join(dir, "transcript.json"), JSON.stringify({
          engine: "edge-speech-recognition",
          segments: srSays.map(s => ({ start: s.segStart / 1000, end: s.segEnd / 1000, text: s.text })),
          text: srSays.map(s => s.text).join(" "),
        }, null, 1));
      }
    }
    writeFileSync(join(dir, "session.json"), JSON.stringify({ ...meta, events: events.length, audio: audio.hasAudio }, null, 1));

    const clip = `witness session: ${dir}\n读 ${join(dir, "session.md")} 修复其中的问题`;
    copyToClipboard(clip);
    console.log(`\n\x1b[32m✔\x1b[0m session → ${dir}`);
    console.log(`  main file: ${join(dir, "session.md")}`);
    console.log(`  review:    ${join(dir, "review.html")}`);
    console.log(`  (paths copied to clipboard)`);
  }

  if (opts.duration) setTimeout(() => void stop("duration"), opts.duration * 1000);

  // open first page (ctx 'page' listener wires it)
  const first = await ctx.newPage();
  await first.goto(opts.url, { waitUntil: "domcontentloaded" }).catch(e => {
    console.log(`  goto failed: ${e.message}`);
  });

  // keep process alive until stop
  await new Promise<void>(r => {
    const iv = setInterval(() => { if (stopping) { clearInterval(iv); r(); } }, 300);
  });
}
