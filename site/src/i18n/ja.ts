// 日本語 — dev-tool 向けの自然なコピー。技術用語（session.md, MCP, DOM など）は英語のまま。
export default {
  path: "/ja/",
  htmlLang: "ja",
  flag: "日",
  name: "日本語",
  meta: {
    title: "Witness — AI コーディングエージェントのための、音声アンカー型因果エビデンスレコーダー",
    desc: "いつも通りプロダクトを触りながら、違和感を声にするだけ。Witness が音声・クリック・ネットワーク・エラー・DOM リプレイを記録し、AI エージェントがそのまま直せる因果エビデンスパケットを生成します。",
  },
  nav: { how: "仕組み", evidence: "エビデンス", mcp: "MCP", install: "インストール", faq: "FAQ", docs: "ドキュメント" },
  docsPath: "/ja/docs",
  footer: {
    tagline: "AI コーディングエージェントのための、音声アンカー型因果エビデンスレコーダー。ローカルファースト、MIT。",
    selfRec: "このサイト自身も Witness で録画済み",
    cols: ["プロダクト", "ドキュメント", "コミュニティ"],
    product: { how: "仕組み", evidence: "エビデンス", mcp: "MCP", faq: "FAQ", install: "インストール" },
    docs: { usage: "使い方ドキュメント", readme: "GitHub README", vision: "ビジョンとロードマップ", releases: "リリース" },
    community: { github: "GitHub", issues: "Issue", license: "MIT ライセンス", stars: "Star 履歴", contact: "メール" },
    copy: "© 2026 zalize · MIT ライセンス",
  },
  hero: {
    pill: "オープンソース · MIT · ローカルファースト",
    h1a: "言えば、", h1b: "Witness が残す",
    rot: ["証拠を。", "バグを。", "ジャンクを。", "500 を。", "理由を。"],
    sub: "いつも通り触りながら、違和感を声にするだけ——「このボタン、押しても反応しない」。Witness はあなたの言葉をその瞬間の因果エビデンスに溶接し、パケットを AI コーディングエージェントに渡します。",
    cta1: "GitHub を見る", cta2: "仕組み",
    fsay: "「このボタン、反応しない」",
    insthint: "↑ これを AI エージェントに渡すだけ——インストールから録画までやってくれます",
    instmeta: "wit CLI が入ります——録画 · レンダリング · MCP が一体 · Node 18+ · システムの Edge/Chrome · キー不要",
  },
  video: { tag: "PLAYWRIGHT で実録 · ワンテイク", say: "反応がない", vocab: "注文/送信/支払い" },
  convo: {
    you: "あなた",
    msgs: [
      ["y", "witness をインストールして"],
      ["a", "npm i -g github:wookat/witness", "ok"],
      ["y", "http://localhost:5173 を録画して"],
      ["a", "wit start ✓ · 管理ブラウザが開きます。報告を待っています", "ok"],
      ["n", "普通にプロダクトを触って、気づいたことを話して、問題をマークして ■ を押す"],
      ["y", "さっきの録画の問題を直して"],
      ["a", "session.md を読む → 問題リストを復唱 → あなたが確認 → 修正", "ok"],
    ],
  },
  problem: {
    k: "01 · 課題",
    h: "エージェントには、あなたの目が見えない。",
    p: "人間なら「スクロールするとボタンが変に縮む」と2秒で気づく。でもそれを AI エージェントに書き起こすと、スクリーンショット・セレクター・プロンプトで10分かかる——しかも<i>なぜ</i>は消えたまま。音声はいちばん安い注釈チャンネルなのに、レコーダーが無かっただけです。",
  },
  demoSec: {
    k: "02 · 実録",
    h: "1クリック。すべての結果を記録。",
    p: "1回の録画セッションの全体像——発話、マーク、反応しないクリック、保存まで。下の Pay ボタンは押しても<b>何も起きません</b>。「起きなかった」という事実そのものがエビデンスです。",
  },
  stats: ["録画トラック", "MCP ツール", "クラウドキー不要", "テスト全パス", "オープンソース"],
  how: {
    k: "03 · 仕組み",
    h: "3つの録画ライン、1つのタイムライン。",
    p: "<code>wit start &lt;dev-url&gt;</code> で管理ブラウザが開きます。その瞬間から3本のストリームが並行して走ります——手作業ゼロ：",
    cards: [
      ["mic", "01 / 音声", "あなたの声", "連続録音 + <b>真ストリーミング ASR</b>（doubao-web → doubao-ime → ブラウザ SR の自動フォールバック）。ツールバー下にライブ字幕——思いついた順に話せば、一発撮りで複数の問題を報告できます。"],
      ["zap", "02 / 操作", "操作 + 因果バースト", "クリックごとに直後 ~1.8s の結果を捕捉：リクエスト、レスポンス、console エラー、DOM 変化。何も起きなかったクリックは、それ自体がエビデンス。"],
      ["layers", "03 / 状態", "ページの変遷", "rrweb フル DOM リプレイ + イベント駆動スクリーンショット + 定期 DOM スナップショット。任意の秒のページ状態に巻き戻せます。"],
    ],
  },
  flow: [["wit start", "<url>", true], ["触って話す", "", false], ["Ctrl+クリック / M でマーク", "", false], ["■ 停止", "", false], ["エビデンスパケット", "", true]],
  keys: {
    cap: "リモコンはこれだけ。全部です。",
    items: [
      [["話す", "+", "ブラウズ"], "主入力はこれだけ——ただ実況する"],
      [["Ctrl", "+", "クリック"], "要素をマーク：selector + コンポーネントチェーン + 枠付きショット"],
      [["M"], "inspect モード：ホバーで選択、またはドラッグで範囲選択"],
      [["N"], "新しい問題の境界を切る——一発撮りで複数の問題"],
      [["P"], "一時停止/再開：エビデンスもマイクも完全にフリーズ"],
      [["■", "/", "Alt+Shift+R"], "停止——エビデンスパケットがディスクに落ちる"],
    ],
  },
  evidence: {
    k: "04 · 出力",
    h: "あなたの言葉が、エビデンスのアンカーになる。",
    p: "話した断片がタイムライン上のブロックになり、その瞬間の因果ファクトがぶら下がる——「因果バースト」。引用をクリックしてみて：",
    hint: "引用をクリックするとエビデンスが開きます",
    says: [
      {
        t: "00:09", quote: "スクロールするとボタンが縮んで薄くなる",
        ev: [["SCROLL", "y=3936", "dim"], ["MUT", "button.feedback · data-collapsed: false → true", "acc2"], ["MUT", "button.feedback · data-collapsed: true → false", "acc2"]],
        note: "境界で属性が往復している", ui: "scroll",
      },
      {
        t: "00:34", quote: "送信ボタンを押しても反応がない",
        ev: [["CLICK", "button#submit “送信” · @482,701", "ok"]],
        note: "クリック後 1.8s ページは無反応——それ自体がエビデンス", ui: "btn",
      },
      {
        t: "01:02", quote: "注文 API の返り値がおかしい",
        ev: [["CLICK", "a[href=\"/orders\"] “注文”", "ok"], ["NET →", "GET /api/orders?page=1", "dim"], ["NET ←", "200 /api/orders · items: []", "bad"]],
        note: "レスポンスボディを捕捉 → bodies/req_0041.json", ui: "api",
      },
    ],
  },
  aud: {
    k: "05 · 2つの読者", h: "人にはリプレイを。エージェントには構造を。", labels: ["人間向け", "AI エージェント向け"],
    humans: [
      ["review.html", "音声カード + 音声シーク + ショット", { img: "/sample/review.png", cap: "実際の review.html —— このサイト自身を録画したもの" }],
      ["▶ DOM リプレイ", "rrweb プレイヤー内蔵、実際のページ状態", { img: "/sample/review.png", cap: "review.html 内蔵の rrweb 再生エリア" }],
      ["film strip", "動画のように録画全体をスクラブ", { img: "/sample/review.png", cap: "下部フィルムストリップのスクラバー" }],
      ["audio.webm", "元の録音", { img: "/sample/review.png", cap: "引用をクリックでその秒を再生" }],
    ],
    agents: [
      ["PROMPT.md", "引き継ぎ書 + ページ語彙", { pre: `This is a product-feedback session recorded by Witness (voice + clicks + live page evidence).

Process in this order:
1. Read SEGMENTS.md — an index of N speech-anchored segments; verbatim speech + suspects + shots in segments/NN.md
2. Restate the user's issues as a checklist (grouped by you), confirm BEFORE fixing:
   | # | time | user said (verbatim) | your understanding | linked evidence |
3. After confirmation, fix each — locate code via selector / React component name
4. For anything unfixable, state the reason and the extra evidence needed`, cap: "PROMPT.md 抜粋——生成物は英語、あなたの言葉は逐語" }],
      ["session.md", "因果エビデンスのタイムライン", { pre: `### 00:17 · SAY
> [00:17] "えっと、このページなんですが"
> [00:19] "この操作というか"
> [00:21] "このインタラクション、おかしいと思います"
- 00:24 CLICK #install > div.term > pre "あなた → "witness をインストールして"…"
  - 00:24 MUT #rot attr class: rot → rot out`, cap: "session.md 抜粋——各 SAY にその瞬間のエビデンス" }],
      ["events.jsonl", "完全な生イベントストリーム、クラッシュ耐性", { pre: `{"kind":"req","id":1,"url":"https://witness.zalize.com/ja/","method":"GET","resType":"document","t":605}
{"kind":"nav","url":"https://witness.zalize.com/ja/","t":1413}
{"kind":"click","selector":"#install > div.term > pre","text":"あなた → witness をインストールして","x":1106,"y":595,"t":24483}`, cap: "events.jsonl は行ごとにストリーミング保存" }],
      ["dom/ · bodies/ · shots/", "スナップショット・ペイロード・フレーム", { img: "/sample/shot.jpg", cap: "shots/ の実フレーム（録画中に自動取得）" }],
    ],
  },
  mcp: {
    k: "06 · プッシュではなくプル",
    h: "<code>wit mcp</code>——エビデンスを API に。",
    p: "静的ダンプではなく、セッションが stdio MCP server になります。MCP 対応エージェントを向けると、必要なエビデンスだけをクエリします：",
    cards: [
      ["file", "<code>list_says</code>", "タイムスタンプ付きの全発話——問題のアンカー。"],
      ["clock", "<code>events_around</code>", "時間窓＋種別で絞った生イベント。"],
      ["layers", "<code>get_dom_state</code>", "ある時刻に最も近い完全な DOM。"],
      ["zap", "<code>get_errors</code>", "console エラー、ページエラー、HTTP ≥400。"],
      ["box", "<code>get_shot / get_body</code>", "必要な時だけ取るスクショとレスポンスボディ。"],
      ["api", "<code>session_md</code>", "全文が欲しい時はレンダリング済みタイムライン。"],
      ["mic", "<code>get_asr / set_asr</code>", "エージェント自身が音声エンジンを確認・切替——設定ループに人は要りません。"],
    ],
    mcap: "……登録ツールは全 12 個——セッションはダンプではなく、クエリ可能な API です。",
  },
  agents: {
    k: "07 · あなたのエージェントと",
    h: "貼るか、挿すか。",
    lede: "パケットは自己記述型でロックインなし。エージェントの能力に応じて2つの経路：",
    c1t: "PROMPT.md → 貼る",
    c1d: "どのセッションにも引き継ぎファイルが付属：フォーマット仕様、ページ語彙、修正ルール。コマンドを実行できるエージェントなら何にでも貼れる——エビデンスの読み方と、直す前に復唱する作法を理解します。",
    c2t: "wit mcp → 挿す",
    c2d: "MCP 対応エージェントは stdio server に直結：12 ツールでオンデマンドにエビデンスを掘り、コンテキストを埋め尽くしません。リポジトリには SKILL.md も同梱——skill 対応エージェントではネイティブに読み込まれ、他ではルールファイルとして使えます。",
    works: "対応",
    agents: ["Devin", "Claude Code", "Cursor", "Codex", "Windsurf", "あらゆる MCP クライアント"],
  },
  principles: {
    k: "08 · 原則",
    h: "エビデンスは嘘をつかない。",
    cards: [
      ["terminal", "ローカルファースト、設定ゼロ", "システムの Edge/Chrome + 無料ストリーミング ASR（doubao-web → doubao-ime → ブラウザ SR フォールバック。<code>wit config asr</code> で切替）。API キー不要。LLM 仕上げは常に任意レイヤーで、パイプラインではありません。"],
      ["file", "言葉は書き換えない", "発話は events.jsonl に逐語で落ちます。マージ・訂正・関連付けは表示層の提案——生の証言は監査可能なままです。"],
      ["eye", "エビデンス ≠ 意図", "クリックやスクロールは事実であって苦情ではありません。発話アンカーが無い時、エージェントには明確に伝えます：行動からバグを推測するな、と。"],
      ["shield", "設計されたプライバシー", "パスワード欄は4チャンネルでマスク。POST ボディは認証フィールドを自動マスク。P でマイクごと全停止。敏感なアプリには <code>WIT_NO_BODIES</code>。"],
    ],
  },
  vs: {
    k: "09 · なぜ普通じゃダメか",
    h: "画面録画はピクセルを撮る。Witness は因果を撮る。",
    lede: "バグレポートを手打ちしても、動画を添付してもいい。それぞれの着地地点：",
    cols: ["", "手書きレポート", "画面録画", "Witness"],
    rows: [
      ["1件報告するコスト", "約10分：撮って、切って、文章化", "数分——でも読むたびに再生が必要", "一言話せば、エビデンス付き"],
      ["エージェントが直せるか", "書き残した分だけ", "ピクセルのみ——人が文脈を再推論", "session.md + events.jsonl + MCP"],
      ["「押しても無反応」", "書き忘れがち", "動画では見えない", "エビデンスとして記録"],
      ["クリックの因果バースト", "—", "—", "~1.8s の リクエスト/レスポンス/console/DOM"],
      ["あの瞬間のページに戻る", "—", "動画 ≠ DOM", "rrweb フル DOM リプレイ"],
      ["データはローカルに", "—", "アップロード先次第", "常に .witness/sessions 内"],
    ],
  },
  who: {
    k: "10 · こんな人に",
    h: "「目が最後の QA」なすべての人へ。",
    cards: [
      ["cursor", "個人開発 × エージェント", "自分で作ったものを自分で触りながら話す。エージェントにはすぐ直せるパケット——発見から修正まで一座のまま。"],
      ["eye", "デザイン・モーションのレビュー", "ジャンク、チラつき、レイアウトシフト——スクショでは伝わらないもの。動いた場所を言えば、DOM 変更はすでに添付済み。"],
      ["file", "QA・プロダクトチェック", "機能ごとにワンテイク、<code>N</code> で問題の境界。セッションをエージェントに渡すか、<code>review.html</code> をチケットに添付。"],
      ["api", "OSS メンテナー", "報告者にスクショではなく <code>wit</code> セッションを求める：selector、console、ネットワークが自己記述フォルダひとつで届く。"],
    ],
  },
  faq: {
    k: "11 · FAQ",
    h: "聞かれる前に、答えておきます。",
    items: [
      ["何をインストールすればいい？", "Node 18+ とシステムの Edge/Chrome——まず実際のブラウザを使い、無ければ同梱 chromium にフォールバック。<code>npm i -g github:wookat/witness</code> で終わりです。"],
      ["何かがマシンの外に出ますか？", "エビデンスパケットはローカルの <code>.witness/sessions/</code> に残り、既定で gitignore されます。ライブ字幕は選んだ ASR エンジンにマイク音声をストリーミングします（既定 doubao-web）。<code>--asr sr</code> で OS/ブラウザの認識、<code>--asr off</code> でライブ字幕なし。最終文字起こしは bcut（無料）か自分の OPENAI_API_KEY で whisper——<code>--no-transcribe</code> で丸ごと省略可。LLM レイヤー（訂正・関連付け）は flag とキーを渡した時だけ動きます。"],
      ["どのエージェントに対応？", "CLI を実行できるエージェントなら session.md + PROMPT.md を読めます。MCP 対応（Devin、Claude Code、Cursor、Codex…）は <code>wit mcp</code> に直結——静的ダンプではなく12のクエリツール。同梱の SKILL.md は skill 対応エージェントでネイティブに読み込まれ、他ではルールファイルとして使えます。"],
      ["画面にパスワードが映ったら？", "パスワード欄は4チャンネルでマスク、POST ボディは認証フィールドを自動マスク、<code>P</code> でマイクごと全停止、敏感なアプリは <code>WIT_NO_BODIES=1</code> でレスポンス自体を残しません。"],
      ["何語で話せますか？", "認識言語は既定でブラウザ/OS の言語に従います——<code>--lang &lt;bcp47&gt;</code>（en-US、ja-JP など）で回ごとに上書き可能。発話は常に逐語で保存——ASR の誤字は監査可能なまま残り、LLM 訂正は任意の表示レイヤーです。"],
      ["localhost 以外も録れますか？", "どんな URL でも——普通に使う実際の管理ブラウザなのでログインも動きます。一番切れるのはローカル開発：直すエージェントがソースも見えるからです。"],
      ["途中でクラッシュ/強制終了したら？", "events.jsonl は行ごとにストリーミング保存。失われるのは最大でも最後の数百ミリ秒。<code>wit recover &lt;dir&gt;</code> で session.md・review.html・PROMPT.md をいつでも再構築できます。"],
      ["有料ですか？", "MIT。アカウント不要、必須キーなし。無料 ASR が既定経路で、有料モデルのフックは全て BYO キーの任意機能です。"],
    ],
    contact: `他に聞きたいことは？ → <a href="mailto:wookat@qq.com">wookat@qq.com</a> · または <a href="https://github.com/wookat/witness/issues" target="_blank" rel="noopener">Issue を作成</a>。質問歓迎です。`,
  },
  install: {
    k: "12 · はじめる",
    h: "3文。それがループの全部です。",
    p: "あなたが指示し、<b>エージェントがコマンドを叩きます</b>。Witness はエージェントが運転する CLI（<code>wit</code>）——管理ブラウザを開いて録画し、ローカルのエビデンスパケットを返します：<code>review.html</code> はあなたへ、<code>session.md</code>/<code>PROMPT.md</code>/<code>wit mcp</code> はエージェントへ。Node 18+、システム Edge/Chrome、クラウドもキーも不要。",
    cta1: "★ GitHub でスター",
    cta2: "ドキュメントを読む ↗",
  },
  docsPill: "ドキュメント",
};
