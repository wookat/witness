import { writeFile } from "node:fs/promises";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { fmt, type Ev } from "./events.js";
import type { Transcript } from "./transcribe.js";
import type { AssocMap } from "./associate.js";
import { makeAudioSeekable } from "./audio.js";
import { writeSegments } from "./segments.js";
import {
  BURST_MS,
  burstRows,
  groupBlocks,
  isNoisyEvent,
  isTrigger,
  type Res,
} from "./timeline.js";
import { renderReviewHtml } from "./review-template.js";

export { renderReviewHtml };

export interface Meta {
  url: string;
  startedAt: number;
  durationMs: number;
  viewport?: { width: number; height: number };
  title?: string;
  lang?: string;      // speech recognition language hint, if user set one
  audio?: boolean;    // audio.webm captured at all (mic may still be silent)
  asr?: string;       // live ASR engine used during recording
}

const esc = (s?: string) => (s ?? "").replace(/</g, "&lt;").slice(0, 400);

function formatLine(e: Ev, resOfReq: Map<Ev, Res>): string | null {
  switch (e.kind) {
    case "nav": return `- \`${fmt(e.t)}\` **NAV** ${e.url}${e.title ? ` · “${esc(e.title)}”` : ""}`;
    case "click": return `- \`${fmt(e.t)}\` **CLICK** \`${e.sel}\`${e.text ? ` “${esc(e.text)}”` : ""} · @${e.x},${e.y}${e.shot ? ` · [shot](${e.shot})` : ""}`;
    case "input": return `- \`${fmt(e.t)}\` **INPUT** \`${e.sel}\` · ${e.masked ? "🔒masked" : e.value != null ? `“${esc(e.value)}” (${e.len} chars)` : `${e.len} chars`}`;
    case "scroll": return `- \`${fmt(e.t)}\` **SCROLL** y=${e.y}`;
    case "key": return `- \`${fmt(e.t)}\` **KEY** ${e.key}${e.sel ? ` on \`${e.sel}\`` : ""}`;
    case "console": return `- \`${fmt(e.t)}\` **CONSOLE ${e.level.toUpperCase()}** ${esc(e.text)}${e.stack ? `\n  \`\`\`\n  ${e.stack.slice(0, 600)}\n  \`\`\`` : ""}`;
    case "error": return `- \`${fmt(e.t)}\` **ERROR** ${esc(e.message)}${e.stack ? `\n  \`\`\`\n  ${e.stack.slice(0, 600)}\n  \`\`\`` : ""}`;
    case "req": {
      const r = resOfReq.get(e);
      if (!r) return `- \`${fmt(e.t)}\` **NET →** ${e.method} ${e.url} (${e.resType})`;
      const bad = r.status === 0 || r.status >= 400;
      return `- \`${fmt(e.t)}\` **NET** ${e.method} ${e.url} → ${r.status === 0 ? "FAILED" : `**${r.status}**`}${r.timing != null ? ` · ${r.timing}ms` : ""}${r.bodyPath ? ` · [body${r.bodyTrunc ? ", truncated" : ""}](${r.bodyPath})` : ""}${bad ? " ⚠️" : ""}`;
    }
    case "res": {
      const bad = e.status === 0 || e.status >= 400;
      return `- \`${fmt(e.t)}\` **NET ←** ${e.status === 0 ? "FAILED" : `**${e.status}**`} ${e.url}${e.timing != null ? ` · ${e.timing}ms` : ""}${e.bodyPath ? ` · [body${e.bodyTrunc ? ", truncated" : ""}](${e.bodyPath})` : ""}${bad ? " ⚠️" : ""}`;
    }
    case "ws": return `- \`${fmt(e.t)}\` **WS ${e.dir === "in" ? "←" : "→"}** ${esc(e.url)} ${esc(e.data)}`;
    case "mark": {
      const comp = e.react?.length ? ` · Comp: \`${e.react.join(" › ")}\`` : "";
      const reg = e.region ? ` · region ${e.region.w}×${e.region.h} @${e.region.x},${e.region.y}` : "";
      const html = e.outerHTML ? `\n  \`${esc(e.outerHTML)}\`` : "";
      return `- \`${fmt(e.t)}\` **MARK** \`${e.sel}\`${comp}${reg}${e.shot ? ` · [shot](${e.shot})` : ""}${html}`;
    }
    case "mut": return `- \`${fmt(e.t)}\` **MUT** \`${e.sel}\` ${esc(e.summary)}${(e.n ?? 1) > 1 ? ` ×${e.n}` : ""}`;
    case "dom": return `- \`${fmt(e.t)}\` **DOMSNAP** [html](${e.path})`;
    case "note": return `- \`${fmt(e.t)}\` _note: ${esc(e.text)}_`;
    default: return null;
  }
}

