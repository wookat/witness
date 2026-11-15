# Contributing to Witness

Thanks for your interest. Witness is local-first: everything stays on the user's machine unless they explicitly configure a cloud ASR backend.

## Ground rules

- **Local-first is a feature, not a constraint to route around.** Don't add telemetry, phone-home, or cloud calls that aren't behind an explicit opt-in env/config.
- **Privacy-sensitive data stays masked.** Input values are recorded verbatim *except* password/OTP/credit-card fields — keep that masking intact when touching `page-script.ts`.
- **The evidence chain must stay raw.** `events.jsonl` is the source of truth; `session.md`/`PROMPT.md`/`SEGMENTS.md` are derived views. Confidence flags annotate, never rewrite.
- MIT licensed — by contributing you agree your changes ship under MIT.

## Dev loop

```bash
npm ci
npm run build   # tsc → dist/
npm test        # node --test on compiled output
```

Node >= 18. Playwright browsers are only needed for real recordings (`npx playwright install chromium`), not for tests.

## Where things live

| area | files |
|---|---|
| CLI | `src/cli.ts` |
| recorder core | `src/recorder.ts`, `src/page-script.ts` (injected), `src/events.ts` |
| session rendering | `src/session.ts`, `src/segments.ts`, `src/align.ts` |
| transcription | `src/transcribe.ts`, `src/bcut.ts`, `src/local-asr.ts`, `local-asr/server.py` |
| live ASR | `src/live-asr.ts`, `src/doubao*.ts`, `src/local-live-asr.ts`, `local-asr/live_server.py` |
| MCP server | `src/mcp.ts` |
| diagnostics | `src/doctor.ts` |

## Conventions

- TypeScript ESM, `.js` import specifiers, strict-ish (match neighboring style).
- No new runtime deps without a reason — `ws`, `openai`, `playwright`, `commander` already cover most needs.
- Tests live in `test/*.test.ts`, run against `dist/`.
- User-facing strings: English primary; docs are localized separately under `site/src/pages/*/docs.astro`.

## Releasing

Releases are maintainer-driven: bump `version` in `package.json` + `server.json`, update `CHANGELOG.md`, `npm publish`, update the MCP registry entry. Don't open release PRs.
