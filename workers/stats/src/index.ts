export interface Env {
  WITNESS_EVENTS: AnalyticsEngineDataset;
}

// Allowed event names and their blob fields — strict allowlist so the
// endpoint can't be turned into a generic spam sink.
const EVENTS: Record<string, number> = {
  pv: 4,       // site pageview: path, locale, referrer-host, utm
  cli: 5,      // cli run: command, version, os, node, engine
  install: 2,  // future use
};

// blob1 allowlists — the endpoint is public, so reject fuzzed payloads.
const CLI_COMMANDS = new Set([
  "start", "transcribe", "correct", "recover", "associate",
  "segments", "keyframes", "config", "mcp", "list", "open",
]);
const PATH_RE = /^\/[a-zA-Z0-9\-_/.]{0,120}$/;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (url.pathname === "/health") return new Response("ok");

    if (req.method !== "POST" || url.pathname !== "/e") {
      return new Response("not found", { status: 404 });
    }

    let body: { e?: string; b?: string[]; d?: number };
    try {
      body = await req.json();
    } catch {
      return new Response("bad json", { status: 400, headers: CORS });
    }

    const spec = body.e && EVENTS[body.e];
    if (!spec) return new Response("bad event", { status: 400, headers: CORS });

    const blobs = (body.b ?? []).map(String).slice(0, spec);
    if (body.e === "cli" && !CLI_COMMANDS.has(blobs[0] ?? "")) {
      return new Response("bad event", { status: 400, headers: CORS });
    }
    if (body.e === "pv" && !PATH_RE.test(blobs[0] ?? "")) {
      return new Response("bad event", { status: 400, headers: CORS });
    }
    env.WITNESS_EVENTS.writeDataPoint({
      indexes: [body.e],
      blobs,
      doubles: [typeof body.d === "number" ? body.d : 1],
    });
    return new Response("ok", { headers: CORS });
  },
};
