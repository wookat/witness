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
            "你在整理语音转写（ASR）碎片，来源是用户口述网页产品体验反馈。ASR 会按停顿把一句话切成多条，也常把发音相近的词听错。两步：① 把语义上属于同一句话/同一件事的连续碎片合并成完整一句（间隔大也可合，只要语义连贯；不同问题不要硬合）；② 按页面词汇纠正明显错字（常见 UI 词：按钮、输入框、页面、点击、弹窗、滚动、接口、报错、导航、菜单、入口、链接、图标、文案、教程、反馈、缩放、侧边栏），拿不准保留原样。禁止增删内容、禁止改变先后顺序、禁止解释。每行输出格式 `范围|句子`，范围是输入序号，如 `1-2|这个反馈按钮有问题` 或 `3|你要么实现它`。",
        },
        {
          role: "user",
          content:
            `${appUrl ? `页面：${appUrl}\n` : ""}${vocab ? `页面上用户指点过的元素文字：${vocab}\n` : ""}\nASR碎片：\n${numbered}`,
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
