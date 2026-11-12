---
name: witness
description: Record voice-anchored product evidence. Use when the user asks to record a session, walk through a page, check the latest recording, or fix issues from a recording — in any language ("record this page", "帮我录一段", "看下最新录制", "按录制修问题"). witness opens a managed browser that captures speech + clicks + requests + console + DOM state into a .witness/sessions/ evidence bundle.
---

# Witness — voice-anchored evidence recording

## When to trigger

- "record a session / walk me through this page / check the latest recording / fix what I recorded" (or the same intent in any language: 帮我录一段, 体验下这个页面, 录一段看看, enregistre, 録画して…)
- The user gives you a `.witness/sessions/<dir>` path or says "this is my recording"

## Start a recording (the user must be present to speak)

```bash
wit start <url>                    # wit installed globally (npm i -g witness-recorder or npm link)
# common flags: --duration 60 (auto-stop) · --lang en-US (recognition language, default: browser/OS) · --asr <engine> · --shot-interval 15000 · --no-transcribe
```

- Derive the dev URL from package.json scripts / the vite port (usually `http://localhost:5173`)
- After starting, tell the user: use the page normally and speak — recognized text streams live under the toolbar. `Ctrl+click` marks an element; `M` enters inspect mode (hover-pick an element, or **drag to lasso a region**); `N` cuts a new issue boundary (one recording can hold several issues); `P` pauses/resumes (evidence fully frozen while paused); `Alt+Shift+R` or the ■ button stops.
- Do not block waiting during recording; session.md is generated on stop. events.jsonl streams to disk, so a killed process still preserves what was recorded.

## Speech pipeline (zero-config defaults)

- Live captions: cloud streaming ASR. `auto` falls through **doubao-web (default, best punctuation) → doubao-ime (sentence-level timestamps + ITN digits) → browser SR**. say events land on the timeline with segStart/segEnd.
- Engine switch (three equivalent ways): `wit config asr auto|doubao-web|doubao-ime|sr|off` (persistent) · `--asr <engine>` / `WIT_ASR` (one-off) · MCP `get_asr`/`set_asr` (an agent can check/switch itself). `off` = no live captions; the final transcript still renders.
- On stop, final transcript chain: OPENAI_API_KEY → whisper-1 word-level timestamps; without a key it falls back to bcut (bilibili's free endpoint, no key needed).
- `ZHIPU_API_KEY` (free at bigmodel.cn) → on stop, GLM-4-Flash corrects homophones/phrasing against the page-element vocabulary (display layer only — raw evidence is never rewritten).
- `wit transcribe <sessionDir>` / `wit correct <sessionDir>`: re-run transcription/correction on a recorded session.
- `wit associate <sessionDir>` (needs ZHIPU_API_KEY): an LLM links each SAY to its related evidence → `assoc.json`; session.md then shows only hit events and collapses the rest. `wit start --associate` runs it automatically on stop.
- `wit recover <sessionDir>`: rebuild session.md/review.html/PROMPT.md from events.jsonl after a crash/interruption.
- `wit mcp [sessionDir]`: stdio MCP server — point an agent's MCP client at it to query evidence on demand; 12 tools: `list_segments`/`segment_detail`/`session_overview`/`list_says`/`session_md`/`events_around`/`get_errors`/`get_shot`/`get_dom_state`/`get_body`/`get_asr`/`set_asr`
- `WIT_CDP=<port>` (env): opens a CDP port on the managed browser — an agent can attach to the recording page and act as the tester itself (drive clicks/marks, all captured).

## Consuming evidence (fixing issues) — follow this algorithm

When the user says "I'm done recording / fix what I recorded":

**Step 1 · Read the index**: `ls .witness/sessions/` for the directory → read **`SEGMENTS.md`** first (a one-screen index of speech anchors: verbatim SAY text, suspect elements, shot/DOM references). Per-segment detail lives in `segments/NN.md`; `session.md` is the full archive — read it only when you need context beyond the segment files. For old sessions without SEGMENTS.md, run `wit segments <dir>`. **Segments ≠ issues**: segments are speech units cut mechanically on ≥4s gaps or intervening actions; semantic grouping is your job.

**Step 2 · Echo a confirmation checklist (do NOT start fixing)**:

| # | time | user said (verbatim) | your understanding | linked evidence |
|---|------|----------------------|--------------------|-----------------|
| 1 | 00:56 | "顶部栏图标没居中" | nav .logo group sits ~2px high | shots/003.jpg · suspects |

- **You group — don't copy per-segment**: adjacent segments are often split by a click (e.g. S4/S5/S6 consecutive, same suspects); merge by meaning into one confirmation item. A segment holding multiple issues splits into 1a/1b.
- Keep the user's words verbatim in whatever language they spoke — quote, never translate.
- Mark ambiguous ones ❓ and ask the user — never guess.
- End with: "N issues total — anything missing or misunderstood?"

**Step 3 · After confirmation, fix one by one — route by issue type**:

| issue type | first evidence | supplementary |
|---|---|---|
| visual / position / style | **open the shot attached to the segment first** (you are multimodal — you must look) | dom/snap + suspects.sel |
| dead button / click does nothing | the segment's dead-click list | shot to confirm visuals |
| errors / network | console/error/res≥400 lines | `bodies/` response bodies |
| behavior / logic | click→req/res burst chain | dom snap before/after state |
| locate source code | suspects `Comp:` chain > `sel` > element text | grep the source |

**Step 4 · Report**: `#n fixed/blocked · evidence points cited · what changed`; for unfixable items state what evidence is missing and ask the user to re-record that part.

**Iron rules**: never conclude on visual claims without looking at the shot first · never infer intent from clicks/scrolls when there are no SAY segments · transcripts are verbatim colloquial speech in the user's language — read for intent, not literally · segments flagged `⚠ evidence gap` = speech claims something the window doesn't show — name the missing evidence in your report · `.witness/` never goes into git · audio/screenshots contain private data — never exfiltrate

## Drill-down path

`SEGMENTS.md` → `segments/NN.md` → `keyframes/` (rrweb replay frames, via `wit keyframes`) → `events.jsonl` (raw events by t window) → `shots/` (marks carry a red box, clicks carry a target crop) → `bodies/` → `transcript.json`

## Report format

Tie every issue back to evidence: `[00:12] SAY "..." · button#submit → POST /api/x 500`, so each fix maps to its evidence; for unfixable items state what evidence is missing and ask the user to re-record that part.
