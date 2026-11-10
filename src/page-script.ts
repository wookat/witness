// Injected into every page via context.addInitScript().
// Self-contained IIFE — no imports, runs in page context.
// Communicates with node via __witEmit (events) and __witAudio (base64 chunks).

export const PAGE_SCRIPT = (lang = "zh-CN") => `
(function () {
  if (window.__wit) return;
  if (location.href === "about:blank") return;
  const W = (window.__wit = {
    seq: 0,
    marks: 0,
    issues: 0,
    paused: false,
    inspect: false,
    muted: !window.isSecureContext,
    emit: (e) => {
      if (W.paused && e.kind !== "_ui") return;   // freeze evidence while paused; stop still works
      try { window.__witEmit && window.__witEmit(e); } catch {}
    },
  });

  const clip = (s, n) => (s == null ? s : String(s).length > n ? String(s).slice(0, n) + "…" : String(s));
  const shortText = (el) => {
    if (el && el.type === "password") return "•••";
    return clip((el.innerText || el.value || el.getAttribute("aria-label") || "").trim().replace(/\\s+/g, " "), 40);
  };

  function sel(el) {
    if (!el || el.nodeType !== 1) return "";
    const dt = el.getAttribute("data-testid") || el.getAttribute("data-test-id");
    if (dt) return \`[data-testid="\${dt}"]\`;
    if (el.id) return "#" + CSS.escape(el.id);
    const tag = el.tagName.toLowerCase();
    if (["button", "a", "input", "select", "textarea"].includes(tag)) {
      const t = el.type === "password" ? "" : shortText(el);
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

  function markAt(el, how) {
    if (!el) return;
    const b = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    W.marks++;
    const id = "wit-hl-" + (++W.seq);
    const hl = document.createElement("div");
    hl.id = id;
    hl.style.cssText = \`position:fixed;left:\${b.left - 4}px;top:\${b.top - 4}px;width:\${b.width + 8}px;height:\${b.height + 8}px;border:2.5px dashed #e33;border-radius:4px;z-index:2147483646;pointer-events:none;background:rgba(255,60,60,.08)\`;
    document.documentElement.appendChild(hl);
    W.emit({
      kind: "mark",
      how,
      sel: sel(el),
      outerHTML: clip(el.type === "password" ? el.outerHTML.replace(/value="[^"]*"/g, 'value="***"') : el.outerHTML, 600),
      box: { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) },
      styles: { display: cs.display, color: cs.color, background: cs.backgroundColor, font: cs.font, position: cs.position },
      react: compChain(el),
      text: shortText(el),
    });
    setTimeout(() => hl.remove(), 1400);
  }

  const ready = (fn) => { if (document.documentElement) fn(); else document.addEventListener("DOMContentLoaded", fn, { once: true }); };
  ready(function boot() {
  // ---------- toolbar ----------
  const host = document.createElement("div");
  host.id = "__wit-host";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = \`
    <style>
      .bar{position:fixed;top:12px;right:12px;z-index:2147483647;display:flex;align-items:center;gap:8px;
        background:#1b1b1f;color:#eee;font:12px/1.4 ui-monospace,Consolas,monospace;padding:6px 10px;
        border-radius:10px;box-shadow:0 4px 18px rgba(0,0,0,.35);user-select:none}
      .dot{width:9px;height:9px;border-radius:50%;background:#e33;animation:blink 1.2s infinite}
      @keyframes blink{50%{opacity:.25}}
      .time{min-width:44px;color:#fff}
      button{background:#2c2c33;border:0;color:#eee;border-radius:6px;padding:4px 8px;cursor:pointer;font:inherit}
      button:hover{background:#3a3a44}
      button.stop{background:#c22}
      button.stop:hover{background:#d33}
      button.on{background:#2c62c2}
      .meter{width:40px;height:10px;background:#000;border-radius:5px;overflow:hidden}
      .meter i{display:block;height:100%;width:0%;background:#4c4;transition:width .08s}
      .hint{position:fixed;bottom:12px;right:12px;z-index:2147483647;background:#1b1b1fd9;color:#ccc;
        font:11px/1.5 ui-monospace,Consolas,monospace;padding:6px 10px;border-radius:8px;pointer-events:none}
      .cap{position:fixed;top:46px;right:12px;z-index:2147483647;max-width:400px;background:#1b1b1fd9;
        color:#cfd3dc;font:11px/1.5 ui-monospace,Consolas,monospace;padding:4px 10px;border-radius:8px;
        overflow:hidden;text-overflow:ellipsis;white-space:nowrap;pointer-events:none}
      .cap.live{color:#8fb0ff}
      button[data-a="issue"]{color:#ffd66e}
      button[data-a="pause"].on{background:#8a6d1a}
    </style>
    <div class="bar">
      <span class="grip" style="cursor:grab">⠿</span>
      <span class="dot"></span>
      <span class="time">00:00</span>
      <span class="meter"><i></i></span>
      <button data-a="mark" title="Mark element (M / Ctrl+Click)">◎</button>
      <button data-a="issue" title="New issue boundary (N)">⧉</button>
      <button data-a="pause" title="Pause / resume (P)">⏸</button>
      <button data-a="stop" class="stop" title="Stop (Alt+Shift+R)">■</button>
    </div>
    <div class="cap" hidden></div>
    <div class="hint" hidden>inspect · hover + click · M/Esc exit</div>\`;
  document.documentElement.appendChild(host);
  const $ = (s) => root.querySelector(s);
  const timeEl = $(".time"), hintEl = $(".hint"), meterEl = $(".meter i"), markBtn = $('button[data-a="mark"]');
  const capEl = $(".cap"), pauseBtn = $('button[data-a="pause"]'), dotEl = $(".dot");

  // live speech preview — shows the latest recognized fragment so the user knows the mic hears them
  let capTimer = null;
  function setCap(text, live) {
    if (!capEl) return;
    capEl.hidden = false;
    capEl.textContent = (live ? "… " : "") + text;
    capEl.classList.toggle("live", !!live);
    clearTimeout(capTimer);
    capTimer = setTimeout(() => { capEl.hidden = true; }, 5000);
  }

  // pause / resume — while paused ALL evidence emission is dropped (privacy + clean timeline)
  function setPaused(on) {
    if (W.paused === on) return;
    if (on) {
      W.emit({ kind: "note", text: "paused" });   // emit BEFORE flag — paused drops non-_ui events
      W.paused = true;
      pauseBtn.textContent = "▶";
      pauseBtn.classList.add("on");
      W.emit({ kind: "_ui", action: "paused" });
      dotEl.style.animation = "none";
      dotEl.style.background = "#888";
      try { W.recorder && W.recorder.state === "recording" && W.recorder.pause(); } catch {}
      try { W.sr && W.sr.stop(); } catch {}
    } else {
      W.paused = false;
      pauseBtn.textContent = "⏸";
      pauseBtn.classList.remove("on");
      W.emit({ kind: "_ui", action: "resumed" });
      dotEl.style.animation = "";
      dotEl.style.background = "#e33";
      try { W.recorder && W.recorder.state === "paused" && W.recorder.resume(); } catch {}
      try { W.sr && W.sr.start(); } catch {}
      W.emit({ kind: "note", text: "resumed" });
    }
  }
  W.setPaused = setPaused;

  // drag
  (() => {
    const grip = $(".grip"), bar = $(".bar");
    let dx = 0, dy = 0, on = false;
    grip.addEventListener("pointerdown", (e) => { on = true; dx = e.clientX; dy = e.clientY; grip.setPointerCapture(e.pointerId); });
    grip.addEventListener("pointermove", (e) => { if (!on) return; const r = bar.getBoundingClientRect(); bar.style.left = r.left + e.clientX - dx + "px"; bar.style.top = r.top + e.clientY - dy + "px"; bar.style.right = "auto"; dx = e.clientX; dy = e.clientY; });
    grip.addEventListener("pointerup", () => (on = false));
  })();

  // timer (node is source of truth for t; this is display only)
  const t0 = Date.now();
  setInterval(() => {
    const s = Math.floor((Date.now() - t0) / 1000);
    timeEl.textContent = String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  }, 1000);

  // ---------- inspect mode ----------
  const ov = document.createElement("div");
  ov.style.cssText = "position:fixed;inset:0;z-index:2147483645;cursor:crosshair;display:none;background:transparent";
  document.documentElement.appendChild(ov);
  const hl = document.createElement("div");
  hl.style.cssText = "position:fixed;z-index:2147483646;pointer-events:none;border:2px solid #e33;background:rgba(255,60,60,.10);border-radius:3px;display:none";
  const hlTag = document.createElement("div");
  hlTag.style.cssText = "position:fixed;z-index:2147483646;pointer-events:none;background:#1b1b1f;color:#ffd66e;font:11px ui-monospace,monospace;padding:2px 6px;border-radius:4px;display:none;max-width:340px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis";
  document.documentElement.append(hl, hlTag);

  function setInspect(on) {
    W.inspect = on;
    ov.style.display = on ? "block" : "none";
    hintEl.hidden = !on;
    markBtn.classList.toggle("on", on);
    if (!on) { hl.style.display = hlTag.style.display = "none"; }
  }
  const selBox = document.createElement("div");
  selBox.style.cssText = "position:fixed;z-index:2147483646;pointer-events:none;border:2px dashed #3af;background:rgba(60,160,255,.12);display:none";
  document.documentElement.appendChild(selBox);
  let drag = null, suppressClick = false;
  ov.addEventListener("pointerdown", (e) => {
    drag = { x: e.clientX, y: e.clientY };
    try { ov.setPointerCapture(e.pointerId); } catch {}
  });
  ov.addEventListener("pointermove", (e) => {
    if (drag) {
      const x = Math.min(drag.x, e.clientX), y = Math.min(drag.y, e.clientY);
      const w = Math.abs(e.clientX - drag.x), h = Math.abs(e.clientY - drag.y);
      selBox.style.cssText += ";display:block;left:" + x + "px;top:" + y + "px;width:" + w + "px;height:" + h + "px";
      hl.style.display = hlTag.style.display = "none";
      return;
    }
    const el = document.elementsFromPoint(e.clientX, e.clientY).find((n) => !ov.contains(n) && n !== ov && n.id !== "__wit-host" && !hl.contains(n) && n !== hlTag);
    if (!el) return;
    const b = el.getBoundingClientRect();
    hl.style.cssText += \`;display:block;left:\${b.left - 2}px;top:\${b.top - 2}px;width:\${b.width + 4}px;height:\${b.height + 4}px\`;
    const chain = compChain(el).join(" < ");
    hlTag.textContent = sel(el) + (chain ? "  ‹" + chain + "›" : "");
    hlTag.style.cssText += \`;display:block;left:\${Math.min(e.clientX + 12, innerWidth - 350)}px;top:\${e.clientY + 14}px\`;
  });
  ov.addEventListener("pointerup", (e) => {
    if (!drag) return;
    const x = Math.min(drag.x, e.clientX), y = Math.min(drag.y, e.clientY);
    const w = Math.abs(e.clientX - drag.x), h = Math.abs(e.clientY - drag.y);
    drag = null;
    selBox.style.display = "none";
    if (w > 8 && h > 8) {
      suppressClick = true;
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
    const el = document.elementsFromPoint(e.clientX, e.clientY).find((n) => n !== ov && n.id !== "__wit-host" && !hl.contains(n) && n !== hlTag);
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
    W.emit({ kind: "click", sel: sel(el), x: e.clientX, y: e.clientY, text: shortText(el), kbd: e.detail === 0 || undefined });
  }, true);

  document.addEventListener("input", (e) => {
    const el = e.target;
    const masked = el.type === "password" || el.getAttribute?.("type") === "password";
    W.emit({ kind: "input", sel: sel(el), masked, len: (el.value || "").length });
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
    if (e.key === "m" || e.key === "M") { setInspect(!W.inspect); return; }
    if (e.key === "n" || e.key === "N") { W.emit({ kind: "issue", n: ++W.issues }); return; }
    if (e.key === "p" || e.key === "P") { setPaused(!W.paused); return; }
    if (e.key === "Escape" && W.inspect) { setInspect(false); return; }
    if (["Tab", "Enter", "Escape"].includes(e.key) && e.target)
      W.emit({ kind: "key", key: e.key, sel: sel(e.target) });
  }, true);

  markBtn.addEventListener("click", () => setInspect(!W.inspect));
  pauseBtn.addEventListener("click", () => setPaused(!W.paused));
  root.querySelector('button[data-a="issue"]').addEventListener("click", () => W.emit({ kind: "issue", n: ++W.issues }));
  root.querySelector('button[data-a="stop"]').addEventListener("click", () => W.emit({ kind: "_ui", action: "stop" }));

  // ---------- mutation summary ----------
  let mutBuf = [];
  const mo = new MutationObserver((list) => {
    for (const m of list.slice(0, 40)) {
      const t = m.target;
      if (t && t.nodeType === 1) {
        if (t.type === "password") continue;                                    // privacy
        if (t === ov || t === hl || t === hlTag || t === host || t === selBox) continue; // our own overlay
        if (t.id && String(t.id).startsWith("wit-hl-")) continue;               // mark highlights
        if (m.type === "attributes" && /^(name|nonce|integrity|autocomplete|data-wit|spellcheck)/.test(m.attributeName || "")) continue; // caret hacks / our own attrs / browser autofill noise
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
  const mutRate = new Map(); // sel|sig -> { until, ban, last, streak } — flapping backoff
  setInterval(() => {
    if (mutBuf.length === 0) return;
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
  }, 400);

  // ---------- navigation ----------
  // MutationObserver misses SPA pushState that doesn't touch the DOM — poll too
  let lastUrl = location.href;
  const checkNav = () => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      W.emit({ kind: "nav", url: location.href, title: document.title });
    }
  };
  new MutationObserver(checkNav).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(checkNav, 500);

  // ---------- mic ----------
  async function startMic() {
    if (W.muted) { W.emit({ kind: "note", text: "mic unavailable (insecure context)" }); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const rec = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm" });
      rec.ondataavailable = async (ev) => {
        if (ev.data.size === 0) return;
        const buf = await ev.data.arrayBuffer();
        let bin = "", bytes = new Uint8Array(buf);
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        try { window.__witAudio && window.__witAudio(btoa(bin)); } catch {}
      };
      rec.start(800);
      W.recorder = rec;
      W.emit({ kind: "note", text: "mic recording" });
      // meter
      const ac = new AudioContext(), src = ac.createMediaStreamSource(stream), an = ac.createAnalyser();
      an.fftSize = 256; src.connect(an);
      const data = new Uint8Array(an.frequencyBinCount);
      (function level() {
        if (!W.recorder) return;
        an.getByteTimeDomainData(data);
        let peak = 0;
        for (const v of data) peak = Math.max(peak, Math.abs(v - 128));
        meterEl.style.width = Math.min(100, (peak / 80) * 100) + "%";
        meterEl.style.background = peak > 60 ? "#e33" : peak > 20 ? "#4c4" : "#4a4";
        requestAnimationFrame(level);
      })();
    } catch (e) {
      W.muted = true;
      W.emit({ kind: "note", text: "mic denied: " + clip(e && e.message, 80) });
    }
  }
  if (!W.muted) startMic();

  // ---------- in-browser speech recognition (free, real-time) ----------
  (function startSR() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.lang = ${JSON.stringify(lang)};
    r.continuous = true;
    r.interimResults = true;
    let segStart = null;
    r.onresult = (ev) => {
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
  })();

  // node → page commands
  window.__witCmd = (cmd) => {
    if (cmd === "stop") {
      W.stopped = true;
      try { W.sr && W.sr.stop(); } catch {}
      try { W.recorder && W.recorder.state !== "inactive" && W.recorder.stop(); } catch {}
      W.recorder = null;
      mo.disconnect();
      return true;
    }
    return false;
  };

  W.emit({ kind: "note", text: "witness injected" });
  });
})();
`;
