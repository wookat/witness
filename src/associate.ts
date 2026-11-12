import OpenAI from "openai";
import type { Ev } from "./events.js";

// For each spoken block, an LLM picks which recorded events are relevant
// evidence. Advisory only — it re-ranks display order; raw events never change.

export interface Assoc { title?: string; hits: Set<Ev> }
export type AssocMap = Map<Ev, Assoc>;

export function hasAssociator(): boolean {
  return Boolean(process.env.ZHIPU_API_KEY);
}

const WIN_BEFORE = 2000;
const WIN_AFTER = 5000;
const SKIP = new Set(["say", "shot", "note", "_ui", "issue"]);

function brief(e: Ev): string {
  const a = e as any;
  switch (e.kind) {
    case "click": return `click ${a.sel ?? ""} "${a.text ?? ""}"`;
    case "input": return `input ${a.sel ?? ""} "${a.text ?? ""}"`;
    case "key": return `key ${a.key}`;
    case "nav": return `nav ${a.url}`;
    case "req": return `${a.method} ${a.url}`;
    case "res": return `res ${a.status} ${a.url}`;
    case "console": return `console.${a.level} ${String(a.text ?? "").slice(0, 120)}`;
    case "error": return `error ${String(a.text ?? "").slice(0, 120)}`;
    case "mut": return `mut ${a.label ?? a.sel ?? ""} ${a.attr ?? ""}: ${a.prev ?? ""}->${a.val ?? ""}`;
    case "mark": return `mark ${a.sel ?? ""} "${a.text ?? ""}"`;
    case "scroll": return `scroll y=${a.y}`;
    default: return e.kind;
  }
}

export async function associateSays(events: Ev[]): Promise<AssocMap> {
  const key = process.env.ZHIPU_API_KEY;
  const out: AssocMap = new Map();
  if (!key) return out;

  const says = events.filter(e => e.kind === "say");
  if (!says.length) return out;

  // one row per event so the model cites indices, not descriptions
  const idx = new Map(events.map((e, i) => [e, i]));
  const sections: string[] = [];
  for (const s of says) {
    const cands = events
      .filter(e => e !== s && !SKIP.has(e.kind) && e.t >= s.t - WIN_BEFORE && e.t <= s.t + WIN_AFTER)
      .slice(0, 100);
    sections.push(
      `SAY#${idx.get(s)} t=${s.t}ms: "${(s as any).text}"\n` +
      cands.map(e => `  E${idx.get(e)} +${e.t - s.t}ms ${brief(e)}`).join("\n")
    );
  }

  const oa = new OpenAI({ apiKey: key, baseURL: "https://open.bigmodel.cn/api/paas/v4/" });
  const res = await oa.chat.completions.create({
    model: "glm-4-flash",
    temperature: 0.1,
    messages: [
      {
        role: "system",
        content:
          "You are a QA evidence linker. A user speaks feedback while using a product (ASR may contain recognition errors). " +
          "After each SAY line, candidate page events from the same time window are listed (E-number, +ms offset, description).\n" +
          "Task: for each SAY, pick the related event numbers (e.g. user says a button does nothing → pick that click and its aftermath; " +
          "mentions a UI element → pick the matching mark/click/mut; a pure feeling may have no events). Also give a concise issue title (≤12 words, same language as the SAY).\n" +
          "Output format, one per line, no explanations:\n<number after SAY#>|<title>|<event numbers, comma-separated>\n" +
          "Example: 12|submit button unresponsive|45,46,47",
      },
      { role: "user", content: sections.join("\n\n") },
    ],
  });

  const text = res.choices?.[0]?.message?.content ?? "";
  for (const ln of text.split(/\r?\n/)) {
    const m = ln.match(/(\d+)\s*\|\s*([^|]+)\s*\|(.*)$/);
    if (!m) continue;
    const say = events[+m[1]];
    if (say?.kind !== "say") continue;
    const hits = new Set(
      (m[3].match(/\d+/g) ?? []).map(n => events[+n]).filter(e => e && e.kind !== "say")
    );
    out.set(say, { title: m[2].trim() || undefined, hits });
  }
  return out;
}
