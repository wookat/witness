import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright";
import type { EventStore } from "./events.js";

const BODY_CAP = 64 * 1024; // 64KB per body
const POSTDATA_CAP = 4 * 1024;

// redact credential-like fields in post bodies & query params
const SENSITIVE = /(passw?o?r?d|pwd|secret|token|csrf|otp|credential|api[-_]?key|auth)/i;

export function maskPostData(raw?: string): string | undefined {
  if (!raw) return undefined;
  let s = raw.slice(0, POSTDATA_CAP);
  // url-encoded: password=abc → password=***
  s = s.replace(new RegExp(`((?:^|&)\\s*[^&=]*${SENSITIVE.source}[^&=]*)=[^&]*`, "gi"), "$1=***");
  // json: "password":"abc" → "password":"***"
  s = s.replace(new RegExp(`("[^"]*${SENSITIVE.source}[^"]*"\\s*:\\s*)"[^"]*"`, "gi"), '$1"***"');
  return s;
}

export function redactUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    let changed = false;
    for (const key of [...u.searchParams.keys()]) {
      if (SENSITIVE.test(key)) {
        u.searchParams.set(key, "***");
        changed = true;
      }
    }
    return changed ? u.toString() : rawUrl;
  } catch {
    return rawUrl;
  }
}

export function wireNetwork(page: Page, store: EventStore, isPaused: () => boolean = () => false) {
  const pending = new Map<number, number>(); // id → start t

  page.on("request", (r) => {
    if (isPaused()) return;
    const id = ++store.reqSeq;
    pending.set(id, Date.now());
    store.push({
      kind: "req",
      id,
      url: redactUrl(r.url()),
      method: r.method(),
      resType: r.resourceType(),
      postData: maskPostData(r.postData() ?? undefined),
    });
    // stash playwright ref for response correlation
    (r as any).__witId = id;
  });

  page.on("response", async (r) => {
    const id = (r.request() as any).__witId;
    const t0 = id != null ? pending.get(id) : undefined;
    if (id != null) pending.delete(id);
    if (isPaused()) return;
    const finalId = id ?? ++store.reqSeq;
    const timing = t0 ? Date.now() - t0 : undefined;
    let bodyPath: string | undefined;
    let bodyTrunc = false;
    try {
      const ct = (r.headers()["content-type"] || "").toLowerCase();
      // WIT_NO_BODIES=1 opts out of response-body capture entirely (sensitive apps)
      if (!process.env.WIT_NO_BODIES &&
          (ct.includes("json") || ct.includes("text") || ct.includes("javascript") || ct.includes("xml"))) {
        const buf = await r.body();
        if (isPaused()) return;
        const name = `req_${String(finalId).padStart(4, "0")}.${ct.includes("json") ? "json" : "txt"}`;
        const rel = `bodies/${name}`;
        if (buf.length <= BODY_CAP) {
          await writeFile(join(store.dir, rel), buf);
        } else {
          // keep the head — a truncated body beats no body for debugging
          await writeFile(join(store.dir, rel), buf.subarray(0, BODY_CAP));
          bodyTrunc = true;
        }
        bodyPath = rel;
      }
    } catch { /* redirect/no-body — skip */ }
    store.push({
      kind: "res",
      id: finalId,
      url: redactUrl(r.url()),
      status: r.status(),
      timing,
      bodyPath,
      bodyTrunc: bodyTrunc || undefined,
    });
  });

  page.on("requestfailed", (r) => {
    const id = (r as any).__witId;
    const t0 = id != null ? pending.get(id) : undefined;
    if (id != null) pending.delete(id);
    if (isPaused()) return;
    store.push({
      kind: "res",
      id: id ?? ++store.reqSeq,
      url: redactUrl(r.url()),
      status: 0,
      timing: t0 ? Date.now() - t0 : undefined,
    });
  });
}