export function renderMarkdown(events: Ev[], meta: Meta, transcript?: Transcript, assoc?: AssocMap): string {
  const blocks = groupBlocks(events);

  // collapse scroll runs: scrolls separated only by ambient events within 2.5s → one line
  const SCROLL_RUN_KILL = new Set(["click", "key", "input", "nav", "mark", "issue"]);
  const scrollDrop = new Set<Ev>();
  const scrollRun = new Map<Ev, { y0: number; yN: number; n: number }>();
  {
    let cur: { first: Ev; y0: number; yN: number; n: number; lastT: number } | null = null;
    for (const e of events) {
      if (e.kind === "scroll") {
        if (cur && e.t - cur.lastT <= 2500) { cur.yN = e.y; cur.n++; cur.lastT = e.t; scrollDrop.add(e); }
        else { cur = { first: e, y0: e.y, yN: e.y, n: 1, lastT: e.t }; scrollRun.set(e, cur); }
      } else if (SCROLL_RUN_KILL.has(e.kind)) cur = null;
    }
  }

  // collapse ws frame floods: same socket+direction within 2.5s → one ×n line
  const WS_KINDS = new Set(["click", "key", "input", "nav", "mark", "issue", "say"]);
  const wsDrop = new Set<Ev>();
  const wsRun = new Map<Ev, { url: string; dir: string; n: number; sample: string }>();
  {
    let cur: { first: Ev; url: string; dir: string; n: number; sample: string; lastT: number } | null = null;
    for (const e of events) {
      if (e.kind === "ws") {
        if (cur && e.t - cur.lastT <= 2500 && e.url === cur.url && e.dir === cur.dir) {
          cur.n++; cur.lastT = e.t; wsDrop.add(e);
        } else {
          cur = { first: e, url: e.url, dir: e.dir, n: 1, sample: e.data.slice(0, 80), lastT: e.t };
          wsRun.set(e, cur);
        }
      } else if (WS_KINDS.has(e.kind)) cur = null;
    }
  }

  // pair each res with its req — by request id when both have one, else nearest earlier unmatched req on same url
  const pairedRes = new Set<Ev>();
  const resOfReq = new Map<Ev, Res>();
  {
    const open: Ev[] = [];
    for (const e of events) {
      if (e.kind === "req") open.push(e);
      else if (e.kind === "res") {
        const rid = (e as { id?: number }).id;
        for (let i = open.length - 1; i >= 0; i--) {
          const q = open[i] as { id?: number; url: string };
          const match = rid != null && q.id != null ? q.id === rid : q.url === e.url;
          if (match) { resOfReq.set(open[i], e); open.splice(i, 1); pairedRes.add(e); break; }
        }
      }
    }
  }

  const parts: string[] = [
    `# Witness Session — ${new Date(meta.startedAt).toISOString().replace("T", " ").slice(0, 19)}`,
    `- **App:** ${meta.url}${meta.title ? ` · ${meta.title}` : ""}`,
    `- **Duration:** ${fmt(meta.durationMs)}${meta.viewport ? ` · **Viewport:** ${meta.viewport.width}×${meta.viewport.height}` : ""}${meta.lang ? ` · **Lang:** ${meta.lang}` : ""}`,
    `- **Files:** \`events.jsonl\` raw · \`shots/\` · \`bodies/\` · \`audio.webm\` · \`transcript.json\``,
    ...(meta.audio && !events.some(e => e.kind === "say")
      ? ["", "> ⚠ **audio.webm exists but zero speech was recognized** — the mic may have been silent/denied or ASR failed. Verify before treating missing SAY blocks as 'user said nothing'."]
      : []),
    "",
    "---",
    "",
    "## Timeline",
  ];

  for (const b of blocks) {
    if (b.issue != null) { parts.push("", `### ${fmt(b.at ?? 0)} · ⏺ ISSUE #${b.issue}`); continue; }
    parts.push("", `### ${b.head === "prelude" ? "00:00 · prelude" : `${fmt(b.at ?? b.evs[0]?.t ?? 0)} · ${b.head}`}`);
    if (b.says && b.says.length > 1) {
      parts.push(...b.says.map(f => `> [\`${fmt(f.segStart)}\`] “${esc(f.text)}”`));
    }
    const saysIn = b.says ?? [];
    const hits = new Set<Ev>();
    const titles: string[] = [];
    for (const s of saysIn) {
      const a = assoc?.get(s);
      if (a?.title) titles.push(a.title);
      a?.hits.forEach(h => hits.add(h));
    }
    const useAssoc = assoc != null && saysIn.some(s => assoc.has(s));
    const uniqTitles = [...new Set(titles)];
    if (uniqTitles.length) parts.push(`**→ ${uniqTitles.join(" · ")}**`);
    const vis = b.evs.filter(e => !isNoisyEvent(e) && !pairedRes.has(e) && !scrollDrop.has(e) && !wsDrop.has(e) && e.kind !== "shot" && e.kind !== "_ui")
      .filter((e, i, a) => !(e.kind === "nav" && a[i - 1]?.kind === "nav" && (a[i - 1] as any).url === e.url))
      .filter(e => !useAssoc || e.kind === "say" || hits.has(e));
    const hidden = b.evs.length - vis.length;
    const lines: string[] = [];
    const rows = burstRows(vis);
    for (let ri = 0; ri < rows.length; ri++) {
      const r = rows[ri];
      if (r.lead.kind === "ws" && wsRun.has(r.lead)) {
        const w = wsRun.get(r.lead)!;
        lines.push(`- \`${fmt(r.lead.t)}\` **WS ${w.dir === "in" ? "←" : "→"}** ${w.url} ×${w.n} — e.g. ${esc(w.sample)}`);
        continue;
      }
      if (r.lead.kind === "scroll" && scrollRun.has(r.lead)) {
        const s = scrollRun.get(r.lead)!;
        lines.push(s.n > 1
          ? `- \`${fmt(r.lead.t)}\` **SCROLL** y=${s.y0}→${s.yN} ×${s.n}`
          : formatLine(r.lead, resOfReq)!);
        continue;
      }
      if (r.lead.kind === "mut") {
        const key = `${r.lead.sel}|${r.lead.summary}`;
        let n = r.lead.n ?? 1;
        while (ri + 1 < rows.length && rows[ri + 1].lead.kind === "mut" &&
               `${(rows[ri + 1].lead as Extract<Ev, { kind: "mut" }>).sel}|${(rows[ri + 1].lead as Extract<Ev, { kind: "mut" }>).summary}` === key) {
          n += ((rows[++ri].lead as Extract<Ev, { kind: "mut" }>).n ?? 1);
        }
        const l = formatLine(r.lead, resOfReq);
        if (l) lines.push(l.replace(/ ×\d+$/, "") + (n > 1 ? ` ×${n}` : ""));
        continue;
      }
      const l = formatLine(r.lead, resOfReq);
      if (l) lines.push(l);
      if (!r.burst.length && isTrigger(r.lead))
        lines.push(`  - _(no page reaction for ${BURST_MS / 1000}s after the click — that itself is evidence)_`);
      for (const be of r.burst.slice(0, 8)) {
        if (pairedRes.has(be)) continue;
        const bl = formatLine(be, resOfReq);
        if (bl) lines.push("  " + bl.replace(/\n/g, "\n  "));
      }
      if (r.burst.length > 8) lines.push(`  - _… +${r.burst.length - 8} more in burst — see events.jsonl_`);
    }
    if (hidden > 0) lines.push(`- _… ${hidden} ${useAssoc ? "other" : "paired/noise/collapsed"} events hidden — see events.jsonl_`);
    parts.push(...(lines.length ? lines : ["- _(no recorded activity)_"]));
  }

  if (transcript?.text) {
    parts.push("", "---", "", "## Transcript", "", transcript.text, "");
  }

  return parts.join("\n");
}

