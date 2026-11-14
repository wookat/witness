// 简体中文 — extracted verbatim from the existing zh.astro + component zh dicts.
export default {
  path: "/zh/",
  htmlLang: "zh-CN",
  flag: "简",
  name: "简体中文",
  meta: {
    title: "Witness — 语音锚定的因果证据记录仪，为 AI 编码 agent 设计",
    desc: "像平时一样体验产品、用嘴说出哪里不对。Witness 录下语音、点击、网络、报错与 DOM 回放，产出你的 AI agent 能直接动手的因果证据包。",
  },
  nav: { how: "原理", evidence: "证据", mcp: "MCP", install: "安装", faq: "FAQ", docs: "文档" },
  docsPath: "/zh/docs",
  footer: {
    tagline: "语音锚定的因果证据记录仪——为 AI 编码 agent 设计。本地优先，MIT 开源。",
    selfRec: "本官网用 Witness 录过自己",
    cols: ["产品", "文档", "社区"],
    product: { how: "工作原理", evidence: "证据产出", mcp: "MCP 接入", faq: "常见问题", install: "安装" },
    docs: { usage: "使用文档", readme: "GitHub README", vision: "愿景与路线", releases: "更新记录" },
    community: { github: "GitHub", issues: "问题反馈", license: "MIT 协议", stars: "Star 历史", contact: "联系邮箱" },
    copy: "© 2026 zalize · MIT 协议",
  },
  hero: {
    pill: "开源 · MIT · 本地优先",
    h1a: "你开口，", h1b: "Witness 补全",
    rot: ["证据。", "那个 bug。", "那次卡顿。", "那个 500。", "前因后果。"],
    sub: "像平时一样体验产品、用嘴说出哪里不对——“这个按钮点了没反应”。Witness 把你说的每句话焊死在那一秒的因果证据上，然后把证据包交给你的 AI 编码 agent。",
    cta1: "查看 GitHub", cta2: "工作原理",
    fsay: "“这个按钮点了没反应”",
    insthint: "↑ 丢给你的 AI agent——它装完就能帮你录",
    instmeta: "装的是 wit CLI——录制·渲染·MCP 一体 · Node 18+ · 系统 Edge/Chrome · 免 key",
  },
  video: { tag: "PLAYWRIGHT 实录 · 一镜到底", say: "点了没反应", vocab: "订单/提交/支付" },
  convo: {
    you: "你",
    msgs: [
      ["y", "安装 witness"],
      ["a", "npm i -g witness-recorder", "ok"],
      ["y", "帮我录一段 http://localhost:5173"],
      ["a", "wit start ✓ · 托管浏览器弹出，等你说问题", "ok"],
      ["n", "你正常使用产品——看到什么说什么，标记问题，点 ■"],
      ["y", "按刚才录的把问题修了"],
      ["a", "读 session.md → 复述问题清单 → 你确认 → 修复", "ok"],
    ],
  },
  problem: {
    k: "01 · 问题",
    h: "Agent 看不到你眼睛看到的。",
    p: "人一眼就能注意到“这个按钮滚动时收缩得很奇怪”，但把这个感受写给 AI agent，要十分钟截图、圈元素、组织 prompt——写出来的东西还是丢掉了<i>为什么</i>。说话是最便宜的标注通道，只是从来没有人给它做过记录仪。",
  },
  demoSec: {
    k: "02 · 实录",
    h: "一次点击，全部后果归档。",
    p: "一次录制的完整过程——说话、标记、点了没反应的按钮、保存。下面的 Pay 按钮点了<b>什么都没发生</b>，而这个“没有发生”被如实记为证据。",
  },
  stats: ["条记录线", "个 MCP 工具", "云端 key 依赖", "项测试通过", "开源协议"],
  how: {
    k: "03 · 工作原理",
    h: "三条记录线，一条时间轴。",
    p: "<code>wit start &lt;dev-url&gt;</code> 打开一个托管浏览器。从那一刻起三条流并行记录——零手动：",
    cards: [
      ["mic", "01 / 语音", "你说的话", "全程录音 + <b>真流式 ASR</b>（doubao-web → doubao-ime → 浏览器 SR 自动兜底）。工具栏下实时出字幕——想到什么说什么，一段话可以报多个问题。"],
      ["zap", "02 / 操作", "操作 + 因果爆发链", "每次点击捕获随后 ~1.8s 的后果：请求、响应、console 报错、DOM 变化。点击后什么都没发生，本身就是证据。"],
      ["layers", "03 / 状态", "页面演变", "rrweb 全量 DOM 回放 + 事件驱动截图 + 周期 DOM 快照。任何一秒的页面状态都能倒回去看。"],
    ],
  },
  flow: [["wit start", "<url>", true], ["浏览 + 说话", "", false], ["Ctrl+点 / M 标记", "", false], ["■ 停止", "", false], ["证据包", "", true]],
  keys: {
    cap: "全部遥控器——就这么多。",
    items: [
      [["说", "+", "浏览"], "想到什么说什么——这是主输入"],
      [["Ctrl", "+", "点击"], "标记元素：selector + 组件链 + 红框截图"],
      [["M"], "inspect 模式：悬停点选，或拖拽圈选区域"],
      [["N"], "切一个新问题边界——一段录多个问题"],
      [["P"], "暂停/继续：暂停期证据与麦克风全冻结"],
      [["■", "/", "Alt+Shift+R"], "停止，落盘整个证据包"],
    ],
  },
  evidence: {
    k: "04 · 产出",
    h: "你的话，变成证据锚点。",
    p: "每段语音成为时间轴上的一个块，挂载该时刻的因果事实——“因果爆发链”。点开一句话看看：",
    hint: "点击一句话展开它的证据",
    says: [
      {
        t: "00:09", quote: "这个按钮滚动的时候会收缩变淡",
        ev: [["SCROLL", "y=3936", "dim"], ["MUT", "button.feedback · data-collapsed: false → true", "acc2"], ["MUT", "button.feedback · data-collapsed: true → false", "acc2"]],
        note: "属性在边界处来回抖动", ui: "scroll",
      },
      {
        t: "00:34", quote: "这个提交按钮点了没反应",
        ev: [["CLICK", "button#submit “提交” · @482,701", "ok"]],
        note: "点击后 1.8s 页面无任何反应——这本身就是证据", ui: "btn",
      },
      {
        t: "01:02", quote: "订单接口返回的数据不对",
        ev: [["CLICK", "a[href=\"/orders\"] “订单”", "ok"], ["NET →", "GET /api/orders?page=1", "dim"], ["NET ←", "200 /api/orders · items: []", "bad"]],
        note: "响应体已捕获 → bodies/req_0041.json", ui: "api",
      },
    ],
  },
  aud: {
    k: "05 · 两种受众", h: "人看回放，Agent 读结构。", labels: ["给人看", "给 AI agent"],
    humans: [
      ["review.html", "语音卡片 + 音频跳转 + 截图", { img: "/sample/review.png", cap: "真实的 review.html —— 就是录这个官网产出的那次" }],
      ["▶ DOM 回放", "内嵌 rrweb 播放器，真实页面状态", { img: "/sample/review.png", cap: "review.html 内置的 rrweb 回放区" }],
      ["film strip", "像拖视频一样刷整场录制", { img: "/sample/review.png", cap: "底部胶片条 scrubber" }],
      ["audio.webm", "原始录音", { img: "/sample/review.png", cap: "语音卡片点哪句播哪句" }],
    ],
    agents: [
      ["PROMPT.md", "交接说明 + 页面词表", { pre: `This is a product-feedback session recorded by Witness (voice + clicks + live page evidence).

Process in this order:
1. Read SEGMENTS.md — an index of N speech-anchored segments; verbatim speech + suspects + shots in segments/NN.md
2. Restate the user's issues as a checklist (grouped by you), confirm BEFORE fixing:
   | # | time | user said (verbatim) | your understanding | linked evidence |
3. After confirmation, fix each — locate code via selector / React component name
4. For anything unfixable, state the reason and the extra evidence needed`, cap: "真实 PROMPT.md 节选——产物是英文的，你的原话逐字保留" }],
      ["session.md", "因果证据时间轴", { pre: `### 00:17 · SAY
> [00:17] "就比如说这个淋巴的话"
> [00:19] "这个交互啊"
> [00:21] "AI 硬件的交互我觉得有问题"
- 00:24 CLICK #install > div.term > pre "你 → "安装 witness"…"
  - 00:24 MUT #rot attr class: rot → rot out`, cap: "真实 session.md 节选——SAY 下挂该时刻的证据" }],
      ["events.jsonl", "全量原始事件流，崩了也保住", { pre: `{"kind":"req","id":1,"url":"https://witness.zalize.com/zh/","method":"GET","resType":"document","t":605}
{"kind":"nav","url":"https://witness.zalize.com/zh/","t":1413}
{"kind":"click","selector":"#install > div.term > pre","text":"你 → 安装 witness","x":1106,"y":595,"t":24483}`, cap: "events.jsonl 逐行流式落盘" }],
      ["dom/ · bodies/ · shots/", "快照、响应体、截图帧", { img: "/sample/shot.jpg", cap: "shots/ 里的真实截图帧（录制中自动截取）" }],
    ],
  },
  mcp: {
    k: "06 · 拉取，不是推送",
    h: "<code>wit mcp</code>——把证据变成 API。",
    p: "session 不是一坨死文件，而是一个 stdio MCP server。接进任何支持 MCP 的 agent，它按需查询精确的证据：",
    cards: [
      ["file", "<code>list_says</code>", "全部语音片段 + 时间戳——问题锚点。"],
      ["clock", "<code>events_around</code>", "按时间窗+类型过滤的原始事件。"],
      ["layers", "<code>get_dom_state</code>", "离某个时间点最近的完整 DOM。"],
      ["zap", "<code>get_errors</code>", "console 报错、页面异常、HTTP ≥400。"],
      ["box", "<code>get_shot / get_body</code>", "按需取截图帧和响应体。"],
      ["api", "<code>session_md</code>", "要全文时返回渲染好的时间轴。"],
      ["mic", "<code>get_asr / set_asr</code>", "agent 自己查、自己切语音引擎——配置环里不需要人。"],
    ],
    mcap: "……共 14 个注册工具——session 是可查询的 API，不是一坨死文件。",
  },
  agents: {
    k: "07 · 接入你的 agent",
    h: "贴进去，或者插上来。",
    lede: "证据包自描述、零厂商锁定。两条路，按 agent 能力选：",
    c1t: "PROMPT.md → 粘贴",
    c1d: "每个 session 自带交接文件：格式说明、页面词表、修复规则。贴进任何会跑命令的 agent——它就知道该怎么读证据、先复述清单再动手。",
    c2t: "wit mcp → 接入",
    c2d: "支持 MCP 的 agent 直接连 stdio server：14 个工具按需挖证据，不用把整包塞进上下文。仓库还自带 SKILL.md——支持 skill 的 agent 原生加载，其他可以当规则文件用。",
    works: "适配",
    agents: ["Devin", "Claude Code", "Cursor", "Codex", "Windsurf", "任何 MCP 客户端"],
  },
  principles: {
    k: "08 · 原则",
    h: "证据不说谎。",
    cards: [
      ["terminal", "本地优先，零配置", "系统 Edge/Chrome + 免费流式 ASR（doubao-web → doubao-ime → 浏览器 SR 兜底，<code>wit config asr</code> 可切）。不需要任何 API key；LLM 只是可选增强层，永远不是主流程。"],
      ["file", "原话不改写", "你的语音逐字落进 events.jsonl。合并、纠错、语义关联都只是展示层建议——原始证词永远可审计。"],
      ["eye", "证据 ≠ 意图", "点击和滚动是事实不是抱怨。没有语音锚点时，明确告诉 agent：永远不要从行为推断 bug。"],
      ["shield", "隐私工程化", "密码字段四通道打码；POST 体自动脱敏凭证字段；P 暂停期全部冻结包括麦克风；敏感应用可用 <code>WIT_NO_BODIES</code>。"],
    ],
  },
  vs: {
    k: "09 · 为什么不直接……",
    h: "录屏记下像素，Witness 记下因果。",
    lede: "手写一份 bug 报告也行，发段录屏也行。各自落到哪一步：",
    cols: ["", "手写的报告", "一段录屏", "Witness"],
    rows: [
      ["报一个问题的成本", "≈10 分钟：截图、圈选、组织语言", "几分钟——但每次回放都要重看", "说一句话，证据已挂好"],
      ["agent 能直接修吗", "只覆盖你记得写下的", "全是像素，需要人重新推导", "session.md + events.jsonl + MCP"],
      ["“点了没反应”", "容易漏写", "视频里根本看不出来", "显式记为证据"],
      ["点击的因果后果", "—", "—", "~1.8s 内 请求/响应/console/DOM"],
      ["回到那一秒的页面", "—", "视频 ≠ DOM", "rrweb 全量回放"],
      ["数据留在本地", "—", "看传到了哪", "永远在 .witness/sessions"],
    ],
    ph2: "……以及和那些你真正会用的工具比：",
    pcols: ["", "Jam", "Replay.io", "Loom", "Replay SaaS*", "Witness"],
    prows: [
      ["语音 → 锚定证据", "◐ 视频配音", "—", "◐ 旁白", "—", "原话逐字，焊进事件"],
      ["为 AI agent 而造", "◐ AI 生成 repro + MCP", "✓ MCP + 时间旅行", "—", "—", "session.md + PROMPT.md + 14 工具 MCP"],
      ["console / 网络", "✓", "✓ runtime 级", "—", "✓", "✓ + 因果爆发链、死点击"],
      ["回放深度", "视频 · 2 分钟 DOM", "runtime 时间旅行——最深", "视频", "✓ DOM 回放", "✓ rrweb 全量 DOM"],
      ["留在你磁盘上", "— 上传 + 要账号", "— 上传", "— 上传", "— SaaS", "✓ .witness/sessions，零账号"],
      ["产品侧零安装", "◐ 浏览器扩展", "◐ 专用浏览器", "✓", "— 需埋 SDK", "✓ 任意 URL"],
      ["开源", "—", "◐ 仅 devtools", "—", "—", "✓ MIT"],
    ],
    pnote: "*Replay SaaS = LogRocket / FullStory 一类。来源：各家公开文档，2026-11——如有过时请告诉我们。",
  },
  who: {
    k: "10 · 谁在用",
    h: "给所有“眼睛就是最后一道 QA”的人。",
    cards: [
      ["cursor", "独立开发 × agent", "你写的你点一遍，边点边说。agent 拿到的是可直接动手的证据包——从发现到修复不出一个 session。"],
      ["eye", "视觉与动效走查", "卡顿、闪烁、布局跳动——截图永远说不清的东西。说出哪里动了，DOM 变化已经挂好了。"],
      ["file", "QA 与产品验收", "一个功能一条 take，<code>N</code> 键切问题边界。session 交给 agent，或者把 <code>review.html</code> 挂进工单。"],
      ["api", "开源维护者", "让报 bug 的人发一段 <code>wit</code> 录制，而不是一张截图：selector、console、网络请求一次到齐。"],
    ],
  },
  faq: {
    k: "11 · 常见问题",
    h: "你想问的，先答了。",
    items: [
      ["需要装什么？", "Node 18+ 和系统 Edge/Chrome——优先用你机器上的真浏览器，找不到才装自带 chromium。<code>npm i -g witness-recorder</code>，完事。"],
      ["有什么数据会离开本机？", "证据包全部落在本地 <code>.witness/sessions/</code>（自动 gitignore）。实时字幕按你选的引擎流式发麦克风音频（默认 doubao-web）；<code>--asr sr</code> 走系统/浏览器识别，<code>--asr off</code> 直接不要实时字幕。终稿转写走 bcut（免费）或你自己的 OPENAI_API_KEY 走 whisper——<code>--no-transcribe</code> 可全跳过。LLM 纠错/关联只有显式传 flag 且有 key 才跑。"],
      ["支持哪些 agent？", "能跑 CLI 的 agent 就能读 session.md + PROMPT.md。支持 MCP 的（Devin、Claude Code、Cursor、Codex……）直连 <code>wit mcp</code>——14 个查询工具按需挖证据，而不是一次性塞全文。仓库自带的 SKILL.md 在支持 skill 的 agent 上原生加载，其余可当规则文件。"],
      ["密码出现在页面里怎么办？", "密码字段四通道打码；POST 体自动脱敏凭证字段；<code>P</code> 随时全冻结（含麦克风）；敏感应用设 <code>WIT_NO_BODIES=1</code> 直接不存响应体。"],
      ["可以说什么语言？", "识别语言默认跟随浏览器/系统语言——<code>--lang &lt;bcp47&gt;</code>（如 en-US、ja-JP）按次覆盖。原话永远逐字落盘——识别错字保留可审计，LLM 纠错只是可选的展示层。"],
      ["只能录 localhost 吗？", "任何 URL——托管浏览器就是你的真实浏览器，登录照样用。不过在本地开发站上最锋利：agent 修的时候能同时看到源码。"],
      ["录到一半崩了 / 被我杀了，全没了吗？", "events.jsonl 逐行流式落盘，最多丢最后几百毫秒。<code>wit recover &lt;dir&gt;</code> 随时从事件流重建 session.md、review.html、PROMPT.md。"],
      ["收费吗？", "MIT 开源，无账号、无必需 key。免费 ASR 是默认链路；付费模型全是自带 key 的可选增强。"],
    ],
    contact: `还有问题？→ <a href="mailto:wookat@qq.com">wookat@qq.com</a>，或直接 <a href="https://github.com/wookat/witness/issues" target="_blank" rel="noopener">提 Issue</a>——欢迎来问。`,
  },
  install: {
    k: "12 · 上手",
    h: "三句话，跑通整个闭环。",
    p: "你下指令，<b>agent 敲命令</b>。Witness 本体是 CLI（<code>wit</code>）——agent 驱动它开托管浏览器录制，结束后产出本地证据包：人看 <code>review.html</code>，agent 走 <code>session.md</code>/<code>PROMPT.md</code>/<code>wit mcp</code>。Node 18+、系统 Edge/Chrome、不上云、不要 key。",
    cta1: "★ 去 GitHub 点 Star",
    cta2: "读使用文档 ↗",
  },
  docsPill: "使用文档",
};
