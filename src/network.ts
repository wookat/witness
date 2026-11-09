import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright";
import type { EventStore } from "./events.js";

const BODY_CAP = 64 * 1024; // 64KB per body
const POSTDATA_CAP = 4 * 1024;

// redact credential-like fields in post bodies (url-encoded & json)
const SENSITIVE = /(passw?o?r?d|pwd|secret|token|csrf|otp|credential)/i;
function maskPostData(raw?: string): string | undefined {
  if (!raw) return undefined;
  let s = raw.slice(0, POSTDATA_CAP);
  // url-encoded: password=abc → password=***
  s = s.replace(new RegExp(`((?:^|&)\\s*[^&=]*${SENSITIVE.source}[^&=]*)=[^&]*`, "gi"), "$1=***");
  // json: "password":"abc" → "password":"***"
  s = s.replace(new RegExp(`("[^"]*${SENSITIVE.source}[^"]*"\\s*:\\s*)"[^"]*"`, "gi"), '$1"***"');
  return s;
}

export function wireNetwork(page: Page, store: EventStore) {
  const pending = new Map<number, number>(); // id → start t

  page.on("request", (r) => {
    const id = ++store.reqSeq;
    pending.set(id, Date.now());
    store.push({
      kind: "req",
      id,
      url: r.url(),
      method: r.method(),
      resType: r.resourceType(),
      postData: maskPostData(r.postData() ?? undefined),
    });
    // stash playwright ref for response correlation
    (r as any).__witId = id;
  });

  page.on("response", async (r) => {
    const id = (r.request() as any).__witId ?? ++store.reqSeq;
    const t0 = pending.get(id);
    pending.delete(id);
    const timing = t0 ? Date.now() - t0 : undefined;
    let bodyPath: string | undefined;
    try {
      const ct = (r.headers()["content-type"] || "").toLowerCase();
      // WIT_NO_BODIES=1 opts out of response-body capture entirely (sensitive apps)
      if (!process.env.WIT_NO_BODIES &&
          (ct.includes("json") || ct.includes("text") || ct.includes("javascript") || ct.includes("xml"))) {
        const buf = await r.body();
        if (buf.length <= BODY_CAP) {
          const name = `req_${String(id).padStart(4, "0")}.${ct.includes("json") ? "json" : "txt"}`;
          bodyPath = `bodies/${name}`;
          await writeFile(join(store.dir, bodyPath), buf);
        }
      }
    } catch { /* redirect/no-body — skip */ }
    store.push({ kind: "res", id, url: r.url(), status: r.status(), timing, bodyPath });
  });

  page.on("requestfailed", (r) => {
    const id = (r as any).__witId ?? ++store.reqSeq;
    const t0 = pending.get(id);
    pending.delete(id);
    store.push({ kind: "res", id, url: r.url(), status: 0, timing: t0 ? Date.now() - t0 : undefined });
  });
}
