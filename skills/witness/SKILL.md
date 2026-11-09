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
wit start <url>                    # 全局已 npm link，任意目录可用
# 常用 flag：--duration 60（自动停）· --lang en-US（英文站）· --shot-interval 15000 · --no-transcribe
```

- dev-url 从项目 package.json scripts / vite 端口推（通常 `http://localhost:5173`）
- 启动后告诉用户：浏览器里正常用+说话（识别文字会实时出现在工具栏下方）；`Ctrl+点击` 直接标记元素；`M` 进 inspect 模式（悬停点选元素，或**拖拽圈选区域**）；`N` 切分新问题边界（一段录多个问题）；`P` 暂停/继续（暂停期证据全冻结）；`Alt+Shift+R` 或点 ■ 停止
- 录制期间不要阻塞等待；停止后自动生成 session.md；events.jsonl 流式落盘，进程被杀也保住已录部分

## 语音管线（免配置默认）

- Edge 内置 SpeechRecognition 实时识别（免费、国内可用）→ say 事件实时落时间轴
- `ZHIPU_API_KEY`（bigmodel.cn 免费）→ 停止时 GLM-4-Flash 按"页面元素词表"纠错（同音字/断句）
- `OPENAI_API_KEY` → 走 whisper-1 词级时间戳（更准）；`GROQ_API_KEY` → groq whisper（国内被墙勿用）
- `wit transcribe <sessionDir>` / `wit correct <sessionDir>`：对已录 session 重跑转写/纠错
- `wit associate <sessionDir>`（需 ZHIPU_API_KEY）：LLM 给每段 SAY 挑相关证据→`assoc.json`，session.md 只显示命中事件、其余折叠；`wit start --associate` 录制停止时自动跑
- `wit recover <sessionDir>`：崩溃/中断后从 events.jsonl 重建 session.md/review.html/PROMPT.md
- `wit mcp [sessionDir]`：stdio MCP server——agent 可配进 MCP 客户端按需查证据（`session_overview`/`list_says`/`session_md`/`events_around`/`get_errors`/`get_shot`/`get_body`）

## 消费证据（修问题）

1. `ls .witness/sessions/` 找最新（或用户指定）目录
2. 主读 `session.md`：时间轴 = 每段 SAY（语音原文）+ 该时刻证据。**点击行下面缩进的条目是它的因果后果**（请求/报错/DOM 变）；点击行下写"无任何反应"表示点击真没触发任何事——这本身是证据
3. 深挖：`events.jsonl` 全量事件；`bodies/` 请求响应体；`transcript.json` 转写详情
4. 视觉确认：`shots/` 截图（标记元素带红框、圈选区域是裁切图）
5. 定位源码：优先 `MARK` 行的组件链（`Comp: OrderForm › SubmitButton`，React/Vue 都有）grep；其次 `selector`、元素文本、路由路径
6. 转写是口语化语音原文，可能有错字——按意图理解，不要逐字抠

## 汇报格式

每个问题回指证据点：`[00:12] SAY "..." · button#submit → POST /api/x 500`，说明修复对应哪条证据；修不了的标注缺什么证据，让用户重录那一段。

## 注意

- `.witness/` 已在 gitignore，不提交证据包
- 音频/截图可能含用户隐私（密码已自动打码，但音频本体在），不要外发或上传
- 没有 SAY 段时**不要**从点击/滚动推断用户意图——那些只是操作证据，直接问用户