export function renderPrompt(sessionDir: string, events: Ev[] = [], issueCount = 0): string {
  const vocab = [...new Set(
    events.flatMap(e => (e.kind === "mark" || e.kind === "click") && e.text ? [e.text] : [])
  )].slice(0, 30);
  return [
    "This is a product-feedback session recorded by Witness (voice + clicks + live page evidence).",
    "",
    `Evidence directory: ${sessionDir}`,
    "",
    "Process in this order:",
    `1. Read \`SEGMENTS.md\` — an index of ${issueCount} speech-anchored segments; each segment's verbatim speech, suspect elements, screenshots and DOM snapshots are packaged in \`segments/NN.md\``,
    "   (segment boundaries are cut mechanically — adjacent segments may merge, one segment may hold several issues; `session.md` is the full timeline archive for more context)",
    "2. First restate the user's issues as a checklist (grouped by you, not copied per-segment), get user confirmation before touching code — do NOT start fixing:",
    "   | # | time | user said (verbatim) | your understanding | linked evidence |",
    "   Merge adjacent segments into one issue; split multi-issue segments into 1a/1b; mark ambiguous ones ❓ and ask the user — never guess.",
    "   End the checklist with: \"N issues total — anything missing or misunderstood?\"",
    "3. After the user confirms (or corrects), fix them one by one: locate code via `selector`/`React component name`; pull raw data from `events.jsonl`; verify visuals in `shots/`",
    "4. For anything you can't fix, state the reason and the extra evidence needed in your report.",
    "",
    "Note: SAY lines are raw speech-recognition fragments (split on pauses); consecutive fragments may belong to one utterance. They contain colloquialisms and homophone errors — read for intent using the vocabulary below, not literally.",
    "SAY blocks marked `⚠ low-confidence ASR` had low mean word-probability — the wording may be wrong; verify against shots/audio before quoting it as fact.",
    "`⏺ ISSUE #n` marks an issue boundary the user cut explicitly with the N key — speech and evidence between boundaries belong to the same issue.",
    "The paused/resumed window records nothing (the user deliberately froze evidence) — do not interpret that interval.",
    ...(vocab.length ? [`Page element text (to help read the transcript): ${vocab.join(" / ")}`] : []),
    "IMPORTANT: if there are no SAY segments, never infer what the user wanted to report from clicks/scrolls — those are only interaction evidence. Ask the user directly what the session was about.",
  ].join("\n");
}

