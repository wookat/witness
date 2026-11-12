import OpenAI from "openai";
import type { Ev } from "./events.js";

export const hasCorrector = () => !!process.env.ZHIPU_API_KEY;

/**
 * Semantic polish for SAY events via free-tier LLM (zhipu glm-4-flash).
 * One batched call does two jobs:
 *   1. merge consecutive SR fragments that belong to the same utterance/topic
 *      (SR splits on pauses — a single thought often lands as several events)
 *   2. fix homophone/ASR errors, biased toward page vocabulary from marks/clicks
 * Output is `range|text` lines so the model only decides boundaries, never
 * invents content; merged says keep first segStart / last segEnd & t.
 */
export async function correctSays(events: Ev[], appUrl?: string): Promise<Ev[]> {
  const says = events.filter((e): e is Extract<Ev, { kind: "say" }> => e.kind === "say");
  if (says.length === 0 || !process.env.ZHIPU_API_KEY) return events;

  // vocab: text of elements the user marked/clicked — strong hints for ASR correction
  const vocab = [...new Set(
    events.flatMap(e => (e.kind === "mark" || e.kind === "click") && e.text ? [e.text] : [])
  )].slice(0, 30).join(" / ");

  const client = new OpenAI({
    apiKey: process.env.ZHIPU_API_KEY,
    baseURL: "https://open.bigmodel.cn/api/paas/v4",
  });

  const numbered = says.map((s, i) => `${i + 1}. ${s.text}`).join("\n");
  let res;
  try {
    res = await client.chat.completions.create({
      model: "glm-4-flash",
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "You are cleaning up speech-recognition (ASR) fragments of a user giving spoken feedback on a web product. ASR splits utterances on pauses and mishears similar-sounding words. Two steps: ① merge consecutive fragments that semantically belong to one utterance/issue into a full sentence (merge across large gaps only if the semantics continue; never force different issues together); ② correct obvious misrecognized words using the page vocabulary (common UI words: 按钮 button, 输入框 input, 页面 page, 点击 click, 弹窗 dialog, 滚动 scroll, 接口 API, 报错 error, 导航 nav, 菜单 menu, 入口 entry, 链接 link, 图标 icon, 文案 copy, 教程 tutorial, 反馈 feedback, 缩放 zoom, 侧边栏 sidebar). Keep the original language — never translate. When unsure, keep the fragment as-is. Do not add or remove content, do not reorder, do not explain. Output one line per sentence as `range|sentence` where range is input indices, e.g. `1-2|这个反馈按钮有问题` or `3|the submit button does nothing`.",
        },
        {
          role: "user",
          content:
            `${appUrl ? `Page: ${appUrl}\n` : ""}${vocab ? `Element text the user pointed at on the page: ${vocab}\n` : ""}\nASR fragments:\n${numbered}`,
        },
      ],
    });
  } catch {
    return events;
  }

  const lines = (res.choices[0]?.message?.content || "").trim().split("\n");
  const groups: { from: number; to: number; text: string }[] = [];
  for (const line of lines) {
    const m = line.match(/^\s*(\d+)\s*(?:[-~—]\s*(\d+))?\s*[|｜]\s*(.+?)\s*$/);
    if (m) groups.push({ from: Number(m[1]), to: Number(m[2] ?? m[1]), text: m[3] });
  }
  if (!groups.length) return events;

  // rebuild: merged say keeps first fragment position, extends to last fragment's end
  const out: Ev[] = [];
  let idx = 0, gi = 0;
  for (const e of events) {
    if (e.kind !== "say") { out.push(e); continue; }
    idx++;
    const g = groups[gi];
    if (!g || idx < g.from) { out.push(e); continue; }
    if (idx === g.from) {
      const last = says[Math.min(g.to, says.length) - 1];
      out.push({ ...e, text: g.text, segEnd: last.segEnd }); // keep first fragment's t/segStart as anchor
      gi++;
    }
    // fragments inside (from, to] are consumed by the merge
  }
  return out;
}
