export interface DocsCopy {
  pageTitle: string;
  pageDesc: string;
  headTitle: string;
  headLede: string;
  chapters: [string, string, string][];
  rulers: string[];
  s1: {
    k: string; h: string; lede: string;
    term1Lbl: string; term1: string;
    c1t: string; c1d: string;
    c2t: string; c2d: string; c2link: string;
    term2Lbl: string; term2Comment: string;
  };
  s2: {
    k: string; h: string; lede: string;
    c1t: string; c1d: string; c1pre: string;
    c2t: string; c2d: string; c2pre: string;
  };
  s3: {
    k: string; h: string;
    termLbl: string; conv: string;
    c1n: string; c1t: string; c1pre: string;
    c2n: string; c2t: string; c2pre: string;
  };
  s4: {
    k: string; h: string; lede: string;
    treeLabel: string; tree: string;
    c1d: string; c2d: string; c3d: string;
  };
  s5: {
    k: string; h: string;
    c1n: string; c1t: string; c1pre: string;
    c2n: string; c2t: string; c2d: string;
    c3n: string; c3t: string; c3d: string;
    foot: string;
  };
  s6: {
    k: string; h: string; lede: string;
    termComment: string;
    btnDemo: string; btnBack: string;
  };
}

export const DOCS: Record<string, DocsCopy> = {
  en: {
    pageTitle: "Witness Docs — install, configure, record & hand evidence to your agent",
    pageDesc: "Reference manual for Witness CLI (wit): install, wit init, global/project config, offline local ASR, evidence package layout, and 15 MCP tools.",
    headTitle: "You talk. Your agent runs the commands.",
    headLede: "The complete reference manual — install, interactive setup, recording controls, evidence layout, and 15-tool MCP integration.",
    chapters: [
      ["01", "install", "#install2"], ["02", "configure", "#config"], ["03", "use it", "#use"],
      ["04", "the package", "#output"], ["05", "tell your agent", "#agent"], ["06", "try it", "#try"],
    ],
    rulers: ["docs", "config", "record", "package", "handoff", "demo"],
    s1: {
      k: "01 · Install",
      h: "You don't install it. Your agent does.",
      lede: "The intended flow: <b>you give the instruction, the agent types the commands.</b> Witness is a single CLI (<code>wit</code> / <code>rec</code>) driving your system Edge/Chrome (bundled Chromium only as fallback) — no cloud account, no required keys.",
      term1Lbl: "say this to your agent",
      term1: "Install witness: `npm i -g witness-recorder`,\nrun `wit doctor` to verify. Requires Node 18+.",
      c1t: "What lands on your machine",
      c1d: "<b>The <code>wit</code> CLI</b> — recorder, review workbench renderer, transcriber, and 15-tool MCP server in one binary. Machine-level defaults live in <code>~/.witness/config.json</code> (global); project hotwords live in <code>.witness/config.json</code>. Evidence always lands in the current project's <code>.witness/sessions/</code>.",
      c2t: "Teach an agent that doesn't know it",
      c2d: "The repo ships <code>skills/witness/SKILL.md</code> — drop it into <code>CLAUDE.md</code> / <code>.cursor/rules/</code> / <code>AGENTS.md</code> and phrases like “record a session for me” trigger the whole workflow.",
      c2link: "View SKILL.md ↗",
      term2Lbl: "what the agent actually runs",
      term2Comment: "# transparent under the hood:",
    },
    s2: {
      k: "02 · Configure & Parameterize",
      h: "Zero-config defaults; interactive switches when you want them.",
      lede: "Run <code>wit init</code> for a 4-step interactive wizard, or customize your exact CLI + MCP parameters below:",
      c1t: "Live ASR & config scopes",
      c1d: "<code>wit config asr</code> / <code>lang</code> / <code>telemetry</code> persist globally to <code>~/.witness/config.json</code>; <code>asr-prompt</code> persists per-project to <code>.witness/config.json</code>. Override per run via <code>--asr</code> / <code>--lang</code> or MCP <code>set_asr</code>.",
      c1pre: `auto         local (if installed) → doubao-web → doubao-ime → sr
local        offline sherpa-onnx live captions (~190MB, zh+en)
doubao-web   free cloud streaming, best punctuation (default)
doubao-ime   free cloud IME, sentence timestamps & ITN digits
sr           browser SpeechRecognition (on-device fallback)
off          no live subtitles (audio & final transcript still run)`,
      c2t: "Final transcription chain & env",
      c2d: "No key is required — zh/auto sessions fall back to free cloud (<code>doubao-web → bcut</code>) and reuse live ASR when it covered ≥75%:",
      c2pre: `wit init                 4-step interactive setup wizard
wit setup local-asr      offline Whisper (uv + faster-whisper, ~500MB, :8791)
wit local-asr live setup offline live captions (sherpa-onnx, ~190MB, :8792)
WHISPER_BASE_URL         any OpenAI-compatible STT endpoint
GROQ_API_KEY             whisper-large-v3-turbo
OPENAI_API_KEY           whisper-1 word timestamps
WIT_ASR_PROMPT           hotword bias (or: wit config asr-prompt …)
ZHIPU_API_KEY            optional GLM-4 --correct / --associate
WIT_NO_BODIES=1          skip HTTP response-body capture
WIT_TELEMETRY=0          disable anonymous CLI ping (or: wit config telemetry off)
WIT_CDP=<port>           expose CDP so an agent can drive the browser`,
    },
    s3: {
      k: "03 · Use it",
      h: "Three sentences. That's the whole loop.",
      termLbl: "the conversation",
      conv: `<span class="c-say">you</span>   → "record http://localhost:5173 for me"\n<span class="c-ok">agent</span> → <span class="c-dim">runs \`wit start\`, managed browser opens</span>\n\n<span class="c-say">you</span>   → <span class="c-dim">use the product, talk out loud, mark problems</span>\n<span class="c-say">you</span>   → <span class="c-dim">press ■ (or Alt+Shift+R)</span>\n\n<span class="c-say">you</span>   → "fix the issues from that recording"\n<span class="c-ok">agent</span> → <span class="c-dim">reads SEGMENTS.md → echoes checklist → fixes from evidence</span>`,
      c1n: "YOUR PART — inside the browser",
      c1t: "Talk & point",
      c1pre: `speak             every observation → timestamped SAY
Ctrl+Click        mark element (selector + comp chain + shot)
M                 inspect mode — hover-pick or drag a region
N                 cut an explicit issue boundary (optional)
P                 pause/resume — freezes ALL events, net & mic
■ / Alt+Shift+R   stop and build the evidence package`,
      c2n: "AGENT'S PART — CLI surface",
      c2t: "All wit commands",
      c2pre: `wit start <url>       record (flags: --lang --asr --keyframes --dsf --shot-format)
wit init              interactive 4-step config wizard
wit doctor            preflight checks: browser, ASR, whisper, env
wit list / open       browse sessions & open review.html
wit segments <dir>    rebuild SEGMENTS.md + segments/NN.md
wit keyframes <dir>   render rrweb → per-segment keyframe JPEGs
wit transcribe <dir>  re-run final transcription
wit correct/associate optional LLM polish & evidence linking
wit recover <dir>     rebuild artifacts after crash/interrupt
wit mcp [dir]         serve 15-tool stdio MCP server
wit config …          asr | lang | asr-prompt | telemetry
wit setup local-asr / wit local-asr start|stop|status|models|live`,
    },
    s4: {
      k: "04 · What you get",
      h: "One package, two audiences.",
      lede: "<b>For you:</b> an interactive replay & handoff workbench. <b>For your agent:</b> structured evidence it can query or read directly.",
      treeLabel: ".witness/sessions/<ts>/",
      tree: `├─ <span class="c-acc">review.html</span>      <span class="c-dim">→ FOR HUMANS — workbench: DOM replay + shots + search + selectable AI handoff</span>
├─ <span class="c-ok">SEGMENTS.md</span>      <span class="c-dim">→ FOR AGENTS — speech anchor index (read first; semantic grouping is agent's job)</span>
├─ <span class="c-ok">segments/NN.md</span>   <span class="c-dim">→ FOR AGENTS — per-segment bundle: verbatim + dead clicks + errors + shots</span>
├─ <span class="c-ok">keyframes/</span>       <span class="c-dim">→ rrweb-rendered replay frames per segment (wit keyframes)</span>
├─ <span class="c-ok">PROMPT.md</span>        <span class="c-dim">→ FOR AGENTS — handoff rules + page vocabulary</span>
├─ <span class="c-ok">session.md</span>       <span class="c-dim">→ FOR AGENTS — full causal-burst timeline archive</span>
├─ events.jsonl     <span class="c-dim">→ crash-safe line-buffered raw event stream</span>
├─ transcript.json  <span class="c-dim">→ final speech transcript with segment timestamps</span>
├─ audio.webm       <span class="c-dim">→ seekable voice recording</span>
├─ shots/           <span class="c-dim">→ screenshots — red-box marks, click crops, periodic frames</span>
├─ bodies/          <span class="c-dim">→ HTTP response payloads (≤64KB head kept, truncated flagged)</span>
├─ dom/             <span class="c-dim">→ DOM snapshots at nav/mark/30s</span>
├─ rrweb.jsonl      <span class="c-dim">→ full DOM replay stream</span>
└─ session.json     <span class="c-dim">→ meta: url, duration, viewport, lang, asr engine, counts</span>`,
      c1d: "The paste-ready handoff spec. Teaches any agent the format: causal-burst indentation, dead-click evidence, component chains, and never inferring intent without a SAY.",
      c2d: "The full causal timeline archive. Each <code>SAY</code> block carries your verbatim words plus what the page did at that second.",
      c3d: "Serves the session over stdio MCP — 15 tools: <code>list_segments</code> · <code>segment_detail</code> · <code>session_overview</code> · <code>list_says</code> · <code>session_md</code> · <code>events_around</code> · <code>get_errors</code> · <code>get_shot</code> · <code>get_dom_state</code> · <code>get_body</code> · <code>get_audio</code> · <code>get_transcript</code> · <code>search_events</code> · <code>get_asr</code> · <code>set_asr</code>.",
    },
    s5: {
      k: "05 · Tell your agent",
      h: "Three ways to hand over evidence.",
      c1n: "EASIEST",
      c1t: "Point at the directory",
      c1pre: `"I recorded a session —\nevidence is in .witness/sessions/<ts>.\nRead SEGMENTS.md and confirm issues first."`,
      c2n: "CURATED IN REVIEW.HTML",
      c2t: "Customize & Copy for AI",
      c2d: "Open <code>review.html</code>, check only the issues you want fixed right now, add an optional note, pick <code>Selected Issues</code> / <code>Current Moment (±5s)</code> / <code>Full PROMPT.md</code>, and copy.",
      c3n: "PERMANENT",
      c3t: "Wire the 15-tool MCP",
      c3d: "Agent pulls exact evidence on demand — including audio, shots, DOM snapshots, and switching the ASR engine.",
      foot: `And to make an agent <b>record</b>: <code>"use witness to record http://localhost:5173 — I'll talk through the issues"</code>. With <code>WIT_CDP</code> set, an agent can even <b>be the tester</b> inside the recorded browser.`,
    },
    s6: {
      k: "06 · Try it in two minutes",
      h: "Record the demo page.",
      lede: "A tiny intentionally broken checkout ships with this site — dead Pay button, 404 coupon API, and console error waiting to be caught:",
      termComment: "# click Pay, say \"it does nothing\", click Apply, press ■ → wit open",
      btnDemo: "Open the demo app ↗",
      btnBack: "← Back to landing",
    },
  },

  zh: {
    pageTitle: "Witness 文档 — 安装、参数配置、录制与交接证据给 Agent",
    pageDesc: "Witness CLI（wit）完整参考手册：安装、wit init、全局/项目分层配置、全离线本地 ASR、证据包结构与 15 个 MCP 工具。",
    headTitle: "你动嘴，命令让 agent 去敲。",
    headLede: "完整参考手册——怎么装、参数怎么配、录制控制、证据包结构与 15 工具 MCP 接入。",
    chapters: [
      ["01", "安装", "#install2"], ["02", "参数与配置", "#config"], ["03", "使用", "#use"],
      ["04", "证据包", "#output"], ["05", "交给 AI", "#agent"], ["06", "演示", "#try"],
    ],
    rulers: ["docs", "配置", "录制", "证据包", "交接", "演示"],
    s1: {
      k: "01 · 安装",
      h: "不用你装，让 agent 装。",
      lede: "推荐姿势是<b>你下指令，agent 敲命令</b>。Witness 本体是单二进制 CLI（<code>wit</code> / <code>rec</code>），优先驱动你系统里的 Edge/Chrome（没有时才回退内置 Chromium）——免云账号、免必需 key。",
      term1Lbl: "对你的 agent 说一句",
      term1: "安装 witness：执行 `npm i -g witness-recorder`，\n运行 `wit doctor` 检查环境。需要 Node 18+。",
      c1t: "装到你机器上的是什么",
      c1d: "<b><code>wit</code> 命令行</b>——录制器、<code>review.html</code> 回放工作台、转写器、15 工具 MCP server 四合一。机器级偏好存于全局 <code>~/.witness/config.json</code>（asr / lang / localAsr / telemetry），项目热词存于当前目录 <code>.witness/config.json</code>，证据落在 <code>.witness/sessions/</code>。",
      c2t: "教不认识它的 agent",
      c2d: "仓库自带 <code>skills/witness/SKILL.md</code>——放进 <code>CLAUDE.md</code> / <code>.cursor/rules/</code> / <code>AGENTS.md</code>，之后说“帮我录一段”就能自动走完录制与核对流程。",
      c2link: "查看 SKILL.md ↗",
      term2Lbl: "agent 实际执行的命令",
      term2Comment: "# 透明起见——你的 agent 在背后执行的是：",
    },
    s2: {
      k: "02 · 参数与配置",
      h: "默认零配置；按场景自由定制参数。",
      lede: "跑一次 <code>wit init</code> 走完 4 步向导，或直接在下方交互勾选生成你的专属命令与 MCP 配置：",
      c1t: "实时 ASR 与配置分层",
      c1d: "<code>wit config asr</code> / <code>lang</code> / <code>telemetry</code> 持久化到全局 <code>~/.witness/config.json</code>；<code>asr-prompt</code> 持久化到项目 <code>.witness/config.json</code>。单次录制可用 <code>--asr</code> / <code>--lang</code> 或 MCP <code>set_asr</code> 覆盖。",
      c1pre: `auto         本地 sherpa(若已装) → doubao-web → doubao-ime → sr
local        全离线 sherpa-onnx 实时字幕（约 190MB，中英双语）
doubao-web   免费云端流式，标点最优（默认）
doubao-ime   免费云端 IME，句级时间戳与数字 ITN
sr           浏览器自带 SpeechRecognition（离线兜底）
off          不要实时字幕（录音与终稿照常生成）`,
      c2t: "终稿转写链与环境变量",
      c2d: "一个都不配也能跑——中文/自动会话会自动复用覆盖率 ≥75% 的实时字幕或走免费云端（<code>doubao-web → bcut</code>）：",
      c2pre: `wit init                 4 步交互式配置向导
wit setup local-asr      全离线 Whisper（uv + faster-whisper，约 500MB，:8791）
wit local-asr live setup 全离线实时字幕（sherpa-onnx，约 190MB，:8792）
WHISPER_BASE_URL         任意 OpenAI 兼容 STT 端点
GROQ_API_KEY             whisper-large-v3-turbo
OPENAI_API_KEY           whisper-1 词级时间戳
WIT_ASR_PROMPT           热词偏置（或 wit config asr-prompt …）
ZHIPU_API_KEY            可选 GLM-4 --correct / --associate
WIT_NO_BODIES=1          不抓 HTTP 响应体（敏感应用）
WIT_TELEMETRY=0          关闭匿名 CLI 统计（或 wit config telemetry off）
WIT_CDP=<端口>           开放 CDP 口，agent 可亲自接管录制浏览器`,
    },
    s3: {
      k: "03 · 使用",
      h: "三句话，就是完整闭环。",
      termLbl: "你和 agent 的对话",
      conv: `<span class="c-say">你</span>    → "帮我录一段 http://localhost:5173"\n<span class="c-ok">agent</span> → <span class="c-dim">执行 \`wit start\`，托管浏览器弹出</span>\n\n<span class="c-say">你</span>    → <span class="c-dim">正常体验产品，看到什么说什么，顺手标记问题</span>\n<span class="c-say">你</span>    → <span class="c-dim">点工具栏 ■（或按 Alt+Shift+R）</span>\n\n<span class="c-say">你</span>    → "按刚才录的把问题修了"\n<span class="c-ok">agent</span> → <span class="c-dim">先读 SEGMENTS.md → 复述问题清单 → 你确认后照证据修复</span>`,
      c1n: "你的部分 —— 在浏览器里",
      c1t: "说 + 指",
      c1pre: `说话              每句观察 → 带时间戳的 SAY
Ctrl+点击         标记元素（selector + 组件链 + 红框截图）
M                 检视模式：悬停点选，或拖拽圈选区域
N                 切分显式问题边界（可选）
P                 暂停/继续——全证据、网络、日志与麦克风彻底冻结
■ / Alt+Shift+R   停止并落盘证据包`,
      c2n: "agent 的部分 —— CLI 全表面",
      c2t: "全部 wit 命令",
      c2pre: `wit start <url>       开录（--lang --asr --keyframes --dsf --shot-format）
wit init              4 步交互式配置向导
wit doctor            环境体检：浏览器、实时 ASR、转写与权限
wit list / open       浏览录制列表 / 跨平台打开 review.html
wit segments <dir>    重建 SEGMENTS.md + segments/NN.md
wit keyframes <dir>   rrweb 渲染每段关键帧图片
wit transcribe <dir>  重跑终稿转写
wit correct/associate 可选 LLM 纠错与证据语义关联
wit recover <dir>     崩溃或中断后从 events.jsonl 重建全部产物
wit mcp [dir]         启动 15 工具 stdio MCP server
wit config …          asr | lang | asr-prompt | telemetry
wit setup local-asr / wit local-asr start|stop|status|models|live`,
    },
    s4: {
      k: "04 · 你得到什么",
      h: "一个证据包，两种读者。",
      lede: "<b>给人</b>：可筛选、可勾选的交互回放工作台。<b>给 agent</b>：按需可查的结构化因果证据。",
      treeLabel: ".witness/sessions/<时间戳>/",
      tree: `├─ <span class="c-acc">review.html</span>      <span class="c-dim">→ 给人看 —— 回放工作台：DOM/截图双切 + 搜索过滤 + 勾选定向 Copy for AI</span>
├─ <span class="c-ok">SEGMENTS.md</span>      <span class="c-dim">→ 给 agent —— 语音段索引（先读；语义归组由 agent 完成）</span>
├─ <span class="c-ok">segments/NN.md</span>   <span class="c-dim">→ 给 agent —— 每段一包：原话 + 死点击 + 报错 + 截图引用</span>
├─ <span class="c-ok">keyframes/</span>       <span class="c-dim">→ rrweb 回放渲染的每段关键帧（wit keyframes）</span>
├─ <span class="c-ok">PROMPT.md</span>        <span class="c-dim">→ 给 agent —— 交接规范与页面词表</span>
├─ <span class="c-ok">session.md</span>       <span class="c-dim">→ 给 agent —— 全量因果爆发链时间轴档案</span>
├─ events.jsonl     <span class="c-dim">→ 崩溃安全的逐行原始事件流</span>
├─ transcript.json  <span class="c-dim">→ 终稿转写与句级时间戳</span>
├─ audio.webm       <span class="c-dim">→ 可精准 seek 的录音本体</span>
├─ shots/           <span class="c-dim">→ 截图——标记红框、点击裁切、周期帧</span>
├─ bodies/          <span class="c-dim">→ HTTP 响应体（超 64KB 保留头部并标注 truncated）</span>
├─ dom/             <span class="c-dim">→ 导航/标记/每 30s 的完整 DOM 快照</span>
├─ rrweb.jsonl      <span class="c-dim">→ 全量 DOM 回放流</span>
└─ session.json     <span class="c-dim">→ 元数据：url、时长、视口、语言、ASR 引擎、计数</span>`,
      c1d: "给任意 agent 的交接说明书。教它读格式：因果缩进、“无反应也是证据”、组件链定位、没有 SAY 不许猜意图。",
      c2d: "全量因果时间轴档案。每个 <code>SAY</code> 块带你的原话 + 那一秒页面发生的一切。",
      c3d: "将 session 暴露为 stdio MCP server，共 15 个工具：<code>list_segments</code> · <code>segment_detail</code> · <code>session_overview</code> · <code>list_says</code> · <code>session_md</code> · <code>events_around</code> · <code>get_errors</code> · <code>get_shot</code> · <code>get_dom_state</code> · <code>get_body</code> · <code>get_audio</code> · <code>get_transcript</code> · <code>search_events</code> · <code>get_asr</code> · <code>set_asr</code>。",
    },
    s5: {
      k: "05 · 怎么对 AI 说",
      h: "三种方式把证据交出去。",
      c1n: "最省事",
      c1t: "指个路径",
      c1pre: `"我录了一段，证据在\n.witness/sessions/<ts>，\n先读 SEGMENTS.md 复述问题清单再修。"`,
      c2n: "在 REVIEW.HTML 定向打包",
      c2t: "勾选问题 + 定制 Copy for AI",
      c2d: "打开 <code>review.html</code>，只勾选本次想修的问题卡片，补充一句额外要求，选择 <code>Selected Issues</code> / <code>Current Moment (±5s)</code> / <code>Full PROMPT.md</code> 一键复制。",
      c3n: "常驻用法",
      c3t: "接入 15 工具 MCP",
      c3d: "agent 按需拉取音频、截图、DOM 与时间窗事件，还能自己切换本地/云端 ASR 引擎。",
      foot: `反过来让 agent <b>去录</b>：<code>"用 witness 录一下 http://localhost:5173，我会边说边指出问题"</code>。开了 <code>WIT_CDP</code> 之后，agent 甚至可以<b>亲自当测试者</b>在录制中的浏览器里操作。`,
    },
    s6: {
      k: "06 · 两分钟上手",
      h: "拿演示页开录。",
      lede: "官网自带一个故意做坏的小产品——死按钮 Pay、404 优惠码接口、console 报错，全都等着被抓：",
      termComment: "# 点 Pay 说“点了没反应”，点 Apply 触发 404，按 ■ → wit open 看回放工作台",
      btnDemo: "打开演示页 ↗",
      btnBack: "← 回首页",
    },
  },

  "zh-hant": {
    pageTitle: "Witness 文件 — 安裝、參數配置、錄製與交接證據給 Agent",
    pageDesc: "Witness CLI（wit）完整參考手冊：安裝、wit init、全域/專案分層配置、全離線本機 ASR、證據包結構與 15 個 MCP 工具。",
    headTitle: "你動嘴，命令讓 agent 去敲。",
    headLede: "完整參考手冊——怎麼裝、參數怎麼配、錄製控制、證據包結構與 15 工具 MCP 接入。",
    chapters: [
      ["01", "安裝", "#install2"], ["02", "參數與配置", "#config"], ["03", "使用", "#use"],
      ["04", "證據包", "#output"], ["05", "交給 AI", "#agent"], ["06", "演示", "#try"],
    ],
    rulers: ["docs", "配置", "錄製", "證據包", "交接", "演示"],
    s1: {
      k: "01 · 安裝",
      h: "不用你裝，讓 agent 裝。",
      lede: "推薦姿勢是<b>你下指令，agent 敲命令</b>。Witness 本體是單一 CLI（<code>wit</code> / <code>rec</code>），優先驅動你系統裡的 Edge/Chrome（沒有時才回退內建 Chromium）——免雲端帳號、免必需 key。",
      term1Lbl: "對你的 agent 說一句",
      term1: "安裝 witness：執行 `npm i -g witness-recorder`，\n執行 `wit doctor` 檢查環境。需要 Node 18+。",
      c1t: "裝到你機器上的是什麼",
      c1d: "<b><code>wit</code> 命令列</b>——錄製器、<code>review.html</code> 回放工作台、轉寫器、15 工具 MCP server 四合一。機器級偏好存於全域 <code>~/.witness/config.json</code>，專案熱詞存於目前目錄 <code>.witness/config.json</code>，證據落在 <code>.witness/sessions/</code>。",
      c2t: "教不認識它的 agent",
      c2d: "倉庫自帶 <code>skills/witness/SKILL.md</code>——放進 <code>CLAUDE.md</code> / <code>.cursor/rules/</code> / <code>AGENTS.md</code>，之後說「幫我錄一段」就能自動跑完整套流程。",
      c2link: "檢視 SKILL.md ↗",
      term2Lbl: "agent 實際執行的命令",
      term2Comment: "# 透明起見——你的 agent 在背後執行的是：",
    },
    s2: {
      k: "02 · 參數與配置",
      h: "預設零配置；按場景自由客製參數。",
      lede: "跑一次 <code>wit init</code> 走完 4 步精靈，或直接在下方互動勾選生成專屬命令與 MCP 配置：",
      c1t: "即時 ASR 與配置分層",
      c1d: "<code>wit config asr</code> / <code>lang</code> / <code>telemetry</code> 持久化到全域 <code>~/.witness/config.json</code>；<code>asr-prompt</code> 持久化到專案 <code>.witness/config.json</code>。單次可用 <code>--asr</code> / <code>--lang</code> 或 MCP <code>set_asr</code> 覆蓋。",
      c1pre: `auto         本機 sherpa(若已裝) → doubao-web → doubao-ime → sr
local        全離線 sherpa-onnx 即時字幕（約 190MB，中英雙語）
doubao-web   免費雲端串流，標點最優（預設）
doubao-ime   免費雲端 IME，句級時間戳與數字 ITN
sr           瀏覽器內建 SpeechRecognition（離線備援）
off          不要即時字幕（錄音與終稿照常生成）`,
      c2t: "終稿轉寫鏈與環境變數",
      c2d: "一個都不配也能跑——中文/自動會話會自動複用覆蓋率 ≥75% 的即時字幕或走免費雲端（<code>doubao-web → bcut</code>）：",
      c2pre: `wit init                 4 步互動式配置精靈
wit setup local-asr      全離線 Whisper（uv + faster-whisper，約 500MB，:8791）
wit local-asr live setup 全離線即時字幕（sherpa-onnx，約 190MB，:8792）
WHISPER_BASE_URL         任意 OpenAI 相容 STT 端點
GROQ_API_KEY             whisper-large-v3-turbo
OPENAI_API_KEY           whisper-1 詞級時間戳
WIT_ASR_PROMPT           熱詞偏置（或 wit config asr-prompt …）
ZHIPU_API_KEY            可選 GLM-4 --correct / --associate
WIT_NO_BODIES=1          不抓 HTTP 回應體（敏感應用）
WIT_TELEMETRY=0          關閉匿名 CLI 統計（或 wit config telemetry off）
WIT_CDP=<埠>             開放 CDP 口，agent 可親自接管錄製瀏覽器`,
    },
    s3: {
      k: "03 · 使用",
      h: "三句話，就是完整閉環。",
      termLbl: "你和 agent 的對話",
      conv: `<span class="c-say">你</span>    → "幫我錄一段 http://localhost:5173"\n<span class="c-ok">agent</span> → <span class="c-dim">執行 \`wit start\`，託管瀏覽器彈出</span>\n\n<span class="c-say">你</span>    → <span class="c-dim">正常體驗產品，看到什麼說什麼，順手標記問題</span>\n<span class="c-say">你</span>    → <span class="c-dim">點工具列 ■（或按 Alt+Shift+R）</span>\n\n<span class="c-say">你</span>    → "按剛才錄的把問題修了"\n<span class="c-ok">agent</span> → <span class="c-dim">先讀 SEGMENTS.md → 複述問題清單 → 你確認後照證據修復</span>`,
      c1n: "你的部分 —— 在瀏覽器裡",
      c1t: "說 + 指",
      c1pre: `說話              每句觀察 → 帶時間戳的 SAY
Ctrl+點擊         標記元素（selector + 元件鏈 + 紅框截圖）
M                 檢視模式：懸停點選，或拖曳圈選區域
N                 切分顯式問題邊界（可選）
P                 暫停/繼續——全證據、網路、日誌與麥克風徹底凍結
■ / Alt+Shift+R   停止並寫入證據包`,
      c2n: "agent 的部分 —— CLI 全表面",
      c2t: "全部 wit 命令",
      c2pre: `wit start <url>       開錄（--lang --asr --keyframes --dsf --shot-format）
wit init              4 步互動式配置精靈
wit doctor            環境健檢：瀏覽器、即時 ASR、轉寫與權限
wit list / open       瀏覽錄製列表 / 跨平台開啟 review.html
wit segments <dir>    重建 SEGMENTS.md + segments/NN.md
wit keyframes <dir>   rrweb 渲染每段關鍵幀圖片
wit transcribe <dir>  重跑終稿轉寫
wit correct/associate 可選 LLM 糾錯與證據語義關聯
wit recover <dir>     崩潰或中斷後從 events.jsonl 重建全部產物
wit mcp [dir]         啟動 15 工具 stdio MCP server
wit config …          asr | lang | asr-prompt | telemetry
wit setup local-asr / wit local-asr start|stop|status|models|live`,
    },
    s4: {
      k: "04 · 你得到什麼",
      h: "一個證據包，兩種讀者。",
      lede: "<b>給人</b>：可篩選、可勾選的互動回放工作台。<b>給 agent</b>：按需可查的結構化因果證據。",
      treeLabel: ".witness/sessions/<時間戳>/",
      tree: `├─ <span class="c-acc">review.html</span>      <span class="c-dim">→ 給人看 —— 回放工作台：DOM/截圖雙切 + 搜尋過濾 + 勾選定向 Copy for AI</span>
├─ <span class="c-ok">SEGMENTS.md</span>      <span class="c-dim">→ 給 agent —— 語音段索引（先讀；語義歸組由 agent 完成）</span>
├─ <span class="c-ok">segments/NN.md</span>   <span class="c-dim">→ 給 agent —— 每段一包：原話 + 死點擊 + 報錯 + 截圖引用</span>
├─ <span class="c-ok">keyframes/</span>       <span class="c-dim">→ rrweb 回放渲染的每段關鍵幀（wit keyframes）</span>
├─ <span class="c-ok">PROMPT.md</span>        <span class="c-dim">→ 給 agent —— 交接規範與頁面詞表</span>
├─ <span class="c-ok">session.md</span>       <span class="c-dim">→ 給 agent —— 全量因果爆發鏈時間軸檔案</span>
├─ events.jsonl     <span class="c-dim">→ 崩潰安全的逐行原始事件流</span>
├─ transcript.json  <span class="c-dim">→ 終稿轉寫與句級時間戳</span>
├─ audio.webm       <span class="c-dim">→ 可精準 seek 的錄音本體</span>
├─ shots/           <span class="c-dim">→ 截圖——標記紅框、點擊裁切、週期幀</span>
├─ bodies/          <span class="c-dim">→ HTTP 回應體（超 64KB 保留頭部並標註 truncated）</span>
├─ dom/             <span class="c-dim">→ 導覽/標記/每 30s 的完整 DOM 快照</span>
├─ rrweb.jsonl      <span class="c-dim">→ 全量 DOM 回放流</span>
└─ session.json     <span class="c-dim">→ 中繼資料：url、時長、視口、語言、ASR 引擎、計數</span>`,
      c1d: "給任意 agent 的交接說明書。教它讀格式：因果縮排、「無反應也是證據」、元件鏈定位、沒有 SAY 不許猜意圖。",
      c2d: "全量因果時間軸檔案。每個 <code>SAY</code> 區塊帶你的原話 + 那一秒頁面發生的一切。",
      c3d: "將 session 暴露為 stdio MCP server，共 15 個工具：<code>list_segments</code> · <code>segment_detail</code> · <code>session_overview</code> · <code>list_says</code> · <code>session_md</code> · <code>events_around</code> · <code>get_errors</code> · <code>get_shot</code> · <code>get_dom_state</code> · <code>get_body</code> · <code>get_audio</code> · <code>get_transcript</code> · <code>search_events</code> · <code>get_asr</code> · <code>set_asr</code>。",
    },
    s5: {
      k: "05 · 怎麼對 AI 說",
      h: "三種方式把證據交出去。",
      c1n: "最省事",
      c1t: "指個路徑",
      c1pre: `"我錄了一段，證據在\n.witness/sessions/<ts>，\n先讀 SEGMENTS.md 複述問題清單再修。"`,
      c2n: "在 REVIEW.HTML 定向打包",
      c2t: "勾選問題 + 客製 Copy for AI",
      c2d: "開啟 <code>review.html</code>，只勾選本次想修的問題卡片，補充一句額外要求，選擇 <code>Selected Issues</code> / <code>Current Moment (±5s)</code> / <code>Full PROMPT.md</code> 一鍵複製。",
      c3n: "常駐用法",
      c3t: "接入 15 工具 MCP",
      c3d: "agent 按需拉取音訊、截圖、DOM 與時間窗事件，還能自己切換本機/雲端 ASR 引擎。",
      foot: `反過來讓 agent <b>去錄</b>：<code>"用 witness 錄一下 http://localhost:5173，我會邊說邊指出問題"</code>。開了 <code>WIT_CDP</code> 之後，agent 甚至可以<b>親自當測試者</b>在錄製中的瀏覽器裡操作。`,
    },
    s6: {
      k: "06 · 兩分鐘上手",
      h: "拿演示頁開錄。",
      lede: "官網自帶一個故意做壞的小產品——死按鈕 Pay、404 優惠碼介面、console 報錯，全都等著被抓：",
      termComment: "# 點 Pay 說「點了沒反應」，點 Apply 觸發 404，按 ■ → wit open 看回放工作台",
      btnDemo: "開啟演示頁 ↗",
      btnBack: "← 回首頁",
    },
  },

  ja: {
    pageTitle: "Witness ドキュメント — インストール、設定、録画、エージェント連携",
    pageDesc: "Witness CLI（wit）リファレンス：インストール、wit init、グローバル/プロジェクト設定、完全オフライン ASR、エビデンス構造、15 の MCP ツール。",
    headTitle: "あなたが話す。エージェントがコマンドを叩く。",
    headLede: "完全リファレンスマニュアル——インストール、パラメータ設定、録画操作、パケット構造、15 ツール MCP 連携。",
    chapters: [
      ["01", "インストール", "#install2"], ["02", "設定", "#config"], ["03", "使い方", "#use"],
      ["04", "パケット", "#output"], ["05", "エージェントへ", "#agent"], ["06", "試す", "#try"],
    ],
    rulers: ["docs", "設定", "録画", "パケット", "引き継ぎ", "デモ"],
    s1: {
      k: "01 · インストール",
      h: "あなたが入れるのではなく、エージェントが入れます。",
      lede: "基本の流れ：<b>あなたが指示し、エージェントがコマンドを叩きます</b>。Witness は単一 CLI（<code>wit</code> / <code>rec</code>）でシステムの Edge/Chrome を駆動（無い場合のみ同梱 Chromium）——アカウント・キー不要。",
      term1Lbl: "エージェントにこう言う",
      term1: "witness をインストール：`npm i -g witness-recorder` を実行し、\n`wit doctor` で環境を確認して。Node 18+ が必要です。",
      c1t: "マシンに入るもの",
      c1d: "<b><code>wit</code> CLI</b> —— レコーダー、<code>review.html</code> ワークベンチ、文字起こし、15 ツール MCP server が一体。マシン設定はグローバル <code>~/.witness/config.json</code>、プロジェクト固有ホットワードは <code>.witness/config.json</code>、エビデンスは <code>.witness/sessions/</code> に保存されます。",
      c2t: "Witness を知らないエージェントに教える",
      c2d: "同梱の <code>skills/witness/SKILL.md</code> を <code>CLAUDE.md</code> / <code>.cursor/rules/</code> / <code>AGENTS.md</code> に置けば、「録画して」の一言で全フローが起動します。",
      c2link: "SKILL.md を見る ↗",
      term2Lbl: "エージェントが実際に実行するコマンド",
      term2Comment: "# 内部で実行されるコマンド：",
    },
    s2: {
      k: "02 · パラメータと設定",
      h: "既定はゼロ設定。必要な時だけ自在に切替。",
      lede: "<code>wit init</code> の 4 ステップウィザードを使うか、下のインタラクティブ設定でコマンドと MCP を即時生成：",
      c1t: "ライブ ASR と設定スコープ",
      c1d: "<code>wit config asr</code> / <code>lang</code> / <code>telemetry</code> はグローバル <code>~/.witness/config.json</code> へ、<code>asr-prompt</code> はプロジェクト <code>.witness/config.json</code> へ保存。実行時は <code>--asr</code> / <code>--lang</code> または MCP <code>set_asr</code> で上書き可能。",
      c1pre: `auto         local(導入済なら優先) → doubao-web → doubao-ime → sr
local        完全オフライン sherpa-onnx ライブ字幕（約 190MB、中英）
doubao-web   無料クラウド、句読点最良（既定）
doubao-ime   無料クラウド IME、文単位タイムスタンプ
sr           ブラウザ SpeechRecognition（端末内フォールバック）
off          ライブ字幕なし（録音と最終文字起こしは実行）`,
      c2t: "最終文字起こしチェーンと環境変数",
      c2d: "キー無しでも動作——zh/auto はライブ文字起こし（カバー率 ≥75%）を再利用、または無料クラウド（<code>doubao-web → bcut</code>）へフォールバック：",
      c2pre: `wit init                 4 ステップ対話式設定ウィザード
wit setup local-asr      オフライン Whisper（uv + faster-whisper、約 500MB、:8791）
wit local-asr live setup オフラインライブ字幕（sherpa-onnx、約 190MB、:8792）
WHISPER_BASE_URL         任意の OpenAI 互換 STT エンドポイント
GROQ_API_KEY             whisper-large-v3-turbo
OPENAI_API_KEY           whisper-1 単語タイムスタンプ
WIT_ASR_PROMPT           ホットワード（または wit config asr-prompt …）
ZHIPU_API_KEY            任意 GLM-4 --correct / --associate
WIT_NO_BODIES=1          レスポンスボディ取得を無効化
WIT_TELEMETRY=0          匿名 CLI 統計を無効化（または wit config telemetry off）
WIT_CDP=<ポート>         CDP 公開（エージェントが録画中ブラウザを操作可能）`,
    },
    s3: {
      k: "03 · 使い方",
      h: "3文。それがループの全部です。",
      termLbl: "エージェントとの会話",
      conv: `<span class="c-say">あなた</span>   → "http://localhost:5173 を録画して"\n<span class="c-ok">agent</span> → <span class="c-dim">\`wit start\` を実行、管理ブラウザが開く</span>\n\n<span class="c-say">あなた</span>   → <span class="c-dim">普通にプロダクトを使い、気づいたことを話して問題をマーク</span>\n<span class="c-say">あなた</span>   → <span class="c-dim">ツールバーの ■（または Alt+Shift+R）</span>\n\n<span class="c-say">あなた</span>   → "さっきの録画の問題を直して"\n<span class="c-ok">agent</span> → <span class="c-dim">SEGMENTS.md を読み → 問題リスト確認 → エビデンスに沿って修正</span>`,
      c1n: "あなたの役目 —— ブラウザ内",
      c1t: "話す + 指す",
      c1pre: `話す              すべての気づき → タイムスタンプ付き SAY
Ctrl+クリック     要素をマーク（selector + コンポーネント + 赤枠ショット）
M                 inspect モード：ホバー選択 / ドラッグ範囲指定
N                 新しい問題の境界（任意）
P                 一時停止/再開——全イベント・通信・マイクを完全凍結
■ / Alt+Shift+R   停止してパケットを保存`,
      c2n: "エージェントの役目 —— CLI 一覧",
      c2t: "全 wit コマンド",
      c2pre: `wit start <url>       録画開始（--lang --asr --keyframes --dsf --shot-format）
wit init              4 ステップ設定ウィザード
wit doctor            環境診断：ブラウザ・ASR・文字起こし・権限
wit list / open       セッション一覧 / review.html を開く
wit segments <dir>    SEGMENTS.md + segments/NN.md を再生成
wit keyframes <dir>   rrweb からセグメント別キーフレーム生成
wit transcribe <dir>  最終文字起こしを再実行
wit correct/associate 任意 LLM 仕上げと関連付け
wit recover <dir>     クラッシュ後に events.jsonl から再構築
wit mcp [dir]         15 ツール stdio MCP server を起動
wit config …          asr | lang | asr-prompt | telemetry
wit setup local-asr / wit local-asr start|stop|status|models|live`,
    },
    s4: {
      k: "04 · 得られるもの",
      h: "ひとつのパケット、ふたつの読者。",
      lede: "<b>あなたへ</b>：検索・選択できるリプレイワークベンチ。<b>エージェントへ</b>：オンデマンド照会できる構造化エビデンス。",
      treeLabel: ".witness/sessions/<タイムスタンプ>/",
      tree: `├─ <span class="c-acc">review.html</span>      <span class="c-dim">→ 人間向け —— ワークベンチ：DOM/スクショ切替 + 検索 + 選択式 Copy for AI</span>
├─ <span class="c-ok">SEGMENTS.md</span>      <span class="c-dim">→ エージェント向け —— 発話セグメント索引（最初に読む）</span>
├─ <span class="c-ok">segments/NN.md</span>   <span class="c-dim">→ エージェント向け —— セグメント別バンドル（逐語+死んだクリック+エラー+ショット）</span>
├─ <span class="c-ok">keyframes/</span>       <span class="c-dim">→ rrweb レンダリング再生フレーム（wit keyframes）</span>
├─ <span class="c-ok">PROMPT.md</span>        <span class="c-dim">→ エージェント向け —— 引き継ぎルール＋ページ語彙</span>
├─ <span class="c-ok">session.md</span>       <span class="c-dim">→ エージェント向け —— 完全な因果バーストタイムライン</span>
├─ events.jsonl     <span class="c-dim">→ クラッシュ耐性の生イベントストリーム</span>
├─ transcript.json  <span class="c-dim">→ 最終文字起こし（セグメント時刻付き）</span>
├─ audio.webm       <span class="c-dim">→ シーク可能な元録音</span>
├─ shots/           <span class="c-dim">→ 赤枠マーク・クリック切り抜き・定期スクリーンショット</span>
├─ bodies/          <span class="c-dim">→ HTTP レスポンスボディ（64KB 超は先頭保持＋truncated 記録）</span>
├─ dom/             <span class="c-dim">→ 遷移/マーク/30s ごとの DOM スナップショット</span>
├─ rrweb.jsonl      <span class="c-dim">→ フル DOM リプレイストリーム</span>
└─ session.json     <span class="c-dim">→ メタ：url・時間・viewport・言語・ASR・件数</span>`,
      c1d: "初めて使うエージェント向けの引き継ぎガイド。因果インデント、「無反応もエビデンス」、コンポーネント特定、SAY 無しに意図を推測しないルールを記載。",
      c2d: "完全な因果タイムライン。各 <code>SAY</code> ブロックに逐語と、その瞬間に起きた全イベントが紐付きます。",
      c3d: "セッションを stdio MCP server として提供——全 15 ツール：<code>list_segments</code> · <code>segment_detail</code> · <code>session_overview</code> · <code>list_says</code> · <code>session_md</code> · <code>events_around</code> · <code>get_errors</code> · <code>get_shot</code> · <code>get_dom_state</code> · <code>get_body</code> · <code>get_audio</code> · <code>get_transcript</code> · <code>search_events</code> · <code>get_asr</code> · <code>set_asr</code>。",
    },
    s5: {
      k: "05 · エージェントへの伝え方",
      h: "エビデンスを渡す3つの方法。",
      c1n: "いちばん簡単",
      c1t: "ディレクトリを指す",
      c1pre: `"録画しました。エビデンスは\n.witness/sessions/<ts> にあります。\nまず SEGMENTS.md を読んで問題リストを確認してください。"`,
      c2n: "REVIEW.HTML で選択パッケージ",
      c2t: "課題を選択して Copy for AI",
      c2d: "<code>review.html</code> で今直したい課題だけチェックし、補足指示を加えて <code>Selected Issues</code> / <code>Current Moment (±5s)</code> / <code>Full PROMPT.md</code> をワンクリックでコピー。",
      c3n: "常設",
      c3t: "15 ツール MCP を配線",
      c3d: "エージェントが音声・ショット・DOM・時間窓イベントをオンデマンド取得し、ASR エンジン切替も自律実行。",
      foot: `エージェントに<b>録画させる</b>には：<code>"witness で http://localhost:5173 を録画して。問題は口頭で指摘します"</code>。<code>WIT_CDP</code> を設定すれば、エージェント自身が録画中ブラウザの<b>テスター</b>にもなれます。`,
    },
    s6: {
      k: "06 · 2分で試す",
      h: "デモページを録画する。",
      lede: "サイト同梱のわざと壊れたチェックアウト画面——無反応な Pay ボタン、404 クーポン API、console エラーが待っています：",
      termComment: "# Pay を押して「反応しない」と発言 → Apply で 404 → ■ 停止 → wit open",
      btnDemo: "デモアプリを開く ↗",
      btnBack: "← トップへ戻る",
    },
  },
};

export const docsUi = (lang: string): DocsCopy => DOCS[lang] ?? DOCS.en;