export async function writeSessionFiles(dir: string, events: Ev[], meta: Meta, transcript?: Transcript, assoc?: AssocMap) {
  const md = renderMarkdown(events, meta, transcript, assoc);
  const segs = writeSegments(dir, events, { url: meta.url, durationMs: meta.durationMs });
  makeAudioSeekable(join(dir, "audio.webm"), meta.durationMs);
  let rrJsonl: string | undefined;
  try { rrJsonl = readFileSync(join(dir, "rrweb.jsonl"), "utf8"); } catch {}
  if (!meta.title) {
    try {
      const snap = readdirSync(join(dir, "dom")).find(f => f.endsWith("-nav.html"));
      if (snap) meta = { ...meta, title: readFileSync(join(dir, "dom", snap), "utf8").match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || undefined };
    } catch {}
  }
  const prompt = renderPrompt(dir, events, segs.length);
  const html = renderReviewHtml(events, meta, rrJsonl, prompt, segs);
  await writeFile(join(dir, "session.md"), md);
  await writeFile(join(dir, "review.html"), html);
  await writeFile(join(dir, "PROMPT.md"), prompt);
  await writeFile(join(dir, "README.txt"), [
    "How to read this directory —",
    "",
    "[For humans] Double-click review.html",
    "    A visual timeline aligning speech, screenshots and interactions; click a speech fragment to jump to that point in the recording.",
    "",
    "[For AI agents] Hand PROMPT.md to an agent along with this directory",
    "    SEGMENTS.md speech-segment index (read first) · segments/NN.md one package per segment · session.md evidence timeline",
    "    events.jsonl raw events · shots/ screenshots · audio.webm recording",
    "",
    "Rest: session.json metadata · transcript.json recognition results · bodies/ response bodies",
  ].join("\n"));
  if (transcript) await writeFile(join(dir, "transcript.json"), JSON.stringify(transcript, null, 1));
  if (assoc?.size) {
    const idx = new Map(events.map((e, i) => [e, i]));
    await writeFile(join(dir, "assoc.json"), JSON.stringify(
      [...assoc.entries()].map(([s, a]) => ({
        say: idx.get(s),
        title: a.title,
        hits: [...a.hits].map(h => idx.get(h)),
      })), null, 1));
  }
  return { md, html, prompt };
}

export function copyToClipboard(text: string) {
  try {
    if (process.platform === "win32") {
      execSync(`powershell -NoProfile -Command "Set-Clipboard -Value ([Console]::In.ReadToEnd())"`, { input: text });
    } else if (process.platform === "darwin") {
      execSync("pbcopy", { input: text });
    } else {
      execSync("xclip -selection clipboard", { input: text });
    }
    return true;
  } catch { return false; }
}
