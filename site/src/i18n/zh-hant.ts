// 繁體中文（zh-Hant，中性寫法，不偏向台灣/港澳任一地區用語）。
export default {
  path: "/zh-hant/",
  htmlLang: "zh-Hant",
  flag: "繁",
  name: "繁體中文",
  meta: {
    title: "Witness — 語音錨定的因果證據記錄儀，為 AI 編碼 agent 設計",
    desc: "像平時一樣體驗產品、用嘴說出哪裡不對。Witness 錄下語音、點擊、網路、錯誤與 DOM 回放，產出你的 AI agent 能直接動手的因果證據包。",
  },
  nav: { how: "原理", evidence: "證據", mcp: "MCP", install: "安裝", faq: "FAQ", docs: "文件" },
  docsPath: "/zh-hant/docs",
  footer: {
    tagline: "語音錨定的因果證據記錄儀——為 AI 編碼 agent 設計。本機優先，MIT 開源。",
    selfRec: "本官網用 Witness 錄過自己",
    cols: ["產品", "文件", "社群"],
    product: { how: "運作原理", evidence: "證據產出", mcp: "MCP 接入", faq: "常見問題", install: "安裝" },
    docs: { usage: "使用文件", readme: "GitHub README", vision: "願景與路線", releases: "更新記錄" },
    community: { github: "GitHub", issues: "問題回報", license: "MIT 授權", stars: "Star 歷史" },
    copy: "© 2026 zalize · MIT 授權",
  },
  hero: {
    pill: "開源 · MIT · 本機優先",
    h1a: "你開口，", h1b: "Witness 補全",
    rot: ["證據。", "那個 bug。", "那次卡頓。", "那個 500。", "前因後果。"],
    sub: "像平時一樣體驗產品、用嘴說出哪裡不對——「這個按鈕點了沒反應」。Witness 把你說的每句話焊死在那一秒的因果證據上，然後把證據包交給你的 AI 編碼 agent。",
    cta1: "查看 GitHub", cta2: "運作原理",
    fsay: "「這個按鈕點了沒反應」",
    insthint: "↑ 丟給你的 AI agent——它裝完就能幫你錄",
    instmeta: "裝的是 wit CLI——錄製·渲染·MCP 一體 · Node 18+ · 系統 Edge/Chrome · 免 key",
  },
  video: { tag: "PLAYWRIGHT 實錄 · 一鏡到底", say: "點了沒反應", vocab: "訂單/提交/支付" },
  convo: {
    you: "你",
    msgs: [
      ["y", "安裝 witness"],
      ["a", "npm i -g github:wookat/witness", "ok"],
      ["y", "幫我錄一段 http://localhost:5173"],
      ["a", "wit start ✓ · 託管瀏覽器彈出，等你說問題", "ok"],
      ["n", "你正常使用產品——看到什麼說什麼，標記問題，點 ■"],
      ["y", "按剛才錄的把問題修了"],
      ["a", "讀 session.md → 複述問題清單 → 你確認 → 修復", "ok"],
    ],
  },
  problem: {
    k: "01 · 問題",
    h: "Agent 看不到你眼睛看到的。",
    p: "人一眼就能注意到「這個按鈕捲動時收縮得很奇怪」，但把這個感受寫給 AI agent，要十分鐘截圖、圈元素、組織 prompt——寫出來的東西還是丟掉了<i>為什麼</i>。說話是最便宜的標註通道，只是從來沒有人幫它做過記錄儀。",
  },
  demoSec: {
    k: "02 · 實錄",
    h: "一次點擊，全部後果歸檔。",
    p: "這是一段真實錄製——說話、標記、點了沒反應的按鈕、儲存。下面的 Pay 按鈕點了<b>什麼都沒發生</b>，而這個「沒有發生」被如實記為證據。",
  },
  stats: ["條記錄線", "個 MCP 工具", "雲端 key 依賴", "項測試通過", "開源授權"],
  how: {
    k: "03 · 運作原理",
    h: "三條記錄線，一條時間軸。",
    p: "<code>wit start &lt;dev-url&gt;</code> 打開一個託管瀏覽器。從那一刻起三條流並行記錄——零手動：",
    cards: [
      ["mic", "01 / 語音", "你說的話", "全程錄音 + <b>真串流 ASR</b>（doubao-web → doubao-ime → 瀏覽器 SR 自動備援）。工具列下即時出字幕——想到什麼說什麼，一段話可以報多個問題。"],
      ["zap", "02 / 操作", "操作 + 因果爆發鏈", "每次點擊擷取隨後 ~1.8s 的後果：請求、回應、console 錯誤、DOM 變化。點擊後什麼都沒發生，本身就是證據。"],
      ["layers", "03 / 狀態", "頁面演變", "rrweb 全量 DOM 回放 + 事件驅動截圖 + 週期 DOM 快照。任何一秒的頁面狀態都能倒回去看。"],
    ],
  },
  flow: [["wit start", "<url>", true], ["瀏覽 + 說話", "", false], ["Ctrl+點 / M 標記", "", false], ["■ 停止", "", false], ["證據包", "", true]],
  keys: {
    cap: "全部遙控器——就這麼多。",
    items: [
      [["說", "+", "瀏覽"], "想到什麼說什麼——這是主輸入"],
      [["Ctrl", "+", "點擊"], "標記元素：selector + 元件鏈 + 紅框截圖"],
      [["M"], "inspect 模式：懸停點選，或拖曳圈選區域"],
      [["N"], "切一個新問題邊界——一段錄多個問題"],
      [["P"], "暫停/繼續：暫停期證據與麥克風全凍結"],
      [["■", "/", "Alt+Shift+R"], "停止，寫入整個證據包"],
    ],
  },
  evidence: {
    k: "04 · 產出",
    h: "你的話，變成證據錨點。",
    p: "每段語音成為時間軸上的一個區塊，掛載該時刻的因果事實——「因果爆發鏈」。點開一句話看看：",
    hint: "點一句話展開它的證據",
    says: [
      {
        t: "00:09", quote: "這個按鈕捲動的時候會收縮變淡",
        ev: [["SCROLL", "y=3936", "dim"], ["MUT", "button.feedback · data-collapsed: false → true", "acc2"], ["MUT", "button.feedback · data-collapsed: true → false", "acc2"]],
        note: "屬性在邊界處來回抖動", ui: "scroll",
      },
      {
        t: "00:34", quote: "這個提交按鈕點了沒反應",
        ev: [["CLICK", "button#submit “提交” · @482,701", "ok"]],
        note: "點擊後 1.8s 頁面無任何反應——這本身就是證據", ui: "btn",
      },
      {
        t: "01:02", quote: "訂單介面回傳的資料不對",
        ev: [["CLICK", "a[href=\"/orders\"] “訂單”", "ok"], ["NET →", "GET /api/orders?page=1", "dim"], ["NET ←", "200 /api/orders · items: []", "bad"]],
        note: "回應內容已擷取 → bodies/req_0041.json", ui: "api",
      },
    ],
  },
  aud: {
    k: "05 · 兩種受眾", h: "人看回放，Agent 讀結構。", labels: ["給人看", "給 AI agent"],
    humans: [
      ["review.html", "語音卡片 + 音訊跳轉 + 截圖", { img: "/sample/review.png", cap: "真實的 review.html —— 就是錄這個官網產生的那次" }],
      ["▶ DOM 回放", "內嵌 rrweb 播放器，真實頁面狀態", { img: "/sample/review.png", cap: "review.html 內建的 rrweb 回放區" }],
      ["film strip", "像拖影片一樣刷整場錄製", { img: "/sample/review.png", cap: "底部膠片條 scrubber" }],
      ["audio.webm", "原始錄音", { img: "/sample/review.png", cap: "語音卡片點哪句播哪句" }],
    ],
    agents: [
      ["PROMPT.md", "交接說明 + 頁面詞表", { pre: `這是 Witness 錄製的一段產品體驗回饋（voice + click + 頁面實況證據鏈）。

請按以下順序處理：
1. 讀 session.md —— 時間軸：每段語音（SAY）下方掛該時刻的 click/mark/net/console/mut 證據
2. 先把使用者指出的問題複述成清單，請使用者確認後再動手——不要直接開修：
   | # | 時間 | 使用者原話 | 你的理解 | 關聯證據 |
   每段 SAY 至少歸進一個問題；一句話含多個問題拆成 1a/1b；理解有歧義的標 ❓
3. 使用者確認後逐條修復：用 selector/元件名在程式碼裡定位
4. 修不了的在回報裡標注原因和需要的補充證據`, cap: "真實 PROMPT.md 節選——要求 agent 先複述清單再修" }],
      ["session.md", "因果證據時間軸", { pre: `### 00:17 · SAY
> [00:17] "就比如說這個頁面的話"
> [00:19] "這個互動啊"
> [00:21] "我覺得這個互動有問題"
- 00:24 CLICK #install > div.term > pre "你 → "安裝 witness"…"
  - 00:24 MUT #rot attr class: rot → rot out`, cap: "真實 session.md 節選——SAY 下掛該時刻的證據" }],
      ["events.jsonl", "全量原始事件流，崩了也保住", { pre: `{"kind":"req","id":1,"url":"https://witness.zalize.com/zh-hant/","method":"GET","resType":"document","t":605}
{"kind":"nav","url":"https://witness.zalize.com/zh-hant/","t":1413}
{"kind":"click","selector":"#install > div.term > pre","text":"你 → 安裝 witness","x":1106,"y":595,"t":24483}`, cap: "events.jsonl 逐行流式落盤" }],
      ["dom/ · bodies/ · shots/", "快照、回應體、截圖幀", { img: "/sample/shot.jpg", cap: "shots/ 裡的真實截圖幀（錄製中自動截取）" }],
    ],
  },
  mcp: {
    k: "06 · 拉取，不是推送",
    h: "<code>wit mcp</code>——把證據變成 API。",
    p: "session 不是一坨死檔案，而是一個 stdio MCP server。接進任何支援 MCP 的 agent，它按需查詢精確的證據：",
    cards: [
      ["file", "<code>list_says</code>", "全部語音片段 + 時間戳——問題錨點。"],
      ["clock", "<code>events_around</code>", "按時間窗+類型過濾的原始事件。"],
      ["layers", "<code>get_dom_state</code>", "離某個時間點最近的完整 DOM。"],
      ["zap", "<code>get_errors</code>", "console 錯誤、頁面異常、HTTP ≥400。"],
      ["box", "<code>get_shot / get_body</code>", "按需取截圖幀和回應內容。"],
      ["api", "<code>session_md</code>", "要全文時回傳渲染好的時間軸。"],
      ["mic", "<code>get_asr / set_asr</code>", "agent 自己查、自己切語音引擎——配置環裡不需要人。"],
    ],
    mcap: "……共 12 個註冊工具——session 是可查詢的 API，不是一坨死檔案。",
  },
  agents: {
    k: "07 · 接入你的 agent",
    h: "貼進去，或者插上來。",
    lede: "證據包自描述、零廠商鎖定。兩條路，按 agent 能力選：",
    c1t: "PROMPT.md → 貼上",
    c1d: "每個 session 自帶交接檔案：格式說明、頁面詞表、修復規則。貼進任何會跑命令的 agent——它就知道該怎麼讀證據、先複述清單再動手。",
    c2t: "wit mcp → 接入",
    c2d: "支援 MCP 的 agent 直接連 stdio server：12 個工具按需挖證據，不用把整包塞進上下文。Devin 還有原生 skill 驅動全流程。",
    works: "支援",
    agents: ["Devin", "Claude Code", "Cursor", "Codex", "Windsurf", "任何 MCP 客戶端"],
  },
  principles: {
    k: "08 · 原則",
    h: "證據不說謊。",
    cards: [
      ["terminal", "本機優先，零配置", "系統 Edge/Chrome + 免費串流 ASR（doubao-web → doubao-ime → 瀏覽器 SR 備援，<code>wit config asr</code> 可切）。不需要任何 API key；LLM 只是可選增強層，永遠不是主流程。"],
      ["file", "原話不改寫", "你的語音逐字寫進 events.jsonl。合併、糾錯、語義關聯都只是展示層建議——原始證詞永遠可稽核。"],
      ["eye", "證據 ≠ 意圖", "點擊和捲動是事實不是抱怨。沒有語音錨點時，明確告訴 agent：永遠不要從行為推斷 bug。"],
      ["shield", "隱私工程化", "密碼欄位四通道遮罩；POST 內容自動脫敏憑證欄位；P 暫停期全部凍結包括麥克風；敏感應用可用 <code>WIT_NO_BODIES</code>。"],
    ],
  },
  vs: {
    k: "09 · 為什麼不直接……",
    h: "錄影記下像素，Witness 記下因果。",
    lede: "手寫一份 bug 報告也行，發段錄影也行。各自落到哪一步：",
    cols: ["", "手寫的報告", "一段錄影", "Witness"],
    rows: [
      ["報一個問題的成本", "≈10 分鐘：截圖、圈選、組織語言", "幾分鐘——但每次回放都要重看", "說一句話，證據已掛好"],
      ["agent 能直接修嗎", "只覆蓋你記得寫下的", "全是像素，需要人重新推導", "session.md + events.jsonl + MCP"],
      ["「點了沒反應」", "容易漏寫", "影片裡根本看不出來", "顯式記為證據"],
      ["點擊的因果後果", "—", "—", "~1.8s 內 請求/回應/console/DOM"],
      ["回到那一秒的頁面", "—", "影片 ≠ DOM", "rrweb 全量回放"],
      ["資料留在本機", "—", "看傳到了哪", "永遠在 .witness/sessions"],
    ],
  },
  who: {
    k: "10 · 誰在用",
    h: "給所有「眼睛就是最後一道 QA」的人。",
    cards: [
      ["cursor", "獨立開發 × agent", "你寫的你點一遍，邊點邊說。agent 拿到的是可直接動手的證據包——從發現到修復不出一個 session。"],
      ["eye", "視覺與動效走查", "卡頓、閃爍、版面跳動——截圖永遠說不清的東西。說出哪裡動了，DOM 變化已經掛好了。"],
      ["file", "QA 與產品驗收", "一個功能一條 take，<code>N</code> 鍵切問題邊界。session 交給 agent，或者把 <code>review.html</code> 掛進工單。"],
      ["api", "開源維護者", "讓報 bug 的人發一段 <code>wit</code> 錄製，而不是一張截圖：selector、console、網路請求一次到齊。"],
    ],
  },
  faq: {
    k: "11 · 常見問題",
    h: "你想問的，先答了。",
    items: [
      ["需要裝什麼？", "Node 18+ 和系統 Edge/Chrome——優先用你機器上的真瀏覽器，找不到才裝內建 chromium。<code>npm i -g github:wookat/witness</code>，完事。"],
      ["有什麼資料會離開本機？", "證據包全部落在本地 <code>.witness/sessions/</code>（自動 gitignore）。即時字幕按你選的引擎串流麥克風音訊（預設 doubao-web）；<code>--asr sr</code> 走系統/瀏覽器辨識，<code>--asr off</code> 直接不要即時字幕。終稿轉寫走 bcut（免費）或你自己的 OPENAI_API_KEY 走 whisper——<code>--no-transcribe</code> 可全跳過。LLM 糾錯/關聯只有顯式傳 flag 且有 key 才跑。"],
      ["支援哪些 agent？", "能跑 CLI 的 agent 就能讀 session.md + PROMPT.md。支援 MCP 的（Devin、Claude Code、Cursor、Codex……）直連 <code>wit mcp</code>——12 個查詢工具按需挖證據，而不是一次性塞全文。Devin 另有原生 skill 驅動錄製全流程。"],
      ["密碼出現在頁面裡怎麼辦？", "密碼欄位四通道遮罩；POST 內容自動脫敏憑證欄位；<code>P</code> 隨時全凍結（含麥克風）；敏感應用設 <code>WIT_NO_BODIES=1</code> 直接不存回應內容。"],
      ["可以說什麼語言？", "<code>--lang</code> 設辨識語言（預設 zh-CN，如 en-US、zh-TW）。原話永遠逐字寫入——辨識錯字保留可稽核，LLM 糾錯只是可選的展示層。"],
      ["只能錄 localhost 嗎？", "任何 URL——託管瀏覽器就是你的真實瀏覽器，登入照樣用。不過在本地開發站上最鋒利：agent 修的時候能同時看到原始碼。"],
      ["錄到一半當機 / 被我結束了，全沒了嗎？", "events.jsonl 逐行串流寫入，最多丟最後幾百毫秒。<code>wit recover &lt;dir&gt;</code> 隨時從事件流重建 session.md、review.html、PROMPT.md。"],
      ["收費嗎？", "MIT 開源，無帳號、無必需 key。免費 ASR 是預設鏈路；付費模型全是自帶 key 的可選增強。"],
    ],
  },
  install: {
    k: "12 · 上手",
    h: "三句話，跑通整個閉環。",
    p: "你下指令，<b>agent 敲命令</b>。Witness 本體是 CLI（<code>wit</code>）——agent 驅動它開託管瀏覽器錄製，結束後產出本地證據包：人看 <code>review.html</code>，agent 走 <code>session.md</code>/<code>PROMPT.md</code>/<code>wit mcp</code>。Node 18+、系統 Edge/Chrome、不上雲、不要 key。",
    cta1: "★ 去 GitHub 點 Star",
    cta2: "讀使用文件 ↗",
  },
  docsPill: "使用文件",
};
