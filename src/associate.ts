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
          "你是 QA 证据关联器。用户在产品上随口说出反馈（可能有语音识别错字），" +
          "每条 SAY 后面列出同一时间窗口内的候选页面事件（E编号 +相对毫秒 描述）。\n" +
          "任务：为每条 SAY 选出与之相关的事件编号（如：反馈提到按钮没反应→选该点击及其后果；" +
          "提到界面元素→选对应 mark/click/mut；纯感受可无事件），并给一个≤12字的问题标题。\n" +
          "输出格式，每行一条，不要任何解释：\nSAY#后面的数字|标题|事件编号,事件编号,…\n" +
          "示例：12|按钮无响应|45,46,47",
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
