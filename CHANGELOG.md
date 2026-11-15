# Changelog

## 0.6.3 — free-cloud final transcription & single-pass reuse

### Added
- **Free cloud final transcription** — zh/auto sessions without a whisper backend/key now transcribe via doubao-web (VoiceGenie) batch → bcut fallback, zero config. `shouldUseBcut` → `shouldUseFreeCloud`.

### Changed
- **Live transcript reuse** — when the live ASR engine already covered ≥75% of the recording and no better (whisper) backend is configured, its transcript becomes the final one. Skips ~40s of re-transcribing the same audio through the same engine; falls back to re-transcription on partial coverage (WS drops, nav-killed sessions).

## 0.6.2 — config wizard & global/project config split

### Added
- **`wit init`** — interactive 4-step wizard: default language → live ASR engine menu → local whisper offer → ASR hotwords. One command, writes config, done.

### Fixed
- **Config silently lost outside the project dir** — machine-level settings (localAsr endpoint, model paths, asr engine, lang) lived in `<cwd>/.witness/config.json`, so running `wit` anywhere else silently fell back to bcut/auto. Now split: `~/.witness/config.json` (global user prefs) merged under `<cwd>/.witness/config.json` (project overrides, e.g. `asrPrompt` domain vocab). `lang` is now persistable via `wit config lang`.

## 0.6.1 — Permissions-Policy mic fix (#7)

### Fixed
- **Silent audio-less sessions on `Permissions-Policy: microphone=()` sites** — sites can forbid the mic document-wide; the browser-level permission grant can't override it, so `getUserMedia` threw `NotAllowedError` and the session recorded with `audio: false` and zero speech. Witness now rewrites `microphone=…` → `microphone=(self)` on **document responses only** (all other headers incl. duplicate `Set-Cookie` pass through untouched). New `--no-mic-patch` flag honors the site's real policy. A loud ⚠ console warning now fires the moment the mic is blocked — no more discovering it at finalize.

## 0.6.0 — confidence, local live ASR & model management

### Added
- **Local live ASR (`--asr local`)** — fully-offline streaming captions via sherpa-onnx zipformer (zh+en bilingual, int8 ~190MB). `wit local-asr live setup` downloads the model + starts the server; `auto` prefers it once installed, then falls back to doubao-web → doubao-ime. PCM16/16k/mono streams over a loopback WebSocket (`local-asr/live_server.py` ships in the package).
- **`wit local-asr models`** — `list|use|pull|rm` manage faster-whisper models in the HF cache: presets + arbitrary repo ids, disk usage shown, active model protected from deletion.
- **ASR confidence surfacing** — local server returns word `probability` + segment `avg_logprob`/`no_speech_prob`; segments with mean word-prob < 0.55 are flagged `lowConf` and rendered as `⚠ low-confidence ASR` in session.md, with a PROMPT.md rule telling agents to verify before quoting.
- **MCP `get_audio`** — returns `audio.webm` inline (≤15MB) so agents can verify transcripts against the original voice; larger files return path + ffmpeg hint.
- **Transcription progress** — elapsed-time ticker with audio-duration estimate during long whisper runs (`wit start` stop-time and `wit transcribe`).
- **`wit config asr-prompt <hotwords>`** — persists the initial-prompt bias to `.witness/config.json` (`WIT_ASR_PROMPT` env still overrides).

### Engineering
- CI workflow (build + test on push/PR), Dependabot (npm weekly, actions monthly), CONTRIBUTING.md, bug/feature issue templates.

## 0.5.0 — local-first transcription for every user

### Added
- **`wit setup local-asr`** — one-command local whisper backend: bootstraps `uv` (standalone binary, no admin), runs faster-whisper through PEP-723-managed python, downloads a multilingual CT2 model (default `small`; presets `tiny|base|small|medium|large|turbo` or any faster-whisper HF repo id), writes `.witness/config.json`. Audio never leaves the machine.
- **`wit local-asr start|stop|status`** — manage the bundled OpenAI-compatible server (`local-asr/server.py` ships in the npm package; binds 127.0.0.1:8791; `/health`, `/v1/models`, `/v1/audio/transcriptions` with word timestamps, VAD filter, language passthrough).
- **Transcription provider chain** — `WHISPER_BASE_URL` env → local ASR → Groq → OpenAI; unreachable candidates are skipped automatically. Both stop-time and `wit transcribe <dir>` use it.
- **`WIT_ASR_PROMPT`** — initial-prompt hotword bias for the local engine (product names, error codes, jargon).
- **`config.localAsr.baseUrl`** — point at any OpenAI-compatible server (speaches, whisper.cpp server, vLLM) instead of the bundled one.
- **bcut fallback is language-gated** — the free zh-tuned endpoint only runs for zh/auto sessions; explicit `--lang en|ko|ja|…` without a whisper backend skips it rather than emitting garbage.

### Changed
- `hasTranscriber()` now counts local-ASR config; `wit doctor` reports local endpoint reachability, configured model, and `WIT_ASR_PROMPT`.
- Stop-time flow is now: whisper chain → (zh/auto only) bcut → live-ASR segments, each step logged.

## 0.4.0 — evidence depth & accuracy

### Fixed
- MCP server now reports the real package version (was hardcoded 0.3.0)
- `get_shot` returns the correct MIME type for `.webp` screenshots (was always `image/jpeg`)
- `language=zh` was hardcoded in the doubao-web VoiceGenie endpoint — `--lang` now reaches every ASR stage: browser SpeechRecognition, doubao-web/doubao-ime live payloads, and whisper post-session transcription
- req→res pairing in session.md matched on URL only — concurrent same-URL requests could swap statuses; now pairs by request id (URL fallback for legacy events)

### Added
- **`wit doctor`** — preflight diagnostics: browser detection, live-ASR reachability, transcription keys, sessions-dir writability
- **Input values captured** — non-password inputs record what was actually typed (160-char cap); password/OTP/credit-card autocomplete fields stay masked
- **WebSocket frames** — text frames sampled (`ws` events, collapsed ×n in session.md) for realtime apps
- **Response bodies >64KB** keep their head instead of being dropped entirely (`bodyTrunc` flag)
- **MCP tools +2 (now 14)**: `get_transcript` (engine/model/lang + segments), `search_events` (full-text over all event fields)
- `session_md` is capped at ~80k chars with offset paging; `get_dom_state` capped at 120k with `max_chars` — long sessions no longer blow the agent's context
- `session_overview` reports audio captured, lang, ASR engine, transcript model, ws frame count
- session.md warns explicitly when audio exists but zero speech was recognized
- mic timeline anchor is a tagged `mic-start` note (regex fallback kept for old sessions)

### Notes
- Live ASR engines remain the free reverse-engineered endpoints (doubao-web/doubao-ime) — `wit doctor` now verifies reachability before you record
