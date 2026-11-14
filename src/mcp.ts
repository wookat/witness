import { readFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { Ev } from "./events.js";
import { latestSession, loadSession, type LoadedSession } from "./store-read.js";
import { renderMarkdown } from "./session.js";

// Pull-model access: instead of handing an agent a static package, `wit mcp`
// serves the session over stdio MCP so the agent asks for exactly the evidence
// it needs — events around a timestamp, errors, screenshots, response bodies.

const text = (t: string) => ({ content: [{ type: "text" as const, text: t }] });
const brief = (e: Ev) => {
  const a = e as any;
  const base = { t: e.t, kind: e.kind };
  switch (e.kind) {
    case "click": case "mark": return { ...base, sel: a.sel, text: a.text };
    case "input": return { ...base, sel: a.sel, masked: a.masked, len: a.len, value: a.value };
    case "req": return { ...base, method: a.method, url: a.url };
    case "res": return { ...base, status: a.status, url: a.url, body: a.bodyPath, bodyTrunc: a.bodyTrunc };
    case "console": return { ...base, level: a.level, text: a.text };
    case "error": return { ...base, text: a.text ?? a.message };
    case "mut": return { ...base, label: a.label, attr: a.attr, prev: a.prev, val: a.val };
    case "nav": return { ...base, url: a.url };
    case "say": return { ...base, text: a.text, segStart: a.segStart, segEnd: a.segEnd };
    case "shot": return { ...base, path: a.path };
    case "ws": return { ...base, url: a.url, dir: a.dir, data: a.data };
    case "scroll": return { ...base, y: a.y };
    default: return { ...base, ...a };
  }
};

export async function serveMcp(sessionDir?: string): Promise<void> {
  const dir = resolve(sessionDir ?? latestSession() ?? "");
  const hasSession = existsSync(join(dir, "events.jsonl"));
  if (!hasSession) console.error(`no events.jsonl in ${dir} — serving anyway; tools will report no session`);
  let session: LoadedSession | undefined;
  const load = async () => {
    if (!hasSession) throw new Error(`no recorded session found (looked in ${dir})`);
    return (session ??= await loadSession(dir));
  };
  // keep every file access inside the session dir
  const safe = (p: string) => {
    const r = resolve(dir, p);
    if (r !== dir && !r.startsWith(dir + sep)) throw new Error("path escapes session dir");
    return r;
  };

  const { version: pkgVersion } = createRequire(import.meta.url)("../package.json") as { version: string };
  const server = new McpServer({ name: "witness", version: pkgVersion });

  server.registerTool("session_overview",
    { description: "Session metadata: app URL, duration, lang, audio captured, ASR engine, counts of says/marks/errors/requests/ws frames, file list" },
    async () => {
      const s = await load();
      const c = (k: string) => s.events.filter(e => e.kind === k).length;
      const sj = await readFile(join(s.dir, "session.json"), "utf8").then(JSON.parse).catch(() => ({}));
      return text(JSON.stringify({
        dir: s.dir, url: s.meta.url, durationMs: s.meta.durationMs, lang: s.meta.lang,
        audioCaptured: s.audio ?? sj.audio, asrEngine: sj.asr,
        transcriptModel: s.transcript?.model,
        says: c("say"), clicks: c("click"), marks: c("mark"), inputs: c("input"), navs: c("nav"),
        requests: c("req"), wsFrames: c("ws"),
        consoleErrors: s.events.filter(e => e.kind === "console" && (e as any).level === "error").length,
        pageErrors: c("error"),
        files: ["SEGMENTS.md", "segments/", "session.md", "PROMPT.md", "events.jsonl", "transcript.json", "assoc.json", "shots/", "bodies/", "audio.webm", "review.html"],
      }, null, 1));
    });

  server.registerTool("list_segments",
    { description: "Speech anchor index — every spoken segment with suspects, dead clicks and shot/dom refs. Segments are mechanically cut, NOT confirmed issues: merge adjacent ones or split as the semantics require. READ THIS FIRST." },
    async () => {
      const p = join(dir, "SEGMENTS.md");
      if (existsSync(p)) return text(await readFile(p, "utf8"));
      const s = await load();
      const { extractSegments, renderSegmentsIndex } = await import("./segments.js");
      const { align } = await import("./align.js");
      return text(renderSegmentsIndex(extractSegments(align(s.events, s.transcript?.segments ?? [])), s.meta));
    });

  server.registerTool("segment_detail",
    {
      description: "One speech segment's evidence bundle: verbatim speech, suspect elements, dead clicks, errors, and the exact shots/dom snapshots to inspect. n = segment number (1-based)",
      inputSchema: { n: z.number() },
    },
    async ({ n }) => {
      const p = join(dir, "segments", `${String(n).padStart(2, "0")}.md`);
      if (existsSync(p)) return text(await readFile(p, "utf8"));
      const s = await load();
      const { extractSegments, renderSegmentFile } = await import("./segments.js");
      const { align } = await import("./align.js");
      const i = extractSegments(align(s.events, s.transcript?.segments ?? []))[n - 1];
      return i ? text(renderSegmentFile(i, s.meta)) : text(`(segment #${n} not found)`);
    });

  server.registerTool("list_says",
    { description: "All spoken feedback fragments with timestamps — the issue anchors" },
    async () => {
      const s = await load();
      return text(s.events.filter(e => e.kind === "say")
        .map(e => `[${Math.round((e as any).segStart / 1000)}s] ${(e as any).text}`).join("\n") || "(no says)");
    });

  server.registerTool("session_md",
    {
      description: "The rendered evidence timeline (SAY blocks + attached events). Capped at ~80k chars — for long sessions prefer list_segments/segment_detail first, then events_around for raw precision",
      inputSchema: { offset: z.number().optional() },
    },
    async ({ offset }) => {
      const s = await load();
      const md = renderMarkdown(s.events, s.meta, s.transcript);
      const CAP = 80_000;
      if (md.length <= CAP && !offset) return text(md);
      const from = offset ?? 0;
      const slice = md.slice(from, from + CAP);
      const more = from + CAP < md.length;
      return text(slice + (more ? `\n\n…[truncated at char ${from + CAP}/${md.length} — call again with offset=${from + CAP}, or use list_segments/events_around for targeted reads]` : ""));
    });

  server.registerTool("events_around",
    {
      description: "Raw events within a time window. t_ms = timeline ms, radius_ms default 3000, kinds = comma list (click,input,req,res,ws,console,error,mut,mark,nav,say,scroll,shot,note,issue,dom,key)",
      inputSchema: { t_ms: z.number(), radius_ms: z.number().optional(), kinds: z.string().optional() },
    },
    async ({ t_ms, radius_ms, kinds }) => {
      const s = await load();
      const r = radius_ms ?? 3000;
      const ks = kinds ? new Set(kinds.split(",").map(k => k.trim())) : undefined;
      const out = s.events.filter(e => Math.abs(e.t - t_ms) <= r && (!ks || ks.has(e.kind))).map(brief);
      return text(JSON.stringify(out, null, 1));
    });

  server.registerTool("get_errors",
    { description: "All console errors, page errors and HTTP responses >= 400" },
    async () => {
      const s = await load();
      const out = s.events.filter(e =>
        e.kind === "error" ||
        (e.kind === "console" && (e as any).level === "error") ||
        (e.kind === "res" && ((e as any).status === 0 || (e as any).status >= 400))).map(brief);
      return text(JSON.stringify(out, null, 1));
    });

  server.registerTool("get_shot",
    {
      description: "A screenshot image. path is relative to the session dir, e.g. shots/011-mark.jpg",
      inputSchema: { path: z.string() },
    },
    async ({ path }) => {
      const buf = await readFile(safe(path));
      const mime = /\.webp$/i.test(path) ? "image/webp" : /\.png$/i.test(path) ? "image/png" : "image/jpeg";
      return { content: [{ type: "image" as const, data: buf.toString("base64"), mimeType: mime }] };
    });

  server.registerTool("get_dom_state",
    {
      description: "DOM snapshot HTML nearest to a timeline ms (snapshots at nav/mark/every 30s). Returns path + html, capped — pass max_chars for more. For visuals prefer get_shot/keyframes",
      inputSchema: { t_ms: z.number(), max_chars: z.number().optional() },
    },
    async ({ t_ms, max_chars }) => {
      const s = await load();
      const doms = s.events.filter(e => e.kind === "dom").sort((a, b) => a.t - b.t);
      if (!doms.length) return text("(no dom snapshots in this session)");
      const best = doms.filter(d => d.t <= t_ms).at(-1) ?? doms[0];
      const html = await readFile(safe((best as any).path), "utf8");
      const cap = Math.min(max_chars ?? 120_000, 400_000);
      const trunc = html.length > cap ? `\n…[html truncated at ${cap}/${html.length} chars — narrow with CSS selectors via get_shot or ask for a specific region]` : "";
      return text(`# ${(best as any).path} @${best.t}ms\n${html.slice(0, cap)}${trunc}`);
    });

  server.registerTool("get_body",
    {
      description: "Captured HTTP response body. path relative to session dir, e.g. bodies/r3.json",
      inputSchema: { path: z.string() },
    },
    async ({ path }) => text(await readFile(safe(path), "utf8")));

  server.registerTool("get_transcript",
    {
      description: "Speech recognition output: full transcript text + segments with timestamps (engine/model/lang recorded). Returns say events if no transcript.json exists",
    },
    async () => {
      const s = await load();
      if (s.transcript) {
        const { words, ...rest } = s.transcript as any;
        return text(JSON.stringify({ ...rest, wordCount: words?.length ?? 0, segments: (rest.segments ?? []).slice(0, 500) }, null, 1));
      }
      const says = s.events.filter(e => e.kind === "say").map(e => ({ t: (e as any).segStart, text: (e as any).text }));
      return text(says.length ? JSON.stringify({ engine: "live-say-events", segments: says }, null, 1) : "(no transcript and no say events in this session)");
    });

  server.registerTool("search_events",
    {
      description: "Full-text search across event fields (say text, console, errors, urls, selectors, input values, ws payloads). Case-insensitive substring. Returns matching events as JSON, oldest first",
      inputSchema: {
        query: z.string(),
        kinds: z.string().optional(),
        limit: z.number().optional(),
      },
    },
    async ({ query, kinds, limit }) => {
      const s = await load();
      const q = query.toLowerCase();
      const ks = kinds ? new Set(kinds.split(",").map(k => k.trim())) : undefined;
      const hay = (e: Ev): string => {
        const a = e as any;
        return [a.text, a.message, a.url, a.sel, a.summary, a.data, a.value, a.postData, a.outerHTML]
          .filter(Boolean).join(" ").toLowerCase();
      };
      const out = s.events
        .filter(e => (!ks || ks.has(e.kind)) && hay(e).includes(q))
        .slice(0, Math.min(limit ?? 50, 200))
        .map(brief);
      return text(out.length ? JSON.stringify(out, null, 1) : `(no events matching "${query}")`);
    });

  server.registerTool("get_asr",
    { description: "Current live speech-recognition engine for future recordings (auto|doubao-web|doubao-ime|sr|off)" },
    async () => {
      const { readConfig } = await import("./config.js");
      return text(JSON.stringify({ asr: readConfig().asr ?? "auto", engines: ["auto", "doubao-web", "doubao-ime", "sr", "off"] }));
    });

  server.registerTool("set_asr",
    {
      description: "Switch the live ASR engine for FUTURE recordings (persists to .witness/config.json). doubao-web = best quality streaming; doubao-ime = sentence timestamps; sr = browser builtin; off = none.",
      inputSchema: { engine: z.enum(["auto", "doubao-web", "doubao-ime", "sr", "off"]) },
    },
    async ({ engine }) => {
      const { setConfig } = await import("./config.js");
      setConfig("asr", engine);
      return text(`asr = ${engine} (persisted — applies to the next wit start)`);
    });

  await server.connect(new StdioServerTransport());
}
