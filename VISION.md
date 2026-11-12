# Witness — 产品愿景与路线

> **语音锚点的因果证据记录仪。**
> 你负责发现不对，它负责证明不对 —— 人和 agent 之间的翻译官。

（本文档由原始讨论整理，防止上下文丢失。最早设想见 2026-11 初的产品讨论。）

## 一、要解决的真问题

AI 编程 agent（Devin/Cursor/Claude Code）能写代码、能看截图，但**没有人的眼睛和判断**——
视觉错位、动画 jank、"这个按钮点了没反应"、"这里不对劲"，只有人在用时才感知得到。

所以必须人来发现、来指出。但指出的成本太高：截图、框选、写说明文字、组织 prompt。
这个工具的目标：**把"指出一个问题"的成本降到接近零**——你正常用产品、随口说，其余全部自动。

## 二、理想版本的形态（原始设想）

按下"开始"后，三条记录线**同时开、全自动、零手动**：

### 第一条线：你的话
全程录音 + 转写。边体验边随口说——"这个按钮点了没反应"、"这块文案要改"。
**一段话里可以说很多个问题**，不打断、不要求逐条区分。

### 第二条线：你的操作 + 它引发的因果爆发链
每个点击/输入/滚动/跳转。点按钮那一下，记下的不只是"点了"，而是那一刻的因果链：
- 触发了哪个请求、请求 body、返回了什么（成功/4xx/500）
- console 冒出了什么报错
- 按钮或页面哪些状态跟着变了（禁用、loading、计数、样式）
- **"点了没反应"也是有效证据**：点击 → 无请求、无报错、无状态变化——什么都没发生本身就是证据

### 第三条线：页面自身的变化
DOM/视觉状态随时间的连续变化，不只是静态截图。

### 产出：按时间轴排列的证据链文档

```
[00:12] 你说："这个提交按钮点了没反应"
  └─ 证据点：点击 button#submit · 截图 · 无任何请求发出 ←"没反应"被证实
            · TypeError: validate is not a function · 状态无变化

[00:34] 你说："这个接口返回不对"
  └─ 证据点：点击 a[href="/orders"] · 截图 · GET /api/orders → 200 但 items:[]
            · 无报错 · 列表区从 loading 变为空态
```

### 理想版与普通录屏的本质区别：智能关联

用户原话：**"不是所有东西都一成不变，而是根据我语音描述里需要的内容，自动关联最相关的信息。"**

- 证据点**不是均匀铺满时间轴的**：说"按钮没反应"就挂"无请求+报错"；说"文案要改"就只挂元素+截图，不塞无关请求
- 关联依据是**语音语义 + 那一秒的因果事实**，不是"时间相近就全塞"
- 有些段落没有证据点（纯感受描述）也是合理的
- 远期形态：agent 按需**主动查询**证据（`get_requests_around(t)`、`get_dom_state(t)`、`get_errors()`），而不是一次性塞死数据 —— 即 MCP 方向

## 三、明确说过"不要"的

- ❌ 鼠标移动轨迹——目的不是轨迹，是标注"指向哪一块"
- ❌ 精确到源码行号的定位——selector + 元素 + 截图就够，agent 自己聪明
- ❌ 强制把语音切分成独立工单——整体交给 AI 关联即可（N 键边界是可选辅助，不是必须）

一句话收敛（用户原话）：**"最终的功能其实就是截图 + 元素标注，可以看作是连续的标注和连续的截图。"**

## 四、降级路线 → 当前版本

理想版的关键差异点是"**智能关联**"（按语义挑证据）。V1 的降级策略：
全量确定性记录 + 时间窗就近挂载 + 原始证据不丢——把"智能关联"交给下游 agent 完成（它本来就是 LLM）。

### V1 现状（已对齐"现实版"，部分触达理想版）

