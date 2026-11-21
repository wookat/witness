// Injected into every page via context.addInitScript().
// Self-contained IIFE — no imports, runs in page context.
// Communicates with node via __witEmit (events), __witAudio (webm chunks), and __witPcm (16k PCM).

export const PAGE_SCRIPT = (lang?: string, opts: { sr?: boolean; pcm?: boolean; asrLabel?: string } = {}) => `
(function () {
  if (window.__wit) return;
  if (location.href === "about:blank") return;
  const W = (window.__wit = {
    seq: 0,
    marks: 0,
    issues: 0,
    paused: false,
    stopped: false,
    inspect: false,
    captionsOn: true,
    muted: !window.isSecureContext,
    emit: (e) => {
      if (W.paused && e.kind !== "_ui") return; // freeze evidence while paused; stop still works
      try { window.__witEmit && window.__witEmit(e); } catch {}
    },
  });

  const isSensitive = (el) => {
    if (!el || el.nodeType !== 1) return false;
    if (el.type === "password") return true;
    const ac = (el.getAttribute && el.getAttribute("autocomplete")) || "";
    return /password|one-time-code|cc-|credit/i.test(ac);
  };
  const clip = (s, n) => (s == null ? s : String(s).length > n ? String(s).slice(0, n) + "…" : String(s));
  const shortText = (el) => {
    if (isSensitive(el)) return "•••";
    return clip((el.innerText || el.value || el.getAttribute("aria-label") || "").trim().replace(/\\s+/g, " "), 40);
  };

  function sel(el) {
    if (!el || el.nodeType !== 1) return "";
    const dt = el.getAttribute("data-testid") || el.getAttribute("data-test-id");
    if (dt) return \`[data-testid="\${dt}"]\`;
    if (el.id) return "#" + CSS.escape(el.id);
    const tag = el.tagName.toLowerCase();
    if (["button", "a", "input", "select", "textarea"].includes(tag)) {
      const t = isSensitive(el) ? "" : shortText(el);
      if (t) return \`\${tag}:has-text("\${t.replace(/"/g, '\\\\"')}")\`;
      if (tag === "input") return \`input[type="\${el.type || "text"}"]\`;
      const cls = [...el.classList].slice(0, 2).map((c) => "." + CSS.escape(c)).join("");
      if (cls) return tag + cls;
    }
    const parts = [];
    let n = el;
    while (n && n.nodeType === 1 && parts.length < 5) {
      let p = n.tagName.toLowerCase();
      if (n.id) { parts.unshift("#" + CSS.escape(n.id)); break; }
      const cls = [...n.classList].slice(0, 2).map((c) => "." + CSS.escape(c)).join("");
      if (cls) p += cls;
      const same = [...(n.parentElement?.children || [])].filter((c) => c.tagName === n.tagName);
      if (same.length > 1) p += \`:nth-of-type(\${same.indexOf(n) + 1})\`;
      parts.unshift(p);
      n = n.parentElement;
    }
    return parts.join(" > ");
  }

  function reactChain(el) {
    try {
      const out = [];
      let n = el, hops = 0;
      while (n && hops++ < 15) {
        const key = Object.keys(n).find((k) => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$"));
        if (key) {
          let f = n[key], depth = 0;
          while (f && depth++ < 12) {
            const name = f.type && (f.type.displayName || f.type.name || (typeof f.type === "string" ? null : f.type.render?.name));
            if (name && !out.includes(name)) out.push(name);
            f = f.return;
          }
          break;
        }
        n = n.parentElement;
      }
      return out;
    } catch { return []; }
  }

  function vueChain(el) {
    try {
      const out = [];
      let n = el, hops = 0;
      while (n && hops++ < 15) {
        let c = n.__vueParentComponent, depth = 0;
        while (c && depth++ < 12) {
          const nm = c.type && (c.type.name || c.type.__name);
          if (nm && !["App", "RouterView", "RouterLink", "Transition", "BaseTransition", "Teleport"].includes(nm) && !out.includes(nm)) out.push(nm);
          c = c.parent;
        }
        if (out.length) break;
        n = n.parentElement;
      }
      return out;
    } catch { return []; }
  }

  const compChain = (el) => { const r = reactChain(el); return r.length ? r : vueChain(el); };

  function flashBox(x, y, w, h, color) {
    const f = document.createElement("div");
    f.id = "wit-hl-" + (++W.seq);
    f.style.cssText = \`position:fixed;left:\${x - 3}px;top:\${y - 3}px;width:\${w + 6}px;height:\${h + 6}px;border:2.5px dashed \${color};border-radius:4px;z-index:2147483646;pointer-events:none;background:rgba(255,60,60,.08)\`;
    document.documentElement.appendChild(f);
    setTimeout(() => f.remove(), 1400);
  }

  const ready = (fn) => { if (document.documentElement) fn(); else document.addEventListener("DOMContentLoaded", fn, { once: true }); };
  ready(function boot() {
  // ---------- HUD toolbar (Shadow DOM isolated) ----------
  const host = document.createElement("div");
  host.id = "__wit-host";
  const root = host.attachShadow({ mode: "open" });
  const initAsr = ${JSON.stringify(opts.asrLabel ?? "auto")};
  root.innerHTML = \`
    <style>
      .bar{position:fixed;top:12px;right:12px;z-index:2147483647;display:flex;align-items:center;gap:7px;
        background:rgba(23,24,29,.94);backdrop-filter:blur(10px);color:#eee;font:12px/1.4 ui-monospace,Consolas,monospace;
        padding:6px 10px;border-radius:11px;border:1px solid rgba(255,255,255,.1);
        box-shadow:0 8px 26px rgba(0,0,0,.38);user-select:none}
      .bar.paused{border-color:rgba(234,179,8,.55)}
      .dot{width:8px;height:8px;border-radius:50%;background:#e5484d;animation:blink 1.2s infinite;flex:none}
      @keyframes blink{50%{opacity:.25}}
      .time{min-width:42px;color:#fff;font-variant-numeric:tabular-nums}
      .tag{font-size:10px;color:#a5abb8;background:rgba(255,255,255,.08);padding:2px 6px;border-radius:5px;white-space:nowrap}
      .tag.p{background:#854d0e;color:#fef08a;display:none}
      .bar.paused .tag.p{display:inline-block}
      button{background:#2c2d36;border:1px solid rgba(255,255,255,.06);color:#eee;border-radius:6px;padding:3px 7px;cursor:pointer;font:inherit;display:inline-flex;align-items:center;gap:4px}
      button:hover{background:#3a3b46}
      button.stop{background:#c92a2a;border-color:#e03131}
      button.stop:hover{background:#e03131}
      button.on{background:#2563eb;border-color:#3b82f6}
      button[data-a="issue"]{color:#ffd66e}
      button[data-a="pause"].on{background:#854d0e;border-color:#ca8a04}
      button[data-a="cc"].off{opacity:.45}
      .meter{width:36px;height:8px;background:#09090b;border-radius:4px;overflow:hidden;border:1px solid rgba(255,255,255,.08)}
      .meter i{display:block;height:100%;width:0%;background:#4ade80;transition:width .08s}
      .cap{position:fixed;top:52px;right:12px;z-index:2147483647;max-width:min(420px,88vw);background:rgba(23,24,29,.9);
        color:#d6d9e2;font:11.5px/1.5 ui-monospace,Consolas,monospace;padding:5px 10px;border-radius:8px;
        border:1px solid rgba(255,255,255,.08);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;pointer-events:none}
      .cap.live{color:#93c5fd}
      .hint{position:fixed;bottom:14px;right:14px;z-index:2147483647;background:rgba(23,24,29,.92);color:#d6d9e2;
        font:11px/1.6 ui-monospace,Consolas,monospace;padding:7px 11px;border-radius:9px;border:1px solid rgba(255,255,255,.1);pointer-events:none}
      .help{position:fixed;top:54px;right:12px;z-index:2147483647;background:rgba(23,24,29,.96);color:#d6d9e2;
        font:11px/1.75 ui-monospace,Consolas,monospace;padding:10px 13px;border-radius:10px;border:1px solid rgba(255,255,255,.12);
        box-shadow:0 14px 36px rgba(0,0,0,.45)}
      .help b{color:#ff8a5b}
    </style>
    <div class="bar">
      <span class="grip" style="cursor:grab" title="Drag toolbar">⠿</span>
      <span class="dot"></span>
      <span class="time">00:00</span>
      <span class="tag p">PAUSED</span>
      <span class="meter" title="Microphone level"><i></i></span>
      <span class="tag asr" title="Live ASR engine"></span>
      <button data-a="mark" title="Inspect & mark element or drag region (M / Ctrl+Click)">◎ <span class="mc">0</span></button>
      <button data-a="issue" title="Cut new issue boundary (N)">#<span class="ic">0</span></button>
      <button data-a="cc" title="Toggle live captions">CC</button>
      <button data-a="pause" title="Pause / resume — freezes evidence & mic (P)">⏸</button>
      <button data-a="help" title="Shortcuts">?</button>
      <button data-a="stop" class="stop" title="Stop recording (Alt+Shift+R)">■</button>
    </div>
    <div class="cap" hidden></div>
    <div class="help" hidden>
      <div><b>Ctrl+Click</b> mark element</div>
      <div><b>M</b> inspect / drag region · <b>Esc</b> exit</div>
      <div><b>N</b> issue divider · <b>P</b> pause privacy freeze</div>
      <div><b>Alt+Shift+R</b> or <b>■</b> stop &amp; save</div>
    </div>
    <div class="hint" hidden>inspect · click to mark · drag to crop region · M / Esc exit</div>\`;
  document.documentElement.appendChild(host);

  const $ = (s) => root.querySelector(s);
  const barEl = $(".bar"), timeEl = $(".time"), hintEl = $(".hint"), meterEl = $(".meter i");
  const markBtn = $('button[data-a="mark"]'), markCnt = $(".mc"), issueCnt = $(".ic");
  const ccBtn = $('button[data-a="cc"]'), pauseBtn = $('button[data-a="pause"]'), dotEl = $(".dot");
  const capEl = $(".cap"), helpEl = $(".help"), asrEl = $(".asr");
  asrEl.textContent = initAsr;

  W.setAsrLabel = (name) => { if (asrEl && name) asrEl.textContent = name; };
  const bumpMark = () => { W.marks++; if (markCnt) markCnt.textContent = String(W.marks); };
  const bumpIssue = () => { W.issues++; if (issueCnt) issueCnt.textContent = String(W.issues); W.emit({ kind: "issue", n: W.issues }); };

  function markAt(el, how) {
    if (!el || W.paused) return;
    const b = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    bumpMark();
    flashBox(b.left, b.top, b.width, b.height, "#e5484d");
    W.emit({
      kind: "mark",
      how,
      sel: sel(el),
      outerHTML: clip(isSensitive(el) ? el.outerHTML.replace(/value="[^"]*"/g, 'value="***"') : el.outerHTML, 600),
      box: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) },
      styles: { display: cs.display, color: cs.color, background: cs.backgroundColor, font: cs.font, position: cs.position },
      react: compChain(el),
      text: shortText(el),
    });
  }

  let capTimer = null;
  function setCap(text, live) {
    if (!capEl || !W.captionsOn || W.paused) return;
    capEl.hidden = false;
    capEl.textContent = (live ? "… " : "") + text;
    capEl.classList.toggle("live", !!live);
    clearTimeout(capTimer);
    capTimer = setTimeout(() => { capEl.hidden = true; }, 5000);
  }

  // Pause / resume: freezes ALL evidence, MediaRecorder, PCM tap, SR, and displayed timer
  let activeMs = 0, lastTickAt = Date.now();
  function setPaused(on) {
    if (W.paused === on) return;
    if (on) {
      activeMs += Date.now() - lastTickAt;
      W.emit({ kind: "note", text: "paused" }); // emit BEFORE flag — paused drops non-_ui events
      W.paused = true;
      barEl.classList.add("paused");
      pauseBtn.textContent = "▶";
      pauseBtn.classList.add("on");
      capEl.hidden = true;
      W.emit({ kind: "_ui", action: "paused" });
      dotEl.style.animation = "none";
      dotEl.style.background = "#eab308";
      try { W.recorder && W.recorder.state === "recording" && W.recorder.pause(); } catch {}
      try { W.sr && W.sr.stop(); } catch {}
    } else {
      lastTickAt = Date.now();
      W.paused = false;
      barEl.classList.remove("paused");
      pauseBtn.textContent = "⏸";
      pauseBtn.classList.remove("on");
      W.emit({ kind: "_ui", action: "resumed" });
      dotEl.style.animation = "";
      dotEl.style.background = "#e5484d";
      try { W.recorder && W.recorder.state === "paused" && W.recorder.resume(); } catch {}
      try { W.sr && W.sr.start(); } catch {}
      W.emit({ kind: "note", text: "resumed" });
    }
  }
  W.setPaused = setPaused;

  // Drag toolbar with viewport clamping
  (() => {
    const grip = $(".grip");
    let dx = 0, dy = 0, on = false;
    grip.addEventListener("pointerdown", (e) => { on = true; dx = e.clientX; dy = e.clientY; try { grip.setPointerCapture(e.pointerId); } catch {} });
    grip.addEventListener("pointermove", (e) => {
      if (!on) return;
      const r = barEl.getBoundingClientRect();
      const nl = Math.max(8, Math.min(innerWidth - r.width - 8, r.left + e.clientX - dx));
      const nt = Math.max(8, Math.min(innerHeight - r.height - 8, r.top + e.clientY - dy));
      barEl.style.left = nl + "px";
      barEl.style.top = nt + "px";
      barEl.style.right = "auto";
      dx = e.clientX; dy = e.clientY;
    });
    grip.addEventListener("pointerup", () => { on = false; });
  })();

  const intervals = [];
  const t0 = Date.now();
  intervals.push(setInterval(() => {
    const ms = W.paused ? activeMs : activeMs + (Date.now() - lastTickAt);
    const s = Math.floor(ms / 1000);
    timeEl.textContent = String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  }, 500));

  // ---------- inspect mode (zero cssText leak + viewport-clamped tooltip) ----------
  const ov = document.createElement("div");
  ov.style.cssText = "position:fixed;inset:0;z-index:2147483645;cursor:crosshair;display:none;background:transparent";
  const hl = document.createElement("div");
  hl.style.cssText = "position:fixed;z-index:2147483646;pointer-events:none;border:2px solid #e5484d;background:rgba(229,72,77,.10);border-radius:3px;display:none";
  const hlTag = document.createElement("div");
  hlTag.style.cssText = "position:fixed;z-index:2147483646;pointer-events:none;background:#17181d;color:#ffd66e;font:11px ui-monospace,monospace;padding:2px 6px;border-radius:4px;display:none;max-width:340px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis";
  const selBox = document.createElement("div");
  selBox.style.cssText = "position:fixed;z-index:2147483646;pointer-events:none;border:2px dashed #38bdf8;background:rgba(56,189,248,.12);display:none";
  document.documentElement.append(ov, hl, hlTag, selBox);

  function setInspect(on) {
    W.inspect = on;
    ov.style.display = on ? "block" : "none";
    hintEl.hidden = !on;
    markBtn.classList.toggle("on", on);
    if (!on) { hl.style.display = "none"; hlTag.style.display = "none"; selBox.style.display = "none"; }
  }

  let drag = null, suppressClick = false;
  ov.addEventListener("pointerdown", (e) => {
    drag = { x: e.clientX, y: e.clientY };
    try { ov.setPointerCapture(e.pointerId); } catch {}
  });
  ov.addEventListener("pointermove", (e) => {
    if (drag) {
      const x = Math.min(drag.x, e.clientX), y = Math.min(drag.y, e.clientY);
      const w = Math.abs(e.clientX - drag.x), h = Math.abs(e.clientY - drag.y);
      selBox.style.display = "block";
      selBox.style.left = x + "px";
      selBox.style.top = y + "px";
      selBox.style.width = w + "px";
      selBox.style.height = h + "px";
      hl.style.display = "none";
      hlTag.style.display = "none";
      return;
    }
    const el = document.elementsFromPoint(e.clientX, e.clientY).find((n) => !ov.contains(n) && n !== ov && n.id !== "__wit-host" && !hl.contains(n) && n !== hlTag && n !== selBox);
    if (!el) return;
    const b = el.getBoundingClientRect();
    hl.style.display = "block";
    hl.style.left = (b.left - 2) + "px";
    hl.style.top = (b.top - 2) + "px";
    hl.style.width = (b.width + 4) + "px";
    hl.style.height = (b.height + 4) + "px";
    const chain = compChain(el).join(" < ");
    hlTag.textContent = sel(el) + (chain ? "  ‹" + chain + "›" : "");
    hlTag.style.display = "block";
    hlTag.style.left = Math.max(8, Math.min(e.clientX + 12, innerWidth - 350)) + "px";
    hlTag.style.top = Math.max(8, Math.min(e.clientY + 14, innerHeight - 30)) + "px";
  });
  ov.addEventListener("pointerup", (e) => {
    if (!drag) return;
    const x = Math.min(drag.x, e.clientX), y = Math.min(drag.y, e.clientY);
    const w = Math.abs(e.clientX - drag.x), h = Math.abs(e.clientY - drag.y);
    drag = null;
    selBox.style.display = "none";
    if (w > 8 && h > 8 && !W.paused) {
      suppressClick = true;
      bumpMark();
      flashBox(x, y, w, h, "#38bdf8");
      W.emit({
        kind: "mark", how: "region", sel: "<region>", outerHTML: "", text: "",
        box: { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) },
        region: { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) },
      });
    }
  });
  ov.addEventListener("click", (e) => {
    e.preventDefault(); e.stopPropagation();
    if (suppressClick) { suppressClick = false; return; }
    const el = document.elementsFromPoint(e.clientX, e.clientY).find((n) => n !== ov && n.id !== "__wit-host" && !hl.contains(n) && n !== hlTag && n !== selBox);
    markAt(el, "inspect");
  });

  // ---------- event listeners ----------
  document.addEventListener("click", (e) => {
    if (e.composedPath && e.composedPath().some((n) => n && n.id === "__wit-host")) return;
    if (e.ctrlKey || e.metaKey) {
      const el = document.elementsFromPoint(e.clientX, e.clientY).find((n) => n.id !== "__wit-host");
      e.preventDefault(); e.stopPropagation();
      markAt(el, "ctrl-click");
      return;
    }
    if (W.inspect) return;
    const el = e.target && e.target.closest ? e.target.closest("a,button,[role=button],input,select,label,summary,[onclick]") || e.target : e.target;
    const cb = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    W.emit({ kind: "click", sel: sel(el), x: e.clientX, y: e.clientY, text: shortText(el), kbd: e.detail === 0 || undefined,
      box: cb && cb.width > 0 ? { x: Math.round(cb.x), y: Math.round(cb.y), w: Math.round(cb.width), h: Math.round(cb.height) } : undefined });
  }, true);

  document.addEventListener("input", (e) => {
    const el = e.target;
    const masked = isSensitive(el);
    const value = masked ? undefined : clip(el.value || "", 160);
    W.emit({ kind: "input", sel: sel(el), masked, len: (el.value || "").length, value });
  }, true);

  let scrT = 0;
  document.addEventListener("scroll", () => {
    clearTimeout(scrT);
    scrT = setTimeout(() => W.emit({ kind: "scroll", y: Math.round(scrollY) }), 250);
  }, true);

  document.addEventListener("keydown", (e) => {
    const editable = e.target && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName || ""));
    if (e.altKey && e.shiftKey && (e.key === "r" || e.key === "R" || e.code === "KeyR")) {
      e.preventDefault();
      W.emit({ kind: "_ui", action: "stop" });
      return;
    }
    if (editable) return;
    // Ignore browser shortcuts (Ctrl+P print, Ctrl+N new window, etc.)
    const plain = !e.ctrlKey && !e.metaKey && !e.altKey;
    if (plain && (e.key === "m" || e.key === "M")) { setInspect(!W.inspect); return; }
    if (plain && (e.key === "n" || e.key === "N")) { bumpIssue(); return; }
    if (plain && (e.key === "p" || e.key === "P")) { setPaused(!W.paused); return; }
    if (e.key === "Escape" && W.inspect) { setInspect(false); return; }
    if (["Tab", "Enter", "Escape"].includes(e.key) && e.target)
      W.emit({ kind: "key", key: e.key, sel: sel(e.target) });
  }, true);

  markBtn.addEventListener("click", () => setInspect(!W.inspect));
  pauseBtn.addEventListener("click", () => setPaused(!W.paused));
  ccBtn.addEventListener("click", () => {
    W.captionsOn = !W.captionsOn;
    ccBtn.classList.toggle("off", !W.captionsOn);
    if (!W.captionsOn) capEl.hidden = true;
  });
  $('button[data-a="help"]').addEventListener("click", () => { helpEl.hidden = !helpEl.hidden; });
  $('button[data-a="issue"]').addEventListener("click", bumpIssue);
  $('button[data-a="stop"]').addEventListener("click", () => W.emit({ kind: "_ui", action: "stop" }));

  // ---------- single MutationObserver + SPA navigation detection ----------
  let lastUrl = location.href;
  const checkNav = () => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      W.emit({ kind: "nav", url: location.href, title: document.title });
    }
  };
  let mutBuf = [];
  const mo = new MutationObserver((list) => {
    checkNav();
    if (W.paused) return;
    for (const m of list.slice(0, 40)) {
      const t = m.target;
      if (t && t.nodeType === 1) {
        if (isSensitive(t)) continue;
        if (t === ov || t === hl || t === hlTag || t === host || t === selBox) continue;
        if (t.id && String(t.id).startsWith("wit-hl-")) continue;
        if (m.type === "attributes" && /^(name|nonce|integrity|autocomplete|data-wit|spellcheck)/.test(m.attributeName || "")) continue;
      }
      let s = "";
      if (m.type === "attributes") {
        const v = m.target.getAttribute(m.attributeName) ?? "";
        if (v !== m.oldValue) s = \`attr \${m.attributeName}: \${clip(m.oldValue, 40)} → \${clip(v, 40)}\`;
      } else if (m.type === "childList") {
        s = \`child +\${m.addedNodes.length} -\${m.removedNodes.length}\`;
      } else if (m.type === "characterData") {
        s = \`text → "\${clip(m.target.data, 60)}"\`;
      }
      if (s) mutBuf.push({
        sel: sel(m.target), summary: s,
        sig: m.type === "attributes" ? \`attr \${m.attributeName}\` : m.type,
      });
    }
  });
  mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeOldValue: true, characterData: true, characterDataOldValue: true });
  intervals.push(setInterval(checkNav, 500));

  const mutRate = new Map();
  intervals.push(setInterval(() => {
    if (mutBuf.length === 0 || W.paused) { mutBuf.length = 0; return; }
    const all = mutBuf.splice(0, mutBuf.length);
    const seen = new Map();
    for (const m of all) {
      const k = m.sel + "|" + m.summary;
      const p = seen.get(k);
      if (p) p.n++; else seen.set(k, { ...m, n: 1 });
    }
    const now = Date.now(), out = [];
    for (const m of seen.values()) {
      const key = m.sel + "|" + m.sig;
      const r = mutRate.get(key);
      if (r && now < r.until) continue;
      const streak = r && now - r.last < 2000 ? r.streak + 1 : 1;
      if (streak >= 6) {
        const ban = (r?.ban || 0) + 1, ms = Math.min(60000, 15000 * ban);
        mutRate.set(key, { until: now + ms, ban, last: now, streak: 0 });
        out.push({ sel: m.sel, summary: \`\${m.sig}: ⟳ flapping — suppressed \${ms / 1000}s\`, n: m.n, sig: "" });
      } else {
        mutRate.set(key, { until: 0, ban: r?.ban || 0, last: now, streak });
        out.push(m);
      }
    }
    if (mutRate.size > 500) mutRate.clear();
    for (const m of out.slice(0, 30)) { const { sig, ...e } = m; W.emit({ kind: "mut", ...e }); }
  }, 400));

  // ---------- mic + single shared AudioContext (PCM tap + level meter) ----------
  let micStream = null, audioCtx = null;
  async function startMic() {
    if (W.muted) { W.emit({ kind: "note", text: "mic unavailable (insecure context)" }); return; }
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const rec = new MediaRecorder(micStream, { mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm" });
      rec.ondataavailable = async (ev) => {
        if (ev.data.size === 0 || W.paused) return;
        const buf = await ev.data.arrayBuffer();
        let bin = "", bytes = new Uint8Array(buf);
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        try { window.__witAudio && window.__witAudio(btoa(bin)); } catch {}
      };
      rec.start(800);
      W.recorder = rec;
      W.emit({ kind: "note", text: "mic recording", tag: "mic-start" });

      audioCtx = new AudioContext();
      const src = audioCtx.createMediaStreamSource(micStream);

      if (${opts.pcm ? "true" : "false"}) (function startPcmTap() {
        try {
          const R = audioCtx.sampleRate / 16000;
          let carry = new Float32Array(0), phase = 0, out = [];
          const WORKLET = 'class P extends AudioWorkletProcessor{process(i){const c=i[0][0];if(c)this.port.postMessage(c.slice(0));return true}}registerProcessor("cap",P)';
          const flush = () => {
            if (!out.length || W.paused || W.stopped) { out = []; return; }
            const b = new Int16Array(out); out = [];
            let bin = ""; const u8 = new Uint8Array(b.buffer);
            for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
            try { window.__witPcm && window.__witPcm(btoa(bin)); } catch {}
          };
          const onChunk = (f32) => {
            if (W.paused || W.stopped) { carry = new Float32Array(0); phase = 0; return; }
            const all = new Float32Array(carry.length + f32.length);
            all.set(carry); all.set(f32, carry.length);
            for (; phase < all.length - 1; phase += R) {
              const i = Math.floor(phase), s = all[i] + (all[i + 1] - all[i]) * (phase - i);
              out.push(Math.max(-32768, Math.min(32767, Math.round(s * 32768))));
            }
            carry = all.slice(Math.floor(phase)); phase -= Math.floor(phase);
          };
          intervals.push(setInterval(flush, 400));
          const mute = audioCtx.createGain(); mute.gain.value = 0;
          (async () => {
            try {
              const blobUrl = URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" }));
              await audioCtx.audioWorklet.addModule(blobUrl);
              URL.revokeObjectURL(blobUrl);
              const node = new AudioWorkletNode(audioCtx, "cap");
              node.port.onmessage = e => onChunk(e.data);
              src.connect(node); node.connect(mute); mute.connect(audioCtx.destination);
              W.emit({ kind: "note", text: "pcm tap: worklet" });
            } catch {
              const sp = audioCtx.createScriptProcessor(4096, 1, 1);
              sp.onaudioprocess = e => onChunk(e.inputBuffer.getChannelData(0));
              src.connect(sp); sp.connect(mute); mute.connect(audioCtx.destination);
              W.emit({ kind: "note", text: "pcm tap: scriptprocessor" });
            }
          })().catch(() => {});
        } catch (e) { W.emit({ kind: "note", text: "pcm tap failed: " + clip(e && e.message, 60) }); }
      })();

      // Level meter reusing same AudioContext
      const an = audioCtx.createAnalyser();
      an.fftSize = 256; src.connect(an);
      const data = new Uint8Array(an.frequencyBinCount);
      (function level() {
        if (!W.recorder || W.stopped) return;
        if (W.paused) { meterEl.style.width = "0%"; }
        else {
          an.getByteTimeDomainData(data);
          let peak = 0;
          for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
          meterEl.style.width = Math.min(100, (peak / 80) * 100) + "%";
          meterEl.style.background = peak > 60 ? "#ef4444" : peak > 20 ? "#4ade80" : "#22c55e";
        }
        requestAnimationFrame(level);
      })();
    } catch (e) {
      W.muted = true;
      W.emit({ kind: "note", text: "mic denied: " + clip(e && e.message, 80), tag: "mic-denied" });
    }
  }
  if (!W.muted) startMic();

  // ---------- in-browser speech recognition ----------
  W.setCap = setCap;
  W.startSR = function () {
    if (W.sr) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    ${lang ? `r.lang = ${JSON.stringify(lang)};` : "/* lang unset — browser/OS default */"}
    r.continuous = true;
    r.interimResults = true;
    let segStart = null;
    r.onresult = (ev) => {
      if (W.paused) return;
      let interim = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i];
        if (segStart == null) segStart = Date.now() - t0;
        if (res.isFinal) {
          const txt = res[0].transcript.trim();
          if (txt) { W.emit({ kind: "say", text: txt, segStart, segEnd: Date.now() - t0 }); setCap(txt, false); }
          segStart = null;
        } else {
          interim += res[0].transcript;
        }
      }
      if (interim.trim()) setCap(interim.trim(), true);
    };
    r.onerror = (e) => {
      if (e.error !== "no-speech" && e.error !== "aborted") W.emit({ kind: "note", text: "speech-recog error: " + (e.error || "?") });
    };
    r.onend = () => { if (W.recorder && !W.stopped && !W.paused) try { r.start(); } catch {} };
    try { r.start(); W.emit({ kind: "note", text: "speech recognition on" }); } catch {}
    W.sr = r;
  };
  if (${opts.sr ? "true" : "false"}) W.startSR();

  // node → page commands
  window.__witCmd = (cmd) => {
    if (cmd === "sr-on") { try { W.startSR(); } catch {} return true; }
    if (cmd === "stop") {
      W.stopped = true;
      for (const iv of intervals) clearInterval(iv);
      try { W.sr && W.sr.stop(); } catch {}
      try { W.recorder && W.recorder.state !== "inactive" && W.recorder.stop(); } catch {}
      W.recorder = null;
      try { micStream && micStream.getTracks().forEach(t => t.stop()); } catch {}
      try { audioCtx && audioCtx.close(); } catch {}
      mo.disconnect();
      return true;
    }
    return false;
  };

  W.emit({ kind: "note", text: "witness injected" });
  });
})();
`;
