import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";

// locate rrweb's UMD build in node_modules (works under any exports map)
let cache: string | null | undefined;
export function rrwebUmd(): string | null {
  if (cache !== undefined) return cache;
  try {
    const req = createRequire(import.meta.url);
    const entry = req.resolve("rrweb");
    for (const up of ["", "..", "../.."]) {
      for (const f of ["dist/rrweb.umd.min.cjs", "dist/rrweb.min.js", "rrweb.umd.min.cjs"]) {
        const p = join(dirname(entry), up, f);
        if (existsSync(p)) { cache = readFileSync(p, "utf8"); return cache; }
      }
    }
  } catch {}
  cache = null;
  return null;
}
