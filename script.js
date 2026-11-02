/**
 * CGPA Calculator — UI layer.
 * All calculation, migration and term logic lives in calc.js (window.CGPA).
 * This file renders state, wires events (delegated) and handles import/export.
 */
(function () {
  "use strict";

  const C = window.CGPA;
  const STORAGE_KEY = "cgpaData";
  const THEME_COLORS = { light: "#f7f6f2", dark: "#0f1416" };
  const FIRST_YEAR = 2010;

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const darkMQ = window.matchMedia("(prefers-color-scheme: dark)");
  const reducedMQ = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* ───────────── Helpers ───────────── */

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  const fmt2 = (n) => (Number(n) || 0).toFixed(2);
  const fmtNum = (n) => {
    const v = Number(n) || 0;
    return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(2)));
  };
  const plural = (n, word) => fmtNum(n) + " " + word + (Number(n) === 1 ? "" : "s");

  const ICONS = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    pencil: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
    up: '<path d="m6 15 6-6 6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    arrowUp: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    arrowDown: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    flat: '<path d="M5 12h14"/>',
    chev: '<path d="m9 6 6 6-6 6"/>',
  };
  const icon = (name) =>
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + ICONS[name] + "</svg>";

  function today() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function gradeText(course) {
    return course.grade ? course.grade + " (" + fmt2(course.gpa) + ")" : fmt2(course.gpa);
  }

  /* ───────────── State & storage ───────────── */

  let state = loadState();
  let lastResult = null;
  let shownCgpa = null;
  let cgpaAnim = 0;

  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return C.migrate(JSON.parse(saved));
    } catch (err) {
      console.warn("[App] Could not read saved data:", err);
    }
    return C.migrate({});
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      console.warn("[App] Could not save data:", err);
      toast("Couldn't save to this browser's storage. Download a backup to be safe.");
    }
  }

  const S = () => state.settings;

  /* ───────────── Theme ───────────── */

  function resolvedTheme() {
    const t = S().theme;
    return t === "dark" || (t === "auto" && darkMQ.matches) ? "dark" : "light";
  }

  function applyTheme() {
    const root = document.documentElement;
    if (S().theme === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", S().theme);
    $("#themeColorMeta").setAttribute("content", THEME_COLORS[resolvedTheme()]);
  }

  /* ───────────── Rendering ───────────── */

  function render(opts) {
    opts = opts || {};
    const r = C.compute(state.courses, S());
    lastResult = r;
    const empty = state.courses.length === 0;
    document.body.classList.toggle("is-empty", empty);
    $("#emptyState").hidden = !empty;
    renderSummary(r, opts);
    renderTerms(r, opts);
    renderDatalists();
    if (opts.announce && !empty) {
      $("#cgpaLive").textContent = "CGPA is now " + fmt2(r.cgpa) + ".";
    }
  }

  function datedTerms(r) {
    return r.terms.filter((t) => t.term && t.sgpa !== null);
  }

  function renderSummary(r) {
    const max = S().maxGradePoint;
    animateCgpa(r.cgpa);
    $("#cgpaOf").textContent = "of " + fmt2(max);

    const circumference = 2 * Math.PI * 53;
    const frac = Math.max(0, Math.min(1, max > 0 ? r.cgpa / max : 0));
    const ring = $("#ringFill");
    ring.style.strokeDasharray = circumference.toFixed(2);
    ring.style.strokeDashoffset = (circumference * (1 - frac)).toFixed(2);
    ring.style.opacity = frac > 0 ? "1" : "0";
    $("#ring").setAttribute("aria-label", "CGPA " + fmt2(r.cgpa) + " of " + fmt2(max));

    const graded = datedTerms(r);
    const lastSgpa = graded.length ? graded[graded.length - 1].sgpa : r.lastSgpa;
    $("#statEarned").textContent = fmtNum(r.earnedCredits);
    $("#statAttemptedSub").textContent = " / " + fmtNum(r.attemptedCredits) + " attempted";
    $("#statCompleted").textContent = String(r.completedCourses);
    $("#statRetakes").textContent = String(r.retakeCount);
    $("#statLastSgpa").textContent = lastSgpa == null ? "—" : fmt2(lastSgpa);

    $("#policyChip").textContent = S().retakePolicy === "latest" ? "Latest attempt counts" : "Best grade counts";
    $("#policyChip").setAttribute(
      "aria-label",
      "Retake policy: " + (S().retakePolicy === "latest" ? "latest attempt" : "best grade") + ". Open settings",
    );

    const trend = graded.map((t) => ({ label: t.label, sgpa: t.sgpa }));
    const delta = $("#trendDelta");
    $("#trend").classList.toggle("is-empty", trend.length < 2);
    if (trend.length >= 2) {
      const last = trend[trend.length - 1];
      const prev = trend[trend.length - 2];
      const d = last.sgpa - prev.sgpa;
      const kind = Math.abs(d) < 0.005 ? "flat" : d > 0 ? "up" : "down";
      delta.className = "delta num is-" + kind;
      delta.innerHTML =
        icon(kind === "up" ? "arrowUp" : kind === "down" ? "arrowDown" : "flat") +
        "<span>" + fmt2(Math.abs(d)) + "</span>" +
        '<span class="delta-note">vs last term</span>' +
        '<span class="sr-only"> (' + (kind === "up" ? "up" : kind === "down" ? "down" : "unchanged") + " from " + escapeHtml(prev.label) + ")</span>";
      delta.title = (kind === "up" ? "Up " : kind === "down" ? "Down " : "Unchanged ") + fmt2(Math.abs(d)) + " from " + prev.label;
    } else {
      delta.className = "delta";
      delta.textContent = "";
    }
    renderTrendChart(trend);
  }

  let lastTrend = [];
  function renderTrendChart(trend) {
    if (trend) lastTrend = trend;
    const chart = $("#trendChart");
    if (lastTrend.length < 2) {
      chart.innerHTML =
        '<p class="trend-empty">' +
        (lastTrend.length === 1 ? "Your trend appears once you have two terms." : "Add courses to see your SGPA trend.") +
        "</p>";
      return;
    }
    // Draw at the chart's real pixel size so the line keeps crisp proportions
    // in every tile shape (tall desktop tile, slim mobile strip).
    const w = Math.max(120, Math.round(chart.clientWidth || 220));
    const h = Math.max(40, Math.round(chart.clientHeight || 104));
    chart.innerHTML = trendSvg(lastTrend, S().maxGradePoint, w, h);
  }

  function animateCgpa(target) {
    const el = $("#cgpaValue");
    const compact = $("#compactCgpaValue");
    const from = shownCgpa;
    shownCgpa = target;
    cancelAnimationFrame(cgpaAnim);
    if (from === null || reducedMQ.matches || Math.abs(from - target) < 0.005) {
      el.textContent = fmt2(target);
      compact.textContent = fmt2(target);
      return;
    }
    const start = performance.now();
    const dur = 550;
    const step = (now) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt2(from + (target - from) * eased);
      if (p < 1) cgpaAnim = requestAnimationFrame(step);
    };
    compact.textContent = fmt2(target);
    cgpaAnim = requestAnimationFrame(step);
  }

  function shortTerm(label) {
    const m = /^(.+?)\s+(\d{4})$/.exec(label);
    if (m) return m[1].slice(0, 3) + " ’" + m[2].slice(2);
    return label.length > 8 ? label.slice(0, 7) + "…" : label;
  }

  function trendSvg(trend, max, W, H) {
    const padX = 6;
    const small = H < 80;
    const padT = small ? 14 : 20;
    const padB = small ? 14 : 22;
    const vals = trend.map((t) => t.sgpa);
    let lo = Math.max(0, Math.min.apply(null, vals) - 0.25);
    let hi = Math.min(max, Math.max.apply(null, vals) + 0.25);
    if (hi - lo < 0.5) {
      const mid = (hi + lo) / 2;
      lo = Math.max(0, mid - 0.25);
      hi = Math.min(max, lo + 0.5);
    }
    const n = trend.length;
    const x = (i) => padX + ((W - padX * 2) * i) / (n - 1);
    const y = (v) => padT + (H - padT - padB) * (1 - (v - lo) / (hi - lo || 1));
    const pts = trend.map((t, i) => [x(i), y(t.sgpa)]);
    const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
    const base = H - padB;
    const area = line + " L" + pts[n - 1][0].toFixed(1) + " " + base + " L" + pts[0][0].toFixed(1) + " " + base + " Z";
    const last = pts[n - 1];
    const desc = trend.map((t) => t.label + " " + fmt2(t.sgpa)).join(", ");
    let dots = "";
    if (n <= 12) {
      pts.forEach((p, i) => {
        if (i < n - 1) dots += '<circle class="tc-dot" cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="2.5"/>';
      });
    }
    const labelY = H - (small ? 3 : 6);
    return (
      '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="SGPA trend: ' + escapeHtml(desc) + '">' +
      '<line class="tc-grid" x1="0" x2="' + W + '" y1="' + base + '" y2="' + base + '"/>' +
      '<path class="tc-area" d="' + area + '"/>' +
      '<path class="tc-line" d="' + line + '"/>' +
      dots +
      '<circle class="tc-dot-last" cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) + '" r="4"/>' +
      '<text class="tc-value" x="' + Math.min(W, last[0] + 2).toFixed(1) + '" y="' + Math.max(10, last[1] - 8).toFixed(1) +
      '" text-anchor="end">' + fmt2(trend[n - 1].sgpa) + "</text>" +
      '<text class="tc-label" x="' + pts[0][0].toFixed(1) + '" y="' + labelY + '" text-anchor="start">' +
      escapeHtml(shortTerm(trend[0].label)) + "</text>" +
      '<text class="tc-label" x="' + last[0].toFixed(1) + '" y="' + labelY + '" text-anchor="end">' +
      escapeHtml(shortTerm(trend[n - 1].label)) + "</text>" +
      "</svg>"
    );
  }

  /* ── Term open/closed state (per-viewer convenience, separate from cgpaData) ── */

  const UI_KEY = "cgpaUi";
  const wideMQ = window.matchMedia("(min-width: 640px)");
  let ui = loadUi();

  function loadUi() {
    try {
      const raw = JSON.parse(localStorage.getItem(UI_KEY) || "{}");
      return { open: raw && typeof raw.open === "object" && raw.open ? raw.open : {} };
    } catch (err) {
      return { open: {} };
    }
  }

  function saveUi() {
    try {
      localStorage.setItem(UI_KEY, JSON.stringify(ui));
    } catch (err) {
      /* storage unavailable: state just won't persist */
    }
  }

  function isTermOpen(id, isNewest) {
    if (Object.prototype.hasOwnProperty.call(ui.open, id)) return !!ui.open[id];
    return wideMQ.matches || isNewest; // desktop/tablet: all open; mobile: newest only
  }

  function syncToggleAll() {
    const all = $$("#termList .term-details");
    const anyOpen = all.some((d) => d.open);
    const btn = $("#toggleAllBtn");
    btn.textContent = anyOpen ? "Collapse all" : "Expand all";
    btn.hidden = all.length < 2;
  }

  /** Delta vs the previous chronological term that has a graded SGPA. */
  function termDeltas(r) {
    const map = new Map();
    let prev = null;
    r.terms.forEach((t) => {
      if (!t.term || t.sgpa === null) return;
      if (prev) map.set(t.id, { d: t.sgpa - prev.sgpa, from: prev.label });
      prev = t;
    });
    return map;
  }

  function deltaHtml(info) {
    if (!info) return "";
    const kind = Math.abs(info.d) < 0.005 ? "flat" : info.d > 0 ? "up" : "down";
    const arrow = kind === "up" ? "↑" : kind === "down" ? "↓" : "→";
    const words = kind === "up" ? "up " : kind === "down" ? "down " : "unchanged ";
    return (
      '<span class="term-delta is-' + kind + '" title="' + escapeHtml(words + fmt2(Math.abs(info.d)) + " from " + info.from) + '">' +
      '<span aria-hidden="true">' + arrow + " " + fmt2(Math.abs(info.d)) + "</span>" +
      '<span class="sr-only">' + escapeHtml(words + fmt2(Math.abs(info.d)) + " from " + info.from) + "</span></span>"
    );
  }

  function renderTerms(r, opts) {
    const list = $("#termList");
    const byId = new Map(state.courses.map((c) => [c.id, c]));
    const dated = r.terms.filter((t) => t.term).reverse(); // newest first
    const legacy = r.terms.filter((t) => !t.term);
    const max = S().maxGradePoint;
    const deltas = termDeltas(r);
    const highlightTerm = opts.highlightId && byId.get(opts.highlightId) ? C.termId(byId.get(opts.highlightId)) : null;

    const html = dated.concat(legacy).map((t, idx) => {
      const isLegacy = !t.term;
      let open = isTermOpen(t.id, idx === 0);
      if (highlightTerm === t.id && !open) {
        open = true; // reveal what was just saved, and keep it open
        ui.open[t.id] = true;
        saveUi();
      }
      const counted = t.courses.filter((c) => r.countedIds.has(c.id)).length;
      const replaced = t.courses.length - counted;
      const meta =
        fmtNum(t.credits) + " cr · " + plural(t.courses.length, "course") +
        (replaced ? '<span class="meta-replaced"> · ' + replaced + " replaced</span>" : "");
      const meter = t.sgpa == null ? 0 : Math.max(0, Math.min(100, (t.sgpa / max) * 100));
      const rows = t.courses.map((c) => courseRow(c, r, byId, opts.highlightId)).join("");
      const add = isLegacy
        ? ""
        : '<button type="button" class="icon-btn term-add" data-action="add-to-term" data-term-name="' +
          escapeHtml(t.term.name) + '" data-term-year="' + escapeHtml(t.term.year) + '" aria-label="Add course to ' +
          escapeHtml(t.label) + '" title="Add course to ' + escapeHtml(t.label) + '">' + icon("plus") + "</button>";

      return (
        '<article class="term' + (t.sgpa == null ? " is-void" : "") + (isLegacy ? " is-legacy" : "") + (open ? " is-open" : "") +
        '" data-term-id="' + escapeHtml(t.id) + '">' +
        '<details class="term-details" data-term-id="' + escapeHtml(t.id) + '"' + (open ? " open" : "") + ">" +
        '<summary class="term-summary">' +
        '<span class="term-title">' + icon("chev") + '<span class="term-name">' + escapeHtml(t.label) + "</span></span>" +
        '<span class="term-meta">' + meta + (isLegacy ? ' <span class="term-tag">Other</span>' : "") + "</span>" +
        '<span class="term-score"><span class="term-sgpa num">' + (t.sgpa == null ? "—" : fmt2(t.sgpa)) + "</span>" +
        '<span class="sr-only"> SGPA</span>' + deltaHtml(deltas.get(t.id)) + "</span>" +
        '<span class="term-meter" aria-hidden="true"><span style="width:' + meter.toFixed(1) + '%"></span></span>' +
        "</summary>" +
        '<ul class="course-list">' + rows + "</ul>" +
        (isLegacy ? '<p class="term-foot-hint">Unrecognised term label. Tap a course to move it to a proper term.</p>' : "") +
        "</details>" + add + "</article>"
      );
    });
    list.innerHTML = html.join("");
    syncToggleAll();
  }

  function courseRow(c, r, byId, highlightId) {
    const counted = r.countedIds.has(c.id);
    let replacedText = "";
    if (!counted) {
      const winner = byId.get(r.replacedBy.get(c.id));
      replacedText = winner
        ? "Replaced by " + C.formatTerm(winner) + " (" + (winner.grade || fmt2(winner.gpa)) + ") — not counted"
        : "Not counted";
    }
    const gradeLabel = c.grade ? escapeHtml(c.grade) : "";
    const point = fmt2(c.gpa);
    const id = escapeHtml(c.id);
    return (
      '<li class="course' + (counted ? "" : " is-replaced") + (c.id === highlightId ? " is-new" : "") + '" data-id="' + id + '"' +
      (replacedText ? ' title="' + escapeHtml(replacedText) + '"' : "") + ">" +
      '<button type="button" class="course-row" data-action="edit" data-id="' + id + '">' +
      (c.code ? '<span class="c-code">' + escapeHtml(c.code) + "</span>" : "") +
      '<span class="c-name">' + escapeHtml(c.name) + "</span>" +
      (c.retake ? '<span class="pill-retake" title="Retake" aria-hidden="true">R</span><span class="sr-only">, retake</span>' : "") +
      (!counted ? '<span class="tag-replaced" aria-hidden="true">replaced</span><span class="sr-only">, ' + escapeHtml(replacedText) + "</span>" : "") +
      '<span class="c-cr num"><span class="sr-only">, </span>' + fmtNum(c.credits) + " cr</span>" +
      '<span class="c-grade num"><span class="sr-only">, grade </span>' + (gradeLabel ? "<b>" + gradeLabel + "</b> " : "") + point + "</span>" +
      '<span class="sr-only">, edit</span>' +
      "</button>" +
      // Mouse-only shortcut; keyboard/touch users delete from the edit sheet.
      '<button type="button" class="icon-btn c-del" data-action="delete" data-id="' + id + '" tabindex="-1" aria-hidden="true" title="Delete">' +
      icon("trash") + "</button>" +
      "</li>"
    );
  }

  function renderDatalists() {
    const names = new Map();
    const codes = new Map();
    state.courses.forEach((c) => {
      if (c.name) names.set(c.name.toLowerCase(), c.name);
      if (c.code) codes.set(c.code.replace(/\s+/g, "").toLowerCase(), c.code);
    });
    const opts = (m) =>
      Array.from(m.values())
        .sort((a, b) => a.localeCompare(b))
        .map((v) => '<option value="' + escapeHtml(v) + '"></option>')
        .join("");
    $("#nameList").innerHTML = opts(names);
    $("#codeList").innerHTML = opts(codes);
  }

  /* ───────────── Toasts ───────────── */

  let toastTimer = 0;

  function toast(message, options) {
    options = options || {};
    const host = $("#toasts");
    clearTimeout(toastTimer);
    host.innerHTML = "";
    const el = document.createElement("div");
    el.className = "toast";
    const msg = document.createElement("span");
    msg.className = "toast-msg";
    msg.textContent = message;
    el.appendChild(msg);
    if (options.action) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "toast-action";
      btn.textContent = options.action;
      btn.addEventListener("click", () => {
        dismiss();
        options.onAction();
      });
      el.appendChild(btn);
    }
    host.appendChild(el);
    const duration = options.duration || (options.action ? 7000 : 3200);
    const dismiss = () => {
      clearTimeout(toastTimer);
      el.classList.add("is-leaving");
      setTimeout(() => el.remove(), 220);
    };
    const arm = () => {
      clearTimeout(toastTimer);
      toastTimer = setTimeout(dismiss, duration);
    };
    el.addEventListener("mouseenter", () => clearTimeout(toastTimer));
    el.addEventListener("mouseleave", arm);
    el.addEventListener("focusin", () => clearTimeout(toastTimer));
    el.addEventListener("focusout", arm);
    arm();
  }

  /* ───────────── Dialog helpers ───────────── */

  const returnFocus = new WeakMap();

  function openDialog(dialog, opener) {
    returnFocus.set(dialog, opener || document.activeElement);
    dialog.showModal();
  }

  function setupDialogFocusRestore(dialog) {
    dialog.addEventListener("close", () => {
      const target = returnFocus.get(dialog);
      returnFocus.delete(dialog);
      if (target && document.contains(target) && typeof target.focus === "function") target.focus();
      else addControl().focus();
    });
    // Click on the backdrop closes the dialog.
    dialog.addEventListener("click", (e) => {
      if (e.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      const inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
      if (!inside) dialog.close("cancel");
    });
  }

  let confirmResolve = null;

  function confirmDialog(opts) {
    const dlg = $("#confirmDialog");
    $("#confirmTitle").textContent = opts.title;
    $("#confirmText").textContent = opts.message;
    const ok = $("#confirmOk");
    ok.textContent = opts.confirmLabel || "Confirm";
    ok.className = "btn " + (opts.danger ? "btn-danger" : "btn-primary");
    return new Promise((resolve) => {
      confirmResolve = resolve;
      openDialog(dlg);
      (opts.danger ? $('[data-action="confirm-cancel"]', dlg) : ok).focus();
    });
  }

  function settleConfirm(value) {
    const dlg = $("#confirmDialog");
    const resolve = confirmResolve;
    confirmResolve = null;
    if (dlg.open) dlg.close();
    if (resolve) resolve(value);
  }

  /* ───────────── Course form ───────────── */

  const form = {
    editingId: null,
    autoKey: null, // which set of earlier attempts we already auto-filled for
    autoChecked: false, // the retake toggle was switched on by autofill
    allowSameTerm: null, // "termId|attemptIds" the user accepted with "Add anyway"
    legacyLabel: "",
    matches: { attempts: [], earlier: [], later: [], same: [] },
  };

  const el = {};

  function guessCurrentTerm() {
    const terms = S().terms;
    const now = new Date();
    const month = now.getMonth(); // 0-11
    let idx;
    const lower = terms.map((t) => t.toLowerCase());
    if (S().termPreset === "trimester" && lower.join() === "spring,summer,fall") idx = month < 4 ? 0 : month < 8 ? 1 : 2;
    else if (S().termPreset === "semester" && lower.join() === "spring,fall") idx = month < 6 ? 0 : 1;
    else idx = Math.min(terms.length - 1, Math.floor((month * terms.length) / 12));
    return { name: terms[idx] || terms[0], year: now.getFullYear() };
  }

  function defaultTerm() {
    for (let i = state.courses.length - 1; i >= 0; i--) {
      if (state.courses[i].term) return state.courses[i].term;
    }
    return guessCurrentTerm();
  }

  function fillTermSelects(term, legacyLabel) {
    const terms = S().terms.slice();
    if (term && term.name && !terms.some((t) => t.toLowerCase() === String(term.name).toLowerCase())) {
      terms.push(term.name);
    }
    let html = "";
    if (legacyLabel) {
      html += '<option value="__legacy__">Keep “' + escapeHtml(legacyLabel) + "”</option>";
    }
    html += terms.map((t) => '<option value="' + escapeHtml(t) + '">' + escapeHtml(t) + "</option>").join("");
    el.termName.innerHTML = html;

    const nowYear = new Date().getFullYear();
    const years = [];
    for (let y = nowYear + 2; y >= FIRST_YEAR; y--) years.push(y);
    if (term && term.year && !years.includes(Number(term.year))) {
      years.push(Number(term.year));
      years.sort((a, b) => b - a);
    }
    el.termYear.innerHTML = years.map((y) => '<option value="' + y + '">' + y + "</option>").join("");

    if (legacyLabel && !term) {
      el.termName.value = "__legacy__";
      el.termYear.value = String(nowYear);
    } else {
      const match = terms.find((t) => t.toLowerCase() === String(term.name).toLowerCase());
      el.termName.value = match || terms[0];
      el.termYear.value = String(term.year);
    }
    syncLegacyUi();
  }

  function syncLegacyUi() {
    const legacy = el.termName.value === "__legacy__";
    el.termYear.disabled = legacy;
    const hint = $("#legacyHint");
    hint.hidden = !form.legacyLabel;
    hint.textContent = legacy
      ? "This course has an unrecognised term label. Pick a term name to move it."
      : form.legacyLabel
        ? "Moving from “" + form.legacyLabel + "”."
        : "";
  }

  function selectedTerm() {
    if (el.termName.value === "__legacy__") return { term: null, termLabel: form.legacyLabel };
    return { term: { name: el.termName.value, year: Number(el.termYear.value) }, termLabel: "" };
  }

  function fillGradeSelect() {
    el.gradeLetter.innerHTML =
      '<option value="">Select grade</option>' +
      S().gradeScale
        .map((g) => '<option value="' + escapeHtml(g.label) + '">' + escapeHtml(g.label) + " · " + fmt2(g.point) + "</option>")
        .join("");
    el.gradeCustom.max = String(S().maxGradePoint);
    el.previousGpa.max = String(S().maxGradePoint);
  }

  function gradeMode() {
    return el.modeCustom.checked ? "custom" : "letter";
  }

  function setGradeMode(mode, carry) {
    const custom = mode === "custom";
    el.modeCustom.checked = custom;
    el.modeLetter.checked = !custom;
    $("#customPanel").hidden = !custom;
    $("#letterPanel").hidden = custom;
    if (!carry) return;
    // Carry the value across so switching never loses what the user entered.
    if (custom && el.gradeCustom.value === "" && el.gradeLetter.value) {
      const g = S().gradeScale.find((x) => x.label === el.gradeLetter.value);
      if (g) el.gradeCustom.value = fmt2(g.point);
    } else if (!custom && el.gradeCustom.value !== "") {
      const v = Number(el.gradeCustom.value);
      const g = S().gradeScale.find((x) => Math.abs(x.point - v) < 0.005);
      if (g) el.gradeLetter.value = g.label;
    }
  }

  function clearErrors() {
    ["termError", "nameError", "creditsError", "gradeError", "prevError"].forEach((id) => {
      $("#" + id).textContent = "";
    });
    $$(".control[aria-invalid]", el.form).forEach((c) => c.removeAttribute("aria-invalid"));
  }

  function resetCourseFields() {
    el.code.value = "";
    el.name.value = "";
    el.credits.value = "";
    el.gradeLetter.value = "";
    el.gradeCustom.value = "";
    el.retake.checked = false;
    el.previousGpa.value = "";
    form.autoKey = null;
    form.autoChecked = false;
    form.allowSameTerm = null;
  }

  function openCourseDialog(opts, opener) {
    opts = opts || {};
    const course = opts.id ? state.courses.find((c) => c.id === opts.id) : null;
    form.editingId = course ? course.id : null;
    form.legacyLabel = course && !course.term ? course.termLabel || "Unassigned" : "";
    clearErrors();
    resetCourseFields();
    fillGradeSelect();

    $("#courseDialogTitle").textContent = course ? "Edit course" : "Add course";
    $("#courseSubmit").textContent = course ? "Save changes" : "Add course";
    $("#saveAnotherBtn").hidden = !!course;
    $("#deleteCourseBtn").hidden = !course;

    // Explain a replaced (not counted) attempt inside the sheet.
    const rn = $("#replacedNotice");
    rn.hidden = true;
    if (course && lastResult && !lastResult.countedIds.has(course.id)) {
      const winner = state.courses.find((c) => c.id === lastResult.replacedBy.get(course.id));
      $("#replacedNoticeText").textContent = winner
        ? "This attempt is replaced by " + C.formatTerm(winner) + " (" + (winner.grade || fmt2(winner.gpa)) +
          ") and isn\u2019t counted in your CGPA or this term\u2019s SGPA."
        : "This attempt isn\u2019t counted in your CGPA.";
      rn.hidden = false;
    }

    if (course) {
      fillTermSelects(course.term, form.legacyLabel);
      el.code.value = course.code;
      el.name.value = course.name;
      el.credits.value = fmtNum(course.credits);
      const g = course.grade && S().gradeScale.find((x) => x.label === course.grade);
      // Letter mode only if the stored point still matches the scale; otherwise
      // show the stored number so saving can't silently change it.
      if (g && Math.abs(g.point - course.gpa) < 0.005) {
        setGradeMode("letter");
        el.gradeLetter.value = g.label;
      } else {
        setGradeMode("custom");
        el.gradeCustom.value = fmtNum(course.gpa);
      }
      el.retake.checked = course.retake;
      el.previousGpa.value = course.previousGpa == null ? "" : fmtNum(course.previousGpa);
    } else {
      fillTermSelects(opts.term || defaultTerm(), "");
      setGradeMode(S().gradeInputMode);
    }

    evaluateAttempts({ initial: true });
    if (!el.form.closest("dialog").open) openDialog($("#courseDialog"), opener);
    (course ? el.name : el.code).focus();
  }

  /** Recompute the retake notice / same-term warning. Never touches term or grade. */
  function evaluateAttempts(opts) {
    opts = opts || {};
    const probe = { name: el.name.value, code: el.code.value };
    const terms = S().terms;
    const hasProbe = probe.name.trim() !== "" || probe.code.trim() !== "";
    const attempts = hasProbe ? C.findAttempts(state.courses, probe, form.editingId, terms) : [];
    const sel = selectedTerm();
    const selId = C.termId(sel);
    const selOrder = C.termOrder(sel, terms);
    const same = attempts.filter((a) => C.termId(a) === selId);
    const others = attempts.filter((a) => C.termId(a) !== selId);
    const earlier = others.filter((a) => !a.term || !sel.term || C.termOrder(a, terms) < selOrder);
    const later = others.filter((a) => earlier.indexOf(a) < 0);
    form.matches = { attempts, earlier, later, same };

    const key = earlier.map((a) => a.id).join(",");
    if (opts.initial) {
      // Opening the form (add or edit) never autofills; it only shows notices.
      form.autoKey = key || null;
    } else if (key && key !== form.autoKey) {
      form.autoKey = key;
      if (!el.retake.checked) {
        el.retake.checked = true;
        form.autoChecked = true;
      }
      const latest = earlier[earlier.length - 1];
      if (latest && el.credits.value === "") el.credits.value = fmtNum(latest.credits);
      if (latest && el.name.value.trim() === "" && latest.name) el.name.value = latest.name;
    } else if (!key && form.autoKey) {
      form.autoKey = null;
      if (form.autoChecked) {
        el.retake.checked = false;
        form.autoChecked = false;
      }
    }

    // Notice about other attempts
    const notice = $("#attemptNotice");
    const text = $("#attemptNoticeText");
    const describe = (list) =>
      list.map((a) => "<strong>" + escapeHtml(C.formatTerm(a)) + "</strong> · " + escapeHtml(gradeText(a))).join(", ");
    let msg = "";
    if (earlier.length) {
      msg =
        "You took this before: " + describe(earlier) + ". " +
        (el.retake.checked
          ? form.editingId
            ? "This attempt is a retake."
            : "This will be saved as a retake."
          : "Retake is off, but it\u2019s still the same course \u2014 only one attempt counts toward your CGPA.");
    } else if (later.length) {
      msg = "You also took this in " + describe(later) + ". This entry will count as an earlier attempt.";
    }
    notice.hidden = !msg;
    text.innerHTML = msg;
    const live = $("#attemptLive");
    const plain = msg.replace(/<[^>]+>/g, "");
    if (live.textContent !== plain) live.textContent = plain;

    // Same-term warning
    const warn = $("#sameTermWarning");
    const sameKey = selId + "|" + same.map((a) => a.id).join(",");
    if (same.length && form.allowSameTerm !== sameKey) {
      const s = same[0];
      $("#sameTermText").innerHTML =
        "<strong>" + escapeHtml(s.code ? s.code + " " + s.name : s.name) + "</strong> is already in " +
        escapeHtml(C.formatTerm(s)) + " · " + escapeHtml(gradeText(s)) + ".";
      $("#editExistingBtn").dataset.id = s.id;
      warn.hidden = false;
    } else {
      warn.hidden = true;
    }

    syncRetakeUi();
  }

  function syncRetakeUi() {
    const on = el.retake.checked;
    const earlier = form.matches.earlier;
    const prevBest = $("#prevBest");
    if (on && earlier.length) {
      const best = earlier.reduce((b, a) => (Number(a.gpa) > Number(b.gpa) ? a : b), earlier[0]);
      prevBest.innerHTML =
        "Previous best <strong class=\"num\">" + fmt2(best.gpa) + "</strong>" +
        "<span>" + escapeHtml((best.grade ? best.grade + ", " : "") + C.formatTerm(best)) + "</span>";
      prevBest.hidden = false;
      $("#prevGpaField").hidden = true;
    } else {
      prevBest.hidden = true;
      $("#prevGpaField").hidden = !on;
    }
  }

  function showFieldError(id, message, control) {
    $("#" + id).textContent = message;
    if (control) control.setAttribute("aria-invalid", "true");
  }

  function submitCourse(addAnother) {
    clearErrors();
    evaluateAttempts();
    const sel = selectedTerm();
    const mode = gradeMode();
    let gpa;
    let grade = null;
    if (mode === "letter") {
      const g = S().gradeScale.find((x) => x.label === el.gradeLetter.value);
      gpa = g ? g.point : "";
      grade = g ? g.label : null;
    } else {
      gpa = el.gradeCustom.value === "" ? "" : Number(el.gradeCustom.value);
    }
    const retake = el.retake.checked;
    const usePrev = retake && form.matches.earlier.length === 0 && el.previousGpa.value !== "";
    const input = {
      term: sel.term,
      termLabel: sel.termLabel,
      code: el.code.value.trim().replace(/\s+/g, " "),
      name: el.name.value.trim().replace(/\s+/g, " "),
      credits: el.credits.value,
      gpa: gpa,
      previousGpa: usePrev ? el.previousGpa.value : null,
    };

    const errors = C.validateCourse(input, S());
    const order = [];
    if (errors.term) {
      showFieldError("termError", errors.term, el.termName);
      order.push(el.termName);
    }
    if (errors.name) {
      showFieldError("nameError", errors.name, el.name);
      order.push(el.name);
    }
    if (errors.credits) {
      showFieldError("creditsError", errors.credits, el.credits);
      order.push(el.credits);
    }
    if (errors.gpa) {
      const ctrl = mode === "letter" ? el.gradeLetter : el.gradeCustom;
      showFieldError("gradeError", mode === "letter" && gpa === "" ? "Pick a grade." : errors.gpa, ctrl);
      order.push(ctrl);
    }
    if (errors.previousGpa) {
      showFieldError("prevError", errors.previousGpa, el.previousGpa);
      order.push(el.previousGpa);
    }
    if (order.length) {
      order[0].focus();
      return;
    }

    if (!$("#sameTermWarning").hidden) {
      $("#sameTermWarning").focus();
      return;
    }

    S().gradeInputMode = mode;
    const data = {
      code: input.code,
      name: input.name,
      credits: Number(input.credits),
      gpa: Number(gpa),
      grade: grade,
      term: sel.term,
      termLabel: sel.term ? "" : sel.termLabel,
      retake: retake,
      previousGpa: usePrev ? Number(el.previousGpa.value) : null,
    };

    let id;
    if (form.editingId) {
      const existing = state.courses.find((c) => c.id === form.editingId);
      if (!existing) return;
      Object.assign(existing, data);
      id = existing.id;
    } else {
      const course = Object.assign({ id: C.makeId() }, data);
      state.courses.push(course);
      id = course.id;
    }
    persist();
    render({ announce: true, highlightId: id });
    toast(form.editingId ? "Course updated" : "Course added — " + data.name);

    if (addAnother) {
      const keepCredits = el.credits.value;
      clearErrors();
      resetCourseFields();
      el.credits.value = keepCredits;
      evaluateAttempts({ initial: true });
      el.code.focus();
    } else {
      $("#courseDialog").close();
    }
  }

  /* ───────────── Course actions ───────────── */

  /** The visible "add course" control (header button on desktop, FAB elsewhere). */
  function addControl() {
    if (!state.courses.length) return $('#emptyState [data-action="add-course"]');
    const head = $(".terms-add");
    return head && head.offsetParent ? head : $("#fab");
  }

  /** Deletes a course and returns the element focus should move to. */
  function deleteCourse(id) {
    const idx = state.courses.findIndex((c) => c.id === id);
    if (idx < 0) return null;
    // Decide where focus goes after the row disappears.
    const row = document.querySelector('.course[data-id="' + CSS.escape(id) + '"]');
    const sibling = row && (row.nextElementSibling || row.previousElementSibling);
    const siblingId = sibling && sibling.dataset.id;

    const removed = state.courses.splice(idx, 1)[0];
    persist();
    render({ announce: true });

    const next = siblingId && document.querySelector('.course[data-id="' + CSS.escape(siblingId) + '"] [data-action="edit"]');
    const focusTarget = next || addControl();

    toast("Deleted “" + removed.name + "”", {
      action: "Undo",
      onAction: () => {
        state.courses.splice(Math.min(idx, state.courses.length), 0, removed);
        persist();
        render({ announce: true, highlightId: removed.id });
        toast("Restored “" + removed.name + "”");
      },
    });
    return focusTarget;
  }

  async function clearAll() {
    if (!state.courses.length) {
      toast("There's nothing to clear.");
      return;
    }
    const ok = await confirmDialog({
      title: "Clear all data?",
      message:
        "This removes all " + plural(state.courses.length, "course") +
        " from this device. Your settings are kept. Consider saving a backup first.",
      confirmLabel: "Clear all",
      danger: true,
    });
    if (!ok) return;
    const previous = state.courses;
    state.courses = [];
    persist();
    render({ announce: true });
    toast("All courses cleared", {
      action: "Undo",
      onAction: () => {
        state.courses = previous;
        persist();
        render({ announce: true });
        toast("Courses restored");
      },
    });
  }

  /* ───────────── Backup ───────────── */

  function saveBackup() {
    const r = C.compute(state.courses, S());
    const payload = {
      version: state.version,
      app: "CGPA Calculator",
      exportedAt: new Date().toISOString(),
      settings: state.settings,
      courses: state.courses,
      stats: {
        cgpa: Number(r.cgpa.toFixed(4)),
        attemptedCredits: r.attemptedCredits,
        earnedCredits: r.earnedCredits,
        completedCourses: r.completedCourses,
        totalAttempts: r.totalAttempts,
        retakeCount: r.retakeCount,
        lastSgpa: r.lastSgpa,
        terms: r.terms.map((t) => ({ label: t.label, credits: t.credits, sgpa: t.sgpa })),
      },
    };
    download(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), "cgpa-backup-" + today() + ".json");
    toast("Backup saved");
  }

  function loadBackupFile(file) {
    const reader = new FileReader();
    reader.onerror = () => toast("Couldn't read that file.");
    reader.onload = async () => {
      let data;
      try {
        const raw = JSON.parse(String(reader.result));
        if (!raw || typeof raw !== "object") throw new Error("Not an object");
        // Old backups carry no settings: keep the current ones.
        const hasSettings = !Array.isArray(raw) && raw.settings && typeof raw.settings === "object";
        const src = Array.isArray(raw) ? { courses: raw } : raw;
        data = C.migrate(hasSettings ? src : Object.assign({}, src, { settings: state.settings }));
        if (!Array.isArray(src.courses)) throw new Error("No courses array");
      } catch (err) {
        console.warn("[App] Invalid backup:", err);
        toast("That file isn't a valid CGPA backup.");
        return;
      }
      if (state.courses.length) {
        const ok = await confirmDialog({
          title: "Replace current data?",
          message:
            "Replace current data with " + plural(data.courses.length, "course") +
            " from file? Your " + plural(state.courses.length, "current course") + " will be removed.",
          confirmLabel: "Replace",
          danger: true,
        });
        if (!ok) return;
      }
      state = data;
      persist();
      applyTheme();
      render({ announce: true });
      toast("Loaded " + plural(data.courses.length, "course"));
    };
    reader.readAsText(file);
  }

  /* ───────────── PDF export ───────────── */

  function exportPdf() {
    if (!state.courses.length) {
      toast("Add a course before exporting.");
      return;
    }
    if (!window.jspdf || !window.jspdf.jsPDF) {
      toast("PDF export isn't available right now.");
      return;
    }
    const r = C.compute(state.courses, S());
    const byId = new Map(state.courses.map((c) => [c.id, c]));
    const doc = new window.jspdf.jsPDF({ unit: "pt", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const M = 48;
    const INK = [23, 32, 30];
    const MUTED = [86, 96, 93];
    const GREY = [150, 156, 153];
    const ACCENT = [15, 118, 110];
    const RULE = [220, 216, 206];
    const cols = { code: M, name: M + 78, credits: W - M - 132, grade: W - M - 76, point: W - M };
    const bottom = H - M - 16;
    let y = M;

    const fit = (text, width) => {
      let t = String(text);
      if (doc.getTextWidth(t) <= width) return t;
      while (t.length > 1 && doc.getTextWidth(t + "...") > width) t = t.slice(0, -1);
      return t + "...";
    };
    // Built-in PDF fonts only cover Latin-1; replace anything else.
    const safe = (s) => String(s == null ? "" : s).replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/[^\x20-\xFF]/g, "?");

    const tableHeader = () => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(...MUTED);
      doc.text("CODE", cols.code, y);
      doc.text("COURSE", cols.name, y);
      doc.text("CREDITS", cols.credits, y, { align: "right" });
      doc.text("GRADE", cols.grade, y, { align: "right" });
      doc.text("POINT", cols.point, y, { align: "right" });
      y += 6;
      doc.setDrawColor(...RULE);
      doc.setLineWidth(0.75);
      doc.line(M, y, W - M, y);
      y += 14;
    };

    const ensure = (needed, termLabel) => {
      if (y + needed <= bottom) return false;
      doc.addPage();
      y = M;
      if (termLabel) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(...INK);
        doc.text(safe(termLabel) + " (continued)", M, y);
        y += 18;
        tableHeader();
      }
      return true;
    };

    // Title block
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(...INK);
    doc.text("CGPA Report", M, y + 8);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    doc.text(
      "Generated " + new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) +
        "  |  Retake policy: " + (S().retakePolicy === "latest" ? "latest attempt" : "best grade"),
      M, y + 26,
    );
    y += 52;

    // CGPA + stats panel
    doc.setFillColor(242, 240, 234);
    doc.roundedRect(M, y, W - M * 2, 78, 6, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text("CUMULATIVE GPA", M + 16, y + 22);
    doc.setFontSize(30);
    doc.setTextColor(...ACCENT);
    doc.text(fmt2(r.cgpa), M + 16, y + 56);
    const cgpaWidth = doc.getTextWidth(fmt2(r.cgpa));
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    doc.text("of " + fmt2(S().maxGradePoint), M + 16 + cgpaWidth + 8, y + 56);

    const stats = [
      ["Credits earned", fmtNum(r.earnedCredits)],
      ["Credits attempted", fmtNum(r.attemptedCredits)],
      ["Courses completed", String(r.completedCourses)],
      ["Retakes", String(r.retakeCount)],
      ["Last SGPA", r.lastSgpa == null ? "-" : fmt2(r.lastSgpa)],
      ["Terms", String(r.terms.length)],
    ];
    const sx = M + 180;
    const colW = (W - M - 16 - sx) / 3;
    stats.forEach((s, i) => {
      const cx = sx + (i % 3) * colW;
      const cy = y + 26 + Math.floor(i / 3) * 30;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...MUTED);
      doc.text(s[0], cx, cy);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(...INK);
      doc.text(s[1], cx, cy + 14);
    });
    y += 78 + 32;

    // Terms, chronological
    r.terms.forEach((t) => {
      ensure(70);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(...INK);
      doc.text(fit(safe(t.label) + (t.term ? "" : "  (unrecognised term)"), W - M * 2 - 170), M, y);
      doc.setFontSize(11);
      doc.setTextColor(...ACCENT);
      doc.text("SGPA " + (t.sgpa == null ? "-" : fmt2(t.sgpa)), W - M, y, { align: "right" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...MUTED);
      doc.text(fmtNum(t.credits) + " credits counted", W - M - 76, y, { align: "right" });
      y += 18;
      tableHeader();

      t.courses.forEach((c) => {
        ensure(18, t.label);
        const counted = r.countedIds.has(c.id);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(...(counted ? INK : GREY));
        let name = safe(c.name);
        if (c.retake) name += " [retake]";
        if (!counted) {
          const w = byId.get(r.replacedBy.get(c.id));
          name += " (replaced" + (w ? " by " + safe(C.formatTerm(w)) : "") + ")";
        }
        doc.text(fit(safe(c.code) || "-", cols.name - cols.code - 8), cols.code, y);
        doc.text(fit(name, cols.credits - cols.name - 44), cols.name, y);
        doc.text(fmtNum(c.credits), cols.credits, y, { align: "right" });
        doc.text(safe(c.grade) || "-", cols.grade, y, { align: "right" });
        doc.text(fmt2(c.gpa), cols.point, y, { align: "right" });
        if (!counted) {
          doc.setDrawColor(...GREY);
          doc.setLineWidth(0.5);
          const tw = Math.min(doc.getTextWidth(fit(safe(c.name), cols.credits - cols.name - 44)), cols.credits - cols.name - 44);
          doc.line(cols.name, y - 3.5, cols.name + tw, y - 3.5);
        }
        y += 18;
      });
      y += 16;
    });

    const pages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(...GREY);
      doc.text("CGPA Calculator", M, H - 28);
      doc.text("Page " + i + " of " + pages, W - M, H - 28, { align: "right" });
    }
    doc.save("cgpa-report-" + today() + ".pdf");
    toast("PDF exported");
  }

  /* ───────────── Image export ───────────── */

  const SVG_PROPS = ["fill", "fill-opacity", "stroke", "stroke-width", "stroke-opacity", "stroke-dasharray", "stroke-dashoffset", "stroke-linecap", "stroke-linejoin", "opacity", "font-size", "font-weight", "font-family"];

  /** html2canvas rasterises SVG without page CSS, so copy computed styles inline. */
  function inlineSvgStyles(source, clonedDoc) {
    const originals = $$("svg", source);
    const clones = $$("#captureArea svg", clonedDoc);
    originals.forEach((svg, i) => {
      const copy = clones[i];
      if (!copy) return;
      const a = [svg].concat($$("*", svg));
      const b = [copy].concat($$("*", copy));
      a.forEach((node, j) => {
        const target = b[j];
        if (!target) return;
        const cs = getComputedStyle(node);
        SVG_PROPS.forEach((p) => target.style.setProperty(p, cs.getPropertyValue(p)));
      });
      const box = svg.getBoundingClientRect();
      copy.setAttribute("width", String(box.width));
      copy.setAttribute("height", String(box.height));
    });
  }

  async function exportImage() {
    if (!state.courses.length) {
      toast("Add a course before exporting.");
      return;
    }
    if (typeof window.html2canvas !== "function") {
      toast("Image export isn't available right now.");
      return;
    }
    const target = $("#captureArea");
    const bg = getComputedStyle(document.body).backgroundColor;
    $("#captureCaption").textContent =
      "CGPA Calculator · " + new Date().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    // Show the final CGPA value, not a mid-animation frame.
    cancelAnimationFrame(cgpaAnim);
    $("#cgpaValue").textContent = fmt2(lastResult ? lastResult.cgpa : 0);
    // Capture every term expanded, then restore the viewer's layout.
    const closed = $$("#termList .term-details:not([open])");
    closed.forEach((d) => (d.open = true));
    syncTermClasses();
    document.body.classList.add("is-capturing");
    renderTrendChart();
    toast("Preparing image…");
    try {
      const canvas = await window.html2canvas(target, {
        backgroundColor: bg,
        scale: Math.max(2, window.devicePixelRatio || 1),
        useCORS: true,
        logging: false,
        onclone: (clonedDoc) => inlineSvgStyles(target, clonedDoc),
      });
      await new Promise((resolve) => {
        canvas.toBlob((blob) => {
          if (blob) download(blob, "cgpa-" + today() + ".png");
          resolve();
        }, "image/png");
      });
      toast("Image exported");
    } catch (err) {
      console.error("[App] Image export failed:", err);
      toast("Image export failed. Try PDF instead.");
    } finally {
      document.body.classList.remove("is-capturing");
      closed.forEach((d) => (d.open = false));
      syncTermClasses();
      renderTrendChart();
    }
  }

  /* ───────────── Menu ───────────── */

  function menuItems() {
    return $$('#appMenu [role="menuitem"]');
  }

  function openMenu(focusLast) {
    const menu = $("#appMenu");
    menu.hidden = false;
    $("#menuButton").setAttribute("aria-expanded", "true");
    const items = menuItems();
    (focusLast ? items[items.length - 1] : items[0]).focus();
  }

  function closeMenu(restore) {
    const menu = $("#appMenu");
    if (menu.hidden) return;
    menu.hidden = true;
    $("#menuButton").setAttribute("aria-expanded", "false");
    if (restore) $("#menuButton").focus();
  }

  function onMenuKey(e) {
    const items = menuItems();
    const i = items.indexOf(document.activeElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(i + 1) % items.length].focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(i - 1 + items.length) % items.length].focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      items[0].focus();
    } else if (e.key === "End") {
      e.preventDefault();
      items[items.length - 1].focus();
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeMenu(true);
    } else if (e.key === "Tab") {
      closeMenu(false);
    }
  }

  /* ───────────── Settings ───────────── */

  function renderSettings() {
    const s = S();
    $$('input[name="retakePolicy"]').forEach((r) => (r.checked = r.value === s.retakePolicy));
    $$('input[name="theme"]').forEach((r) => (r.checked = r.value === s.theme));
    $("#maxGradePoint").value = fmtNum(s.maxGradePoint);
    renderScaleRows(s.gradeScale);
    $("#scaleError").textContent = "";
    $("#termPreset").value = s.termPreset;
    renderTermRows();
  }

  function renderScaleRows(scale) {
    const max = S().maxGradePoint;
    $("#scaleRows").innerHTML = scale
      .map((g, i) => scaleRowHtml(g.label, fmtNum(g.point), i, max))
      .join("");
  }

  let scaleRowSeq = 0;
  function scaleRowHtml(label, point, i, max) {
    const id = "sr" + scaleRowSeq++;
    return (
      '<li class="scale-row">' +
      '<label class="sr-only" for="' + id + 'l">Grade label</label>' +
      '<input class="control" id="' + id + 'l" type="text" data-scale="label" value="' + escapeHtml(label) + '" maxlength="6" />' +
      '<label class="sr-only" for="' + id + 'p">Grade point</label>' +
      '<input class="control num" id="' + id + 'p" type="number" inputmode="decimal" step="0.01" min="0" max="' + max + '" data-scale="point" value="' + escapeHtml(point) + '" />' +
      '<button type="button" class="icon-btn" data-action="remove-scale-row" aria-label="Remove grade ' + escapeHtml(label || "row") + '">' + icon("x") + "</button>" +
      "</li>"
    );
  }

  function commitScale() {
    const err = $("#scaleError");
    const maxEl = $("#maxGradePoint");
    $$("#scaleRows .control, #maxGradePoint").forEach((c) => c.removeAttribute("aria-invalid"));
    const max = Number(maxEl.value);
    if (maxEl.value === "" || !Number.isFinite(max) || max <= 0) {
      maxEl.setAttribute("aria-invalid", "true");
      err.textContent = "Max grade point must be greater than 0.";
      return;
    }
    const rows = [];
    const seen = new Set();
    let problem = "";
    $$("#scaleRows .scale-row").forEach((row) => {
      const lEl = $('[data-scale="label"]', row);
      const pEl = $('[data-scale="point"]', row);
      pEl.max = String(max);
      const label = lEl.value.trim();
      const raw = pEl.value;
      if (!label && raw === "") return; // blank new row: ignore
      if (!label) {
        lEl.setAttribute("aria-invalid", "true");
        problem = problem || "Every grade needs a label.";
        return;
      }
      const point = Number(raw);
      if (raw === "" || !Number.isFinite(point) || point < 0 || point > max) {
        pEl.setAttribute("aria-invalid", "true");
        problem = problem || "Points for “" + label + "” must be between 0 and " + fmtNum(max) + ".";
        return;
      }
      if (seen.has(label.toLowerCase())) {
        lEl.setAttribute("aria-invalid", "true");
        problem = problem || "“" + label + "” appears twice.";
        return;
      }
      seen.add(label.toLowerCase());
      rows.push({ label: label, point: point });
    });
    if (!problem && !rows.length) problem = "Add at least one grade.";
    if (problem) {
      err.textContent = problem;
      return;
    }
    err.textContent = "";
    S().gradeScale = rows;
    S().maxGradePoint = max;
    persist();
    render();
  }

  function renderTermRows() {
    const custom = S().termPreset === "custom";
    $("#customTermsEditor").hidden = !custom;
    if (!custom) return;
    const terms = S().terms;
    $("#termRows").innerHTML = terms
      .map((t, i) => {
        const n = escapeHtml(t);
        return (
          '<li class="term-row"><span class="term-row-name">' + n + "</span>" +
          '<button type="button" class="icon-btn" data-action="move-term" data-dir="-1" data-index="' + i + '" aria-label="Move ' + n + ' up"' + (i === 0 ? " disabled" : "") + ">" + icon("up") + "</button>" +
          '<button type="button" class="icon-btn" data-action="move-term" data-dir="1" data-index="' + i + '" aria-label="Move ' + n + ' down"' + (i === terms.length - 1 ? " disabled" : "") + ">" + icon("down") + "</button>" +
          '<button type="button" class="icon-btn" data-action="remove-term" data-index="' + i + '" aria-label="Remove ' + n + '"' + (terms.length <= 1 ? " disabled" : "") + ">" + icon("x") + "</button>" +
          "</li>"
        );
      })
      .join("");
  }

  function commitTerms(focusSelector) {
    persist();
    render();
    renderTermRows();
    if (focusSelector) {
      const target = $(focusSelector);
      if (target && !target.disabled) target.focus();
      else $("#newTermName").focus();
    }
  }

  function addTerm() {
    const input = $("#newTermName");
    const name = input.value.trim().replace(/\s+/g, " ");
    const err = $("#termsError");
    if (!name) {
      err.textContent = "Type a term name first.";
      input.focus();
      return;
    }
    if (/\d/.test(name)) {
      err.textContent = "Leave the year out — you'll pick it when adding a course.";
      input.focus();
      return;
    }
    if (S().terms.some((t) => t.toLowerCase() === name.toLowerCase())) {
      err.textContent = "“" + name + "” is already in the list.";
      input.focus();
      return;
    }
    err.textContent = "";
    S().terms = S().terms.concat([name]);
    input.value = "";
    commitTerms();
    input.focus();
  }

  /* ───────────── Events ───────────── */

  function handleAction(action, btn, e) {
    switch (action) {
      case "add-course":
        openCourseDialog({}, btn);
        break;
      case "add-to-term":
        openCourseDialog({ term: { name: btn.dataset.termName, year: Number(btn.dataset.termYear) } }, btn);
        break;
      case "edit":
        openCourseDialog({ id: btn.dataset.id }, btn);
        break;
      case "delete": {
        const target = deleteCourse(btn.dataset.id);
        if (target) target.focus();
        break;
      }
      case "delete-from-sheet": {
        const dlg = $("#courseDialog");
        const target = deleteCourse(form.editingId);
        returnFocus.set(dlg, target || addControl());
        dlg.close();
        break;
      }
      case "toggle-all": {
        const all = $$("#termList .term-details");
        const open = !all.some((d) => d.open);
        all.forEach((d) => {
          d.open = open;
          ui.open[d.dataset.termId] = open;
        });
        saveUi();
        syncTermClasses();
        break;
      }
      case "edit-existing": {
        const opener = returnFocus.get($("#courseDialog"));
        openCourseDialog({ id: btn.dataset.id }, opener);
        break;
      }
      case "add-anyway": {
        const sel = selectedTerm();
        form.allowSameTerm = C.termId(sel) + "|" + form.matches.same.map((a) => a.id).join(",");
        $("#sameTermWarning").hidden = true;
        $("#courseSubmit").focus();
        break;
      }
      case "save-another":
        submitCourse(true);
        break;
      case "close-dialog": {
        const dlg = btn.closest("dialog");
        if (dlg) dlg.close();
        break;
      }
      case "toggle-menu":
        if ($("#appMenu").hidden) openMenu(false);
        else closeMenu(true);
        break;
      case "save-backup":
        closeMenu(true);
        saveBackup();
        break;
      case "load-backup":
        closeMenu(true);
        $("#loadFile").click();
        break;
      case "export-pdf":
        closeMenu(true);
        exportPdf();
        break;
      case "export-image":
        closeMenu(true);
        exportImage();
        break;
      case "clear-all":
        closeMenu(true);
        clearAll();
        break;
      case "open-settings":
        closeMenu(false);
        renderSettings();
        openDialog($("#settingsDialog"), btn);
        break;
      case "confirm-ok":
        settleConfirm(true);
        break;
      case "confirm-cancel":
        settleConfirm(false);
        break;
      case "add-scale-row": {
        $("#scaleRows").insertAdjacentHTML("beforeend", scaleRowHtml("", "", 0, S().maxGradePoint));
        const rows = $$("#scaleRows .scale-row");
        $('[data-scale="label"]', rows[rows.length - 1]).focus();
        break;
      }
      case "remove-scale-row": {
        const row = btn.closest(".scale-row");
        const next = row.nextElementSibling || row.previousElementSibling;
        row.remove();
        commitScale();
        if (next) $('[data-scale="label"]', next).focus();
        else $('[data-action="add-scale-row"]').focus();
        break;
      }
      case "reset-scale":
        S().gradeScale = JSON.parse(JSON.stringify(C.UIU_SCALE));
        S().maxGradePoint = 4;
        $("#maxGradePoint").value = "4";
        renderScaleRows(S().gradeScale);
        $("#scaleError").textContent = "";
        persist();
        render();
        toast("Grading scale reset to UIU");
        break;
      case "move-term": {
        const i = Number(btn.dataset.index);
        const j = i + Number(btn.dataset.dir);
        const terms = S().terms.slice();
        if (j < 0 || j >= terms.length) break;
        const tmp = terms[i];
        terms[i] = terms[j];
        terms[j] = tmp;
        S().terms = terms;
        commitTerms('[data-action="move-term"][data-index="' + j + '"][data-dir="' + btn.dataset.dir + '"]');
        break;
      }
      case "remove-term": {
        const i = Number(btn.dataset.index);
        if (S().terms.length <= 1) break;
        S().terms = S().terms.filter((_, k) => k !== i);
        commitTerms('[data-action="remove-term"][data-index="' + Math.min(i, S().terms.length - 1) + '"]');
        break;
      }
      case "add-term":
        addTerm();
        break;
      default:
        return;
    }
    if (e) e.preventDefault();
  }

  function syncTermClasses() {
    $$("#termList .term").forEach((t) => {
      const d = $(".term-details", t);
      t.classList.toggle("is-open", !!(d && d.open));
    });
    syncToggleAll();
  }

  function bindEvents() {
    // Remember open/closed per term when the user toggles a summary
    // (click covers mouse, touch, Enter and Space).
    $("#termList").addEventListener("click", (e) => {
      const summary = e.target.closest(".term-summary");
      if (!summary) return;
      const d = summary.parentElement;
      ui.open[d.dataset.termId] = !d.open; // state after the default toggle
      saveUi();
    });
    // "toggle" doesn't bubble; capture it to keep classes and the header button in sync.
    $("#termList").addEventListener("toggle", syncTermClasses, true);

    if ("ResizeObserver" in window) {
      let lastW = 0;
      let lastH = 0;
      new ResizeObserver((entries) => {
        const r = entries[0].contentRect;
        if (Math.round(r.width) === lastW && Math.round(r.height) === lastH) return;
        lastW = Math.round(r.width);
        lastH = Math.round(r.height);
        renderTrendChart();
      }).observe($("#trendChart"));
    }

    document.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (btn && !btn.disabled) handleAction(btn.dataset.action, btn, e);
      // Clicking outside the menu closes it.
      if (!$("#appMenu").hidden && !e.target.closest(".menu-wrap")) closeMenu(false);
    });

    $("#appMenu").addEventListener("keydown", onMenuKey);
    $("#menuButton").addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        openMenu(e.key === "ArrowUp");
      }
    });

    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        saveBackup();
      }
      if (e.key === "Escape" && !$("#appMenu").hidden) closeMenu(true);
    });

    // Course form
    el.form.addEventListener("submit", (e) => {
      e.preventDefault();
      submitCourse(false);
    });
    el.name.addEventListener("input", () => evaluateAttempts());
    el.code.addEventListener("input", () => evaluateAttempts());
    el.termName.addEventListener("change", () => {
      syncLegacyUi();
      evaluateAttempts();
    });
    el.termYear.addEventListener("change", () => evaluateAttempts());
    el.retake.addEventListener("change", () => {
      form.autoChecked = false;
      evaluateAttempts(); // refresh notice wording; key is unchanged so nothing is autofilled
    });
    $("#gradeModeSeg").addEventListener("change", (e) => {
      if (e.target.name !== "gradeMode") return;
      setGradeMode(e.target.value, true);
      S().gradeInputMode = e.target.value;
      persist();
      (e.target.value === "custom" ? el.gradeCustom : el.gradeLetter).focus();
    });
    // Clear a field's error as soon as the user fixes it.
    el.form.addEventListener("input", (e) => {
      const ctrl = e.target;
      if (ctrl.getAttribute("aria-invalid") !== "true") return;
      ctrl.removeAttribute("aria-invalid");
      const errId = ctrl.getAttribute("aria-describedby");
      if (errId && $("#" + errId)) $("#" + errId).textContent = "";
    });
    el.form.addEventListener("change", (e) => {
      if (e.target === el.gradeLetter && el.gradeLetter.value) {
        el.gradeLetter.removeAttribute("aria-invalid");
        $("#gradeError").textContent = "";
      }
    });

    // Confirm dialog: Esc / backdrop resolve as "cancel".
    $("#confirmDialog").addEventListener("close", () => settleConfirm(false));

    // Settings
    const settings = $("#settingsDialog");
    settings.addEventListener("change", (e) => {
      const t = e.target;
      if (t.name === "retakePolicy") {
        S().retakePolicy = t.value;
        persist();
        render({ announce: true });
      } else if (t.name === "theme") {
        S().theme = t.value;
        persist();
        applyTheme();
        render();
      } else if (t.id === "termPreset") {
        S().termPreset = t.value;
        if (t.value !== "custom") S().terms = C.TERM_PRESETS[t.value].slice();
        $("#termsError").textContent = "";
        commitTerms();
      }
    });
    settings.addEventListener("input", (e) => {
      if (e.target.matches("[data-scale], #maxGradePoint")) commitScale();
    });
    $("#newTermName").addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addTerm();
      }
    });

    $("#loadFile").addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) loadBackupFile(file);
      e.target.value = "";
    });

    $$("dialog").forEach(setupDialogFocusRestore);

    // System theme changes (auto mode) update the theme-color meta and chart.
    const onScheme = () => {
      applyTheme();
      render();
    };
    if (darkMQ.addEventListener) darkMQ.addEventListener("change", onScheme);
    else if (darkMQ.addListener) darkMQ.addListener(onScheme);

    // Compact CGPA in the header once the hero scrolls away (mobile).
    const bar = $("#appBar");
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        (entries) => {
          const hidden = !entries[0].isIntersecting && !document.body.classList.contains("is-empty");
          bar.classList.toggle("show-compact", hidden);
        },
        { rootMargin: "-" + 60 + "px 0px 0px 0px", threshold: 0 },
      );
      io.observe($(".ring"));
    }
    // FAB hides while scrolling down (so it never sits over row actions) and
    // returns on scroll up or at the end of the page.
    const fab = $("#fab");
    let lastY = window.scrollY;
    const onScroll = () => {
      const yNow = window.scrollY;
      bar.classList.toggle("is-scrolled", yNow > 4);
      const atEnd = window.innerHeight + yNow >= document.documentElement.scrollHeight - 8;
      if (Math.abs(yNow - lastY) < 6 && !atEnd) return;
      const hide = yNow > lastY && yNow > 80 && !atEnd && document.activeElement !== fab;
      fab.classList.toggle("is-hidden", hide);
      lastY = yNow;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ───────────── Init ───────────── */

  function init() {
    el.form = $("#courseForm");
    el.termName = $("#termName");
    el.termYear = $("#termYear");
    el.code = $("#courseCode");
    el.name = $("#courseName");
    el.credits = $("#credits");
    el.modeLetter = $("#gradeModeLetter");
    el.modeCustom = $("#gradeModeCustom");
    el.gradeLetter = $("#gradeLetter");
    el.gradeCustom = $("#gradeCustom");
    el.retake = $("#retake");
    el.previousGpa = $("#previousGpa");

    if (/Mac|iPhone|iPad/.test(navigator.platform || "")) $("#saveShortcut").textContent = "⌘S";

    applyTheme();
    // Persist migrated (v2) data straight away so old v1 data is upgraded once.
    try {
      if (localStorage.getItem(STORAGE_KEY)) persist();
    } catch (err) {
      /* storage unavailable: keep working in memory */
    }
    render();
    bindEvents();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  // Exposed for debugging in the console.
  window.CGPAApp = { getState: () => state, escapeHtml: escapeHtml };
})();
