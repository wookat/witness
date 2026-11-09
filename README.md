# Witness

**Voice-anchored causal evidence recorder for AI coding agents.** · 官网：[witness.zalize.com](https://witness.zalize.com) · 愿景与路线：[VISION.md](VISION.md)

你说一句，机器把那句话的证据链自动补全。你像平时一样体验网页、用嘴说哪里不对，Witness 同时把页面的每次点击、每个请求、每条报错、每个状态变化按毫秒记下，再把"你这句话"和"那一秒发生的因果事实"焊在一起——产出一份带截图、元素定位、请求链路和报错的证据包，直接喂给 AI 编码 agent 修。

## 安装

```bash
npm install && npm run build && npm link
# 之后任意目录可用：wit / rec
```

首次运行自动检测系统 Edge/Chrome（优先用，零下载）；都没有才装自带 chromium。

## 使用

```bash
wit start http://localhost:5173     # 或任何 http/https 页面，含生产站
wit start <url> --lang en-US        # 英文站点
wit start <url> --duration 60       # 60 秒后自动停
wit list                            # 列 sessions
wit open latest                     # 打开 review.html
wit transcribe <sessionDir>         # 重跑云端转写
wit correct <sessionDir>            # 重跑 LLM 纠错
wit associate <sessionDir>          # LLM 给每段语音挑相关证据（需 ZHIPU_API_KEY）
wit recover <sessionDir>            # 崩溃/中断后从 events.jsonl 重建产物
wit mcp [sessionDir]                # stdio MCP server，agent 按需查询证据
```

浏览器打开后：

| 手势 | 动作 |
|---|---|
| 正常浏览+说话 | 全程录音；点击/滚动/输入/导航自动记录；Edge SR 实时转写，识别文字实时显示在工具栏下方 |
| `Ctrl+点击` | 直接标记元素（selector+outerHTML+组件链+红框截图） |
| `M` 或工具栏 ◎ | Inspect：悬停高亮，点选标记；**拖拽圈选区域**截局部图 |
| `N` 或工具栏 ⧉ | 显式切出 **Issue 边界**——session.md/review.html 出现 `⏺ ISSUE #n` 分隔，多问题一段录完 |
| `P` 或工具栏 ⏸ | 暂停/继续——暂停期**所有事件与录音都冻结**（隐私，比如去接电话） |
| `Alt+Shift+R` / ■ / 终端 Ctrl+C | 停止并生成证据包 |

events.jsonl 边录边落盘——进程被杀也只丢最后几百毫秒，`wit recover` 随时重建全部产物。

**因果爆发链**：session.md 里每次点击会把随后 ~1.8s 的请求/报错/DOM 变化缩进归组——
点击后什么都没发生会显式记为 `（点击后页面无任何反应——这本身就是证据）`。

## 语音管线

默认零配置：Edge SpeechRecognition 实时识别（免费、国内可用）。可选增强写进 `.env`：

```
ZHIPU_API_KEY=...     # bigmodel.cn 免费 → GLM-4-Flash 按页面词表纠错
OPENAI_API_KEY=sk-... # whisper-1 词级时间戳
```

## 产物 `.witness/sessions/<ts>_<host>/`

```
session.md      # 时间轴：每段 SAY 下挂该时刻的因果爆发链（喂 agent 入口）
review.html     # 回放页：语音卡片 + 截图 + 音频跳转 + 底部胶片条伪回放
PROMPT.md       # 可粘贴给 agent 的模板
events.jsonl    # 全量原始事件
rrweb.jsonl     # rrweb 全量 DOM 事件流——review.html 顶部"▶ 回放"整页回放（--no-rr 关闭）
dom/*.html      # DOM 快照（nav/mark/每30s），MCP get_dom_state(t) 可查
assoc.json      # （可选）LLM 挑出的"每段语音→相关事件"挂载建议
shots/*.jpg     # 事件驱动 + 周期截图（默认 10s）
bodies/*.json   # 响应体 ≤64KB
audio.webm / transcript.json
```

## 隐私

密码输入自动打码（click/input/mut/mark 四通道）；POST 请求体的 password/token/secret 字段自动脱敏；
`WIT_NO_BODIES=1` 可完全关闭响应体捕获；`.witness/` 自动加入 gitignore。音频/截图仍在本地 session 目录，勿外发。

## MCP 接入（agent 拉取式查证据）

```bash
wit mcp                       # 服务最新 session
wit mcp <sessionDir>          # 服务指定 session
```

stdio MCP server，7 个工具：`session_overview` / `list_says` / `session_md` /
`events_around(t_ms, radius_ms, kinds)` / `get_errors` / `get_shot` / `get_body`。
把 `wit mcp` 配进任何支持 MCP 的 agent（Cursor/Claude/Devin）即可让它主动挖证据，而不是一次塞全文。

## 当前边界

确定性记录 + Edge SR 为默认。可选 LLM 层：`--correct`（文本抛光）/ `--associate`（证据挑选），
都只动展示层、不改原始事件。未做：rrweb 完整回放、插件版（V3 路线）。

## 开发

`npm test` — 先编译再跑 `test/*.test.mjs`（node:test，覆盖 align / speech-run 分组 / 降噪 / PROMPT 词表）。

MIT.