| 理想版能力 | V1 实现 | 差距 |
|---|---|---|
| 三条记录线全自动 | ✅ 录音+SR / 全操作事件 / DOM mutation 摘要 + **rrweb 全量 DOM 回放**（review.html "▶ 回放"） | ✅ 第三条线完全体已上线；另有 dom/*.html 快照供 MCP get_dom_state(t) 查 |
| 因果爆发链 | ✅ 点击后的请求+body/响应/console/状态变化全记；session.md 渲染层把 ~1.8s 后果缩进归组 | ✅ "点了没反应"显式渲染为证据（no page reaction — itself evidence） |
| 语音锚点时间轴 | ✅ SAY 块 + 时间窗证据挂载 | ✅ 形态与设想一致 |
| **按语义智能挑证据** | ✅ `--associate` / `wit associate`：LLM 从 ±5s 候选事件挑相关项→`assoc.json`，session.md 只显示命中、其余折叠；无 key 回退时间窗 | 已上线但属可选层；默认渲染仍是确定性时间窗（语义判断也可留给下游 agent） |
| agent 主动查询证据 | ✅ `wit mcp`：stdio MCP server，12 个工具（list_segments/segment_detail/session_overview/list_says/session_md/events_around/get_errors/get_shot/get_dom_state/get_body/get_asr/set_asr） | ✅ 已上线 |
| **语音锚点 → 问题包** | ✅ `SEGMENTS.md` + `segments/NN.md`：语音段索引（原话+嫌疑元素+死点击+⚠证据缺口+挂图）；段≠问题，语义归组归 agent | ✅ 已上线；`wit segments` 可重建 |
| **agent 可读的回放** | ✅ `wit keyframes` / `--keyframes`：rrweb.jsonl → 每段起/中/止关键帧 jpg | ✅ 已上线（可选层） |
| 元素/区域标记 | ✅ Ctrl+点击 / M inspect / 拖拽圈选 | ✅ 超出设想（组件链、红框截图） |
| 多问题一段录 | ✅ N 键 Issue 边界（可选辅助） | ✅ |
| 语音质量 | ✅ 云端流式 ASR（auto=doubao-web→doubao-ime→浏览器SR，四入口可切）+ 终稿 whisper/bcut | 原话永不改写 |

## 五、设计信条

1. **证据不改写**：语音碎片原样落盘。合并/纠错是展示层和下游的事。证人证词一字不动。
2. **证据 ≠ 意图**：点击/标记只是"发生了什么"，只有语音说明"用户想说什么"。无 SAY 时禁止从行为推断问题。
3. **本地优先零依赖**：无云 key 全功能可用；模型层全部是可选增强，不是链路必需。
4. **受众分离**：人看 review.html（视觉+音频跳转）；agent 走 `SEGMENTS.md` → `segments/NN.md` → 按需下钻 `events.jsonl`/`shots/`/`keyframes/`（结构化文本+多模态图）。
5. **降级不丢信息**：理想版做不到的（智能关联），用"全量记录+原始可查"兜底——宁可多给，不可猜错地少给。

## 六、V2+ 路线（向理想版逼近的顺序）

1. ~~**LLM 证据关联**~~ ✅ `--associate`/`wit associate` 已实现（挂载建议只动展示，不改原文）
2. ~~**MCP server**~~ ✅ `wit mcp` 已实现（12 个 stdio 工具）
2b. ~~**语音锚点问题包 + 关键帧**~~ ✅ `SEGMENTS.md`/`segments/` + `wit keyframes` 已实现
3. **更强转写**——火山 seed-asr（豆包同源）/ 讯飞 / Scribe 适配器（transcribe.ts 已留 backend 抽象）
4. **浏览器插件版**——脱离 Playwright，日常浏览器即录（最初的设想形态）
5. ~~**rrweb 完整回放**~~ ✅ 已实现——`rrweb.jsonl` + review.html 内嵌播放器（胶片条仍是轻量伪回放）；`wit keyframes` 另渲染每段关键帧给 agent
6. **崩溃恢复** ✅ `wit recover` 已实现——从 events.jsonl 重建全部产物

## 七、交付物受众对照

| 给人看 | 给 AI agent |
|---|---|
| 语言策略 | agent 面向产物（PROMPT.md/SEGMENTS.md/session.md/segments/）一律英文生成——LLM 最稳语料；SAY 原话逐字保留不翻译 |
| review.html（语音卡片+截图+音频跳转+rrweb 回放） | SEGMENTS.md → segments/NN.md（语音锚点索引，先读） |
| shots/*.jpg、audio.webm、keyframes/ | session.md（全量档案）· events.jsonl / transcript.json / bodies/ |
| README.txt（目录导览） | PROMPT.md（入口+词表+规则）· shots/ · dom/ · session.json |

## 八、技术方案（理想版的实现层）

| 层 | 方案 |
|---|---|
| 浏览器托管 | Playwright + 系统 Edge/Chrome（免下载）；`addInitScript` 早期注入 + `exposeBinding` 页面↔Node 桥 |
| 录音 | 页面内 MediaRecorder（WebM/Opus，零系统依赖） |
| 转写 | `live-asr.ts` 引擎链：doubao-web 默认 → doubao-ime → 浏览器 SR（`wit config asr`/`--asr`/`WIT_ASR`/MCP `set_asr`）；终稿 whisper/bcut |
| 事件模型 | 统一 Ev 联合类型 → 流式 events.jsonl（崩溃不丢） |
| 截图 | 事件驱动（click/mark 裁切 + 导航/报错）+ 周期兜底（固定高频=频闪根因，已实测）；分级质量 q82 证据/q68 周期，jpeg|webp 可选 |
| 关联 | V1 时间窗挂载；理想态 LLM 关联层（见下） |
| 渲染 | session.md / review.html（零依赖单页）/ PROMPT.md（含页面词表） |
| 技术栈 | TypeScript + Node.js + Commander + dotenv + OpenAI SDK（兼容端点） |

### V2 智能关联层（理想版招牌能力的实现）

停止后对每个 SAY：取 segStart±5s 候选事件（压缩后 ~50-200 条）+ 页面词表 → LLM 输出
`{say_index: [ev_ids]}` 挂载建议 + 每 SAY 语义摘要 → session.md 按建议渲染证据点，
"全部证据"折叠区兜底。无 key/失败 → 回退时间窗。**只动挂载建议，证据原文不动。**

### MCP 查询口（V2，已实现为 12 个工具）

agent 按需挖证据而非一次塞死：`list_segments` / `segment_detail(n)` /
`session_overview` / `list_says` / `session_md` / `events_around(t_ms, radius, kinds)` /
`get_errors` / `get_shot` / `get_body` / `get_dom_state(t)` / `get_asr` / `set_asr`。

## 九、使用、接入与部署

**使用（方式 A：agent 驱动）**：说"帮我录一段"→ 浏览器弹出 → 体验+说话+Ctrl点/N/P → 点 ■ →
说"录完了" → agent 读 `SEGMENTS.md` → **先回显问题确认清单，用户确认后再修** → 定位源码 → 修 → 引用证据点汇报。
方式 B：CLI（`wit start/list/open/transcribe/correct/segments/keyframes`）。方式 C（远期）：浏览器插件。

**接入**：Devin 走 `skills/witness`（已全局安装）；Cursor/Claude/Codex 贴 PROMPT.md+目录；
V2 起 MCP server 直连。session 目录自描述（README.txt），无 lock-in。

**部署**：Node 18+ + 系统 Edge/Chrome；`npm install && npm run build && npm link` → `wit`/`rec`；
`.env` 可选 ZHIPU_API_KEY/OPENAI_API_KEY；产物落 `<cwd>/.witness/sessions/`（自动 gitignore）。
零云依赖、Windows 优先、跨平台兼容。
