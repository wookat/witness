import { readFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { existsSync } from "node:fs";
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
    case "click": case "mark": case "input": return { ...base, sel: a.sel, text: a.text };
    case "req": return { ...base, method: a.method, url: a.url };
    case "res": return { ...base, status: a.status, url: a.url, body: a.bodyPath };
    case "console": return { ...base, level: a.level, text: a.text };
    case "error": return { ...base, text: a.text ?? a.message };
    case "mut": return { ...base, label: a.label, attr: a.attr, prev: a.prev, val: a.val };
    case "nav": return { ...base, url: a.url };
    case "say": return { ...base, text: a.text, segStart: a.segStart, segEnd: a.segEnd };
    case "shot": return { ...base, path: a.path };
    case "scroll": return { ...base, y: a.y };
    default: return { ...base, ...a };
  }
};

export async function serveMcp(sessionDir?: string): Promise<void> {
  const dir = resolve(sessionDir ?? latestSession() ?? "");
  if (!existsSync(join(dir, "events.jsonl"))) {
    console.error(`no events.jsonl in ${dir}`);
    process.exit(1);
  }
  let session: LoadedSession | undefined;
  const load = async () => (session ??= await loadSession(dir));
  // keep every file access inside the session dir
  const safe = (p: string) => {
    const r = resolve(dir, p);
    if (r !== dir && !r.startsWith(dir + sep)) throw new Error("path escapes session dir");
    return r;
  };

  const server = new McpServer({ name: "witness", version: "0.2.0" });

  server.registerTool("session_overview",
    { description: "Session metadata: app URL, duration, counts of says/marks/errors/requests, file list" },
    async () => {
      const s = await load();
      const c = (k: string) => s.events.filter(e => e.kind === k).length;
      return text(JSON.stringify({
        dir: s.dir, url: s.meta.url, durationMs: s.meta.durationMs,
        says: c("say"), clicks: c("click"), marks: c("mark"), navs: c("nav"),
        requests: c("req"), consoleErrors: s.events.filter(e => e.kind === "console" && (e as any).level === "error").length,
        pageErrors: c("error"),
        files: ["session.md", "PROMPT.md", "events.jsonl", "transcript.json", "assoc.json", "shots/", "bodies/", "audio.webm", "review.html"],
      }, null, 1));
    });

  server.registerTool("list_says",
    { description: "All spoken feedback fragments with timestamps — the issue anchors" },
    async () => {
      const s = await load();
      return text(s.events.filter(e => e.kind === "say")
        .map(e => `[${Math.round((e as any).segStart / 1000)}s] ${(e as any).text}`).join("\n") || "(no says)");
    });

  server.registerTool("session_md",
    { description: "The rendered evidence timeline (SAY blocks + attached events)" },
    async () => { const s = await load(); return text(renderMarkdown(s.events, s.meta, s.transcript)); });

  server.registerTool("events_around",
    {
      description: "Raw events within a time window. t_ms = timeline ms, radius_ms default 3000, kinds = comma list (click,req,res,console,error,mut,mark,nav,say,scroll,shot)",
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
      return { content: [{ type: "image" as const, data: buf.toString("base64"), mimeType: "image/jpeg" }] };
    });

  server.registerTool("get_dom_state",
    {
      description: "DOM snapshot HTML nearest to a timeline ms (snapshots at nav/mark/every 30s). Returns path + html",
      inputSchema: { t_ms: z.number() },
    },
    async ({ t_ms }) => {
      const s = await load();
      const doms = s.events.filter(e => e.kind === "dom").sort((a, b) => a.t - b.t);
      if (!doms.length) return text("(no dom snapshots in this session)");
      const best = doms.filter(d => d.t <= t_ms).at(-1) ?? doms[0];
      const html = await readFile(safe((best as any).path), "utf8");
      return text(`# ${(best as any).path} @${best.t}ms\n${html.slice(0, 300_000)}`);
    });

  server.registerTool("get_body",
    {
      description: "Captured HTTP response body. path relative to session dir, e.g. bodies/r3.json",
      inputSchema: { path: z.string() },
    },
    async ({ path }) => text(await readFile(safe(path), "utf8")));

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
