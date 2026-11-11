---
name: witness
description: 录制产品体验证据链。用户说"帮我录一段/体验下页面/看下最新录制/按录制修问题"时使用。witness 打开托管浏览器录语音+点击+请求+console+状态变化，产出 .witness/sessions/ 证据包。
---

# Witness — 语音锚点证据录制

## 何时触发

- "帮我录一段 / 体验下这个页面 / 看下最新录制 / 按录制里的问题修"
- 用户给了 `.witness/sessions/<dir>` 路径或说"这是我录的"

## 启动录制（需要用户在场说问题）

```bash
wit start <url>                    # wit 已全局安装（npm i -g github:wookat/witness 或 npm link）
# 常用 flag：--duration 60（自动停）· --lang en-US（英文站）· --asr <engine> · --shot-interval 15000 · --no-transcribe
```

- dev-url 从项目 package.json scripts / vite 端口推（通常 `http://localhost:5173`）
- 启动后告诉用户：浏览器里正常用+说话（识别文字会实时出现在工具栏下方）；`Ctrl+点击` 直接标记元素；`M` 进 inspect 模式（悬停点选元素，或**拖拽圈选区域**）；`N` 切分新问题边界（一段录多个问题）；`P` 暂停/继续（暂停期证据全冻结）；`Alt+Shift+R` 或点 ■ 停止
- 录制期间不要阻塞等待；停止后自动生成 session.md；events.jsonl 流式落盘，进程被杀也保住已录部分

## 语音管线（免配置默认）

- 实时字幕：云端流式 ASR，`auto` 档逐级兜底 **doubao-web（默认，标点最好）→ doubao-ime（句级时间戳+ITN 数字）→ 浏览器 SR**。say 事件带 segStart/segEnd 时间戳落时间轴
- 引擎切换（三处等价）：`wit config asr auto|doubao-web|doubao-ime|sr|off`（持久）· `--asr <engine>` / `WIT_ASR`（单次）· MCP `get_asr`/`set_asr`（agent 自己查自己切）。`off` = 不要实时字幕，终稿照出
- 停止时终稿链：OPENAI_API_KEY → whisper-1 词级时间戳；无 key 走 bcut（B站必剪，免费无需 key）
- `ZHIPU_API_KEY`（bigmodel.cn 免费）→ 停止时 GLM-4-Flash 按"页面元素词表"纠错（同音字/断句）
- `wit transcribe <sessionDir>` / `wit correct <sessionDir>`：对已录 session 重跑转写/纠错
- `wit associate <sessionDir>`（需 ZHIPU_API_KEY）：LLM 给每段 SAY 挑相关证据→`assoc.json`，session.md 只显示命中事件、其余折叠；`wit start --associate` 录制停止时自动跑
- `wit recover <sessionDir>`：崩溃/中断后从 events.jsonl 重建 session.md/review.html/PROMPT.md
- `wit mcp [sessionDir]`：stdio MCP server——agent 可配进 MCP 客户端按需查证据，共 12 个工具：`list_segments`/`segment_detail`/`session_overview`/`list_says`/`session_md`/`events_around`/`get_errors`/`get_shot`/`get_dom_state`/`get_body`/`get_asr`/`set_asr`
- `WIT_CDP=<port>`（env）：给托管浏览器开 CDP 口——agent 可连上录制中的页面亲自当测试者（驱动点击/标记，全程被录）

## 消费证据（修问题）——按算法执行

用户说"录完了/按录的修"时：

**步骤 1 · 读索引**：`ls .witness/sessions/` 找目录 → 先读 **`SEGMENTS.md`**（一屏内的语音锚点索引：SAY 原文、嫌疑元素、截图/DOM 引用）。逐段细节在 `segments/NN.md`；`session.md` 是全量档案，只在段文件之外要更多上下文时读。没有 SEGMENTS.md 的老 session 跑 `wit segments <dir>` 生成。**段 ≠ 问题**：段是按 ≥4s 语音缝/动作打断机械切的语音单元，语义归组是你的活。

**步骤 2 · 回显确认清单**（不要直接开修）：

| # | 时间 | 用户原话 | 你的理解 | 关联证据 |
|---|------|----------|----------|----------|
| 1 | 00:56 | "顶部栏图标没居中" | nav .logo 组偏高 ~2px | shots/003.jpg · suspects |

- **归组是你做，不是按段照搬**：相邻段常被点击打断（如 S4/S5/S6 连续，嫌疑元素相同），按意思合并成一个确认项；一段含多个问题拆 1a/1b
- 理解有歧义的标 ❓ 让用户澄清，别自己猜
- 末尾问：共 N 条，有漏的或理解偏的吗？

**步骤 3 · 用户确认后逐条修，按类型路由证据**：

| 问题类型 | 第一证据 | 补充 |
|---|---|---|
| 视觉/位置/样式 | **先开段里挂的 shot 图**（你是多模态，必须看） | dom/snap + suspects.sel |
| 死按钮/点了没反应 | 段的"点击无反应"清单 | shot 确认视觉 |
| 报错/网络 | console/error/res≥400 行 | `bodies/` 响应体 |
| 行为/逻辑 | click→req/res 爆发链 | dom snap 前后态 |
| 定位源码 | suspects `Comp:` 链 > `sel` > 元素文本 | grep 源码 |

**步骤 4 · 汇报**：`#n fixed/blocked · 引用的证据点 · 改了什么`；修不了标注缺什么证据，让用户重录那一段。

**铁律**：视觉描述不先看 shot 不下结论 · 无 SAY 段不从点击/滚动推断意图 · 转写是口语原文，按意图理解不逐字抠 · 段里标了 `⚠ 证据缺口` = 语音声称但窗口内无对应事件——汇报时要点名缺什么 · `.witness/` 不入 git · 音频截图含隐私不外传

## 深挖路径

`SEGMENTS.md` → `segments/NN.md` → `events.jsonl`（t 窗口原始事件）→ `shots/`（mark 带红框）→ `bodies/` → `transcript.json`

## 汇报格式

每个问题回指证据点：`[00:12] SAY "..." · button#submit → POST /api/x 500`，说明修复对应哪条证据；修不了的标注缺什么证据，让用户重录那一段。
