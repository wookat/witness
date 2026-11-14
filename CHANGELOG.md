# Changelog

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
