// English — canonical copy. All homepage + chrome strings live here so that
// components stay dumb and locales stay parallel.
export default {
  path: "/",
  htmlLang: "en",
  flag: "EN",
  name: "English",
  meta: {
    title: "Witness — voice-anchored evidence recorder for AI coding agents",
    desc: "Talk, point, ship the fix. Witness records your voice, clicks, network, errors and DOM replay while you use a product — then hands your AI agent a causal evidence package it can act on.",
  },
  nav: { how: "How it works", evidence: "Evidence", mcp: "MCP", install: "Install", faq: "FAQ", docs: "Docs" },
  docsPath: "/docs",
  footer: {
    tagline: "Voice-anchored causal evidence recorder for AI coding agents. Local-first, MIT.",
    selfRec: "This site was recorded by Witness itself",
    cols: ["Product", "Docs", "Community"],
    product: { how: "How it works", evidence: "Evidence", mcp: "MCP", faq: "FAQ", install: "Install" },
    docs: { usage: "Usage docs", readme: "GitHub README", vision: "Vision & roadmap", releases: "Releases" },
    community: { github: "GitHub", issues: "Issues", license: "MIT license", stars: "Star history", contact: "Email" },
    copy: "© 2026 zalize · MIT license",
  },
  hero: {
    pill: "OPEN SOURCE · MIT · LOCAL-FIRST",
    h1a: "You say it.", h1b: "Witness proves",
    rot: ["it.", "the bug.", "the jank.", "the 500.", "the why."],
    sub: "Experience your product and talk naturally — “this button does nothing”. Witness welds every word to the causal evidence of that exact second, then hands the package to your AI coding agent.",
    cta1: "View on GitHub", cta2: "How it works",
    fsay: "“this button does nothing”",
    insthint: "↑ hand this to your AI agent — it installs and records for you",
    instmeta: "installs the wit CLI — recorder · renderer · MCP in one · Node 18+ · system Edge/Chrome · no keys",
  },
  video: { tag: "RECORDED WITH PLAYWRIGHT · ONE TAKE", say: "does nothing", vocab: "orders/submit/pay" },
  convo: {
    you: "you",
    msgs: [
      ["y", "install witness"],
      ["a", "npm i -g github:wookat/witness", "ok"],
      ["y", "record http://localhost:5173 for me"],
      ["a", "wit start ✓ · managed browser opens, waiting on you", "ok"],
      ["n", "you use the product — say what you see, mark problems, press ■"],
      ["y", "fix the issues from that recording"],
      ["a", "reads session.md → echoes the issue list → you confirm → fixes", "ok"],
    ],
  },
  problem: {
    k: "01 · The problem",
    h: "Agents can't see what you see.",
    p: "A human notices “the button fades weirdly when I scroll” in two seconds. Writing that up for an AI agent takes ten minutes of screenshots, element selectors and prompt crafting — and the result still loses the <i>why</i>. Voice is the cheapest annotation channel there is; it just never had a recorder.",
  },
  demoSec: {
    k: "02 · Watch it happen",
    h: "One click. Every consequence, filed.",
    p: "One recorded session, start to finish — speech, marking, the dead click, the save. The Pay button below produces <b>nothing</b>, and that absence is captured as fact.",
  },
  stats: ["recording tracks", "MCP tools", "cloud keys needed", "tests green", "open source"],
  how: {
    k: "03 · How it works",
    h: "Three recording lines, one timeline.",
    p: "<code>wit start &lt;dev-url&gt;</code> opens a managed browser. From that moment, three streams run in parallel — zero manual work:",
    cards: [
      ["mic", "01 / VOICE", "Your voice", "Continuous audio + <b>true streaming ASR</b> (doubao-web → doubao-ime → browser SR, auto-fallback). Live subtitles under the toolbar as you speak — one take, many issues, no need to split."],
      ["zap", "02 / OPS", "Operations + causal bursts", "Every click captures its ~1.8s aftermath: requests, responses, console errors, DOM changes. A click with <i>no</i> aftermath is itself evidence."],
      ["layers", "03 / STATE", "Page evolution", "rrweb full-DOM replay + event-driven screenshots + periodic DOM snapshots. Rewind the exact page state at any second."],
    ],
  },
  flow: [["wit start", "<url>", true], ["browse + talk", "", false], ["Ctrl+click / M to mark", "", false], ["■ stop", "", false], ["evidence package", "", true]],
  keys: {
    cap: "the whole remote — that's all of it.",
    items: [
      [["talk", "+", "browse"], "the primary input — just narrate"],
      [["Ctrl", "+", "click"], "mark an element: selector + component chain + framed shot"],
      [["M"], "inspect mode: hover-pick, or drag to region-select"],
      [["N"], "cut a new issue boundary — many issues per take"],
      [["P"], "pause/resume: evidence and mic freeze entirely"],
      [["■", "/", "Alt+Shift+R"], "stop — the evidence packet hits disk"],
    ],
  },
  evidence: {
    k: "04 · The output",
    h: "Your words become evidence anchors.",
    p: "Each spoken fragment becomes a block on a timeline with the causal facts of that moment attached — the “causal burst”. Click a quote:",
    hint: "click a quote to expand its evidence",
    says: [
      {
        t: "00:09", quote: "the button fades and shrinks when I scroll",
        ev: [["SCROLL", "y=3936", "dim"], ["MUT", "button.feedback · data-collapsed: false → true", "acc2"], ["MUT", "button.feedback · data-collapsed: true → false", "acc2"]],
        note: "attribute flapping on the boundary", ui: "scroll",
      },
      {
        t: "00:34", quote: "the submit button does nothing",
        ev: [["CLICK", "button#submit “Submit” · @482,701", "ok"]],
        note: "page showed no reaction for 1.8s after the click — that itself is evidence", ui: "btn",
      },
      {
        t: "01:02", quote: "the orders API returns wrong data",
        ev: [["CLICK", "a[href=\"/orders\"] “Orders”", "ok"], ["NET →", "GET /api/orders?page=1", "dim"], ["NET ←", "200 /api/orders · items: []", "bad"]],
        note: "response body captured → bodies/req_0041.json", ui: "api",
      },
    ],
  },
  aud: {
    k: "05 · Two audiences", h: "Humans get a replay. Agents get a structure.", labels: ["For humans", "For AI agents"],
    humans: [
      ["review.html", "voice cards + audio seek + shots", { img: "/sample/review.png", cap: "a real review.html — produced while recording this very site" }],
      ["▶ DOM replay", "embedded rrweb player, real page state", { img: "/sample/review.png", cap: "the rrweb replay built into review.html" }],
      ["film strip", "scrub the whole session like video", { img: "/sample/review.png", cap: "the bottom filmstrip scrubber" }],
      ["audio.webm", "the raw recording", { img: "/sample/review.png", cap: "click any quote to play that second" }],
    ],
    agents: [
      ["PROMPT.md", "handoff doc + page vocabulary", { pre: `This is a product-feedback session recorded by Witness (voice + clicks + live page evidence).

Process in this order:
1. Read SEGMENTS.md — an index of N speech-anchored segments; verbatim speech + suspects + shots in segments/NN.md
2. Restate the user's issues as a checklist (grouped by you), confirm BEFORE fixing:
   | # | time | user said (verbatim) | your understanding | linked evidence |
3. After confirmation, fix each — locate code via selector / React component name
4. For anything unfixable, state the reason and the extra evidence needed`, cap: "a PROMPT.md excerpt — agent-facing output is English, your words stay verbatim" }],
      ["session.md", "causal evidence timeline", { pre: `### 00:17 · SAY
> [00:17] "so like, on this page"
> [00:19] "this interaction thing"
> [00:21] "I think this interaction is broken"
- 00:24 CLICK #install > div.term > pre "you → "install witness"…"
  - 00:24 MUT #rot attr class: rot → rot out`, cap: "a session.md excerpt — each SAY carries that moment's evidence" }],
      ["events.jsonl", "complete raw event stream, crash-safe", { pre: `{"kind":"req","id":1,"url":"https://witness.zalize.com/","method":"GET","resType":"document","t":605}
{"kind":"nav","url":"https://witness.zalize.com/","t":1413}
{"kind":"click","selector":"#install > div.term > pre","text":"you → install witness","x":1106,"y":595,"t":24483}`, cap: "events.jsonl streams line-by-line to disk" }],
      ["dom/ · bodies/ · shots/", "snapshots, payloads, frames", { img: "/sample/shot.jpg", cap: "a real frame from shots/ (auto-captured mid-recording)" }],
    ],
  },
  mcp: {
    k: "06 · Pull, don't push",
    h: "<code>wit mcp</code> — evidence as an API.",
    p: "Instead of a static dump, the session becomes a stdio MCP server. Point any MCP-capable agent at it and it queries exactly the evidence it needs:",
    cards: [
      ["file", "<code>list_says</code>", "Every spoken fragment with timestamps — the issue anchors."],
      ["clock", "<code>events_around</code>", "Raw events in a time window, filtered by kind."],
      ["layers", "<code>get_dom_state</code>", "Full DOM HTML nearest to a timestamp."],
      ["zap", "<code>get_errors</code>", "Console errors, page errors, HTTP ≥ 400."],
      ["box", "<code>get_shot / get_body</code>", "Screenshot frames and response payloads on demand."],
      ["api", "<code>session_md</code>", "The rendered timeline when the agent wants it all."],
      ["mic", "<code>get_asr / set_asr</code>", "The agent checks and flips the live speech engine itself — no human in the config loop."],
    ],
    mcap: "…of 12 registered tools — the session is a queryable API, not a dump.",
  },
  agents: {
    k: "07 · Works with your agent",
    h: "Paste it, or plug it.",
    lede: "The packet is self-describing and lock-in free. Two paths, picked per agent capability:",
    c1t: "PROMPT.md → paste",
    c1d: "Every session ships a handoff file: format spec, page vocabulary, fixing rules. Paste it into any agent that can run commands — it knows how to read the evidence and echo before it fixes.",
    c2t: "wit mcp → plug",
    c2d: "MCP-capable agents connect to the stdio server: 12 tools to query evidence on demand, no context stuffing. The repo also ships a ready-made SKILL.md — skill-aware agents load it natively; anywhere else it works as a rules file.",
    works: "works with",
    agents: ["Devin", "Claude Code", "Cursor", "Codex", "Windsurf", "any MCP client"],
  },
  principles: {
    k: "08 · Principles",
    h: "Evidence never lies.",
    cards: [
      ["terminal", "Local-first, zero config", "System Edge/Chrome + free streaming ASR (doubao-web → doubao-ime → browser SR, switchable via <code>wit config asr</code>). No API key needed; LLM polish is an optional layer, never the pipeline."],
      ["file", "Words are never rewritten", "Your speech lands verbatim in events.jsonl. Merging, correction and association are display-layer suggestions — the raw testimony stays auditable."],
      ["eye", "Evidence ≠ intent", "Clicks and scrolls are facts, not complaints. Without a spoken anchor, agents are told explicitly: never infer a bug from behavior alone."],
      ["shield", "Privacy engineered in", "Password fields masked in four channels; POST bodies redact credential fields; P freezes everything, mic included; <code>WIT_NO_BODIES</code> for sensitive apps."],
    ],
  },
  vs: {
    k: "09 · Why not just…",
    h: "A screen recording captures pixels. Witness captures causes.",
    lede: "You could type the bug report, or attach a video. Here's where each approach actually lands:",
    cols: ["", "A written report", "A screen recording", "Witness"],
    rows: [
      ["Cost to file one issue", "≈10 min: shots, crops, careful words", "a few min — but rewatched every read", "say it once, evidence attached"],
      ["Agent can act on it", "only what you remembered to write", "pixels — a human re-derives context", "session.md + events.jsonl + MCP"],
      ["“Clicked → nothing”", "easy to forget", "invisible on video", "captured as evidence"],
      ["Causal burst per click", "—", "—", "req / res / console / DOM in ~1.8s"],
      ["Rewind the page state", "—", "video ≠ DOM", "rrweb full-DOM replay"],
      ["Stays on your disk", "—", "depends where it uploads", "always — .witness/sessions"],
    ],
  },
  who: {
    k: "10 · Who it's for",
    h: "For anyone whose eyes are the last QA layer.",
    cards: [
      ["cursor", "Solo dev × agent", "You built it, you click through it, you narrate. The agent gets a fix-ready packet and the whole find→fix loop stays inside one sitting."],
      ["eye", "Design & motion review", "Jank, flicker, layout shifts — the things that never screenshot well. Say what moved; the DOM mutations are already attached."],
      ["file", "QA & product passes", "One take per feature, issue boundaries with <code>N</code>. Hand the session to an agent, or attach <code>review.html</code> to the ticket."],
      ["api", "OSS maintainers", "Ask reporters for a <code>wit</code> session instead of a screenshot: selector, console and network arrive in one self-describing folder."],
    ],
  },
  faq: {
    k: "11 · FAQ",
    h: "Asked before you did.",
    items: [
      ["What do I need installed?", "Node 18+ and a system Edge or Chrome — Witness prefers your real browser and only falls back to bundled chromium. <code>npm i -g github:wookat/witness</code>, done."],
      ["Does anything leave my machine?", "The evidence packet stays in <code>.witness/sessions/</code> on your disk, gitignored by default. Live captions stream mic audio to the ASR engine you pick (doubao-web by default); <code>--asr sr</code> uses the OS/browser recognizer, <code>--asr off</code> skips live text entirely. The final transcript goes to bcut (free) or whisper with your own OPENAI_API_KEY — <code>--no-transcribe</code> skips that too. Optional LLM layers (correction, association) only run when you pass the flag and set a key."],
      ["Which agents does it work with?", "Any agent that can run a CLI can read session.md + PROMPT.md. MCP-capable ones (Devin, Claude Code, Cursor, Codex…) connect to <code>wit mcp</code> — 12 tools to query evidence on demand instead of one static dump. A bundled SKILL.md loads natively in skill-aware agents and works as a rules file elsewhere."],
      ["What if a password is on screen?", "Password fields are masked across four channels, POST bodies redact credential fields, <code>P</code> freezes everything mid-session including the mic, and <code>WIT_NO_BODIES=1</code> drops response capture entirely for sensitive apps."],
      ["What languages can I speak?", "Speech recognition follows your browser/OS language by default — <code>--lang &lt;bcp47&gt;</code> (en-US, ja-JP…) overrides per session. Your words always land verbatim — ASR mistakes stay auditable; LLM correction is an opt-in display layer."],
      ["Only localhost, or any site?", "Any URL — it's a real managed browser you drive normally, so logins work. It's sharpest on local dev, where the agent can see the source while it fixes."],
      ["It crashed / I killed it — is the take gone?", "events.jsonl streams to disk line by line; at most the last few hundred milliseconds are lost. <code>wit recover &lt;dir&gt;</code> rebuilds session.md, review.html and PROMPT.md from the stream."],
      ["Is it free?", "MIT, no accounts, no required keys. Free ASR engines are the default path; paid-model hooks are bring-your-own-key and optional."],
    ],
    contact: `Still curious? → <a href="mailto:wookat@qq.com">wookat@qq.com</a> · or <a href="https://github.com/wookat/witness/issues" target="_blank" rel="noopener">open an issue</a>. Questions welcome.`,
  },
  install: {
    k: "12 · Get started",
    h: "Three sentences. That's the whole loop.",
    p: "You give instructions; <b>your agent runs the commands</b>. Witness is a CLI (<code>wit</code>) that agents drive — it opens a managed browser, records, and hands back a local evidence package: <code>review.html</code> for you, <code>session.md</code>/<code>PROMPT.md</code>/<code>wit mcp</code> for the agent. Node 18+, system Edge/Chrome, no cloud, no keys.",
    cta1: "★ Star on GitHub",
    cta2: "Read the docs ↗",
  },
  docsPill: "DOCS",
};
