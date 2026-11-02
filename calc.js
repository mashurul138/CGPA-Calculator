/**
 * CGPA Calculator — pure calculation, term and migration logic.
 *
 * No DOM access here so it can be unit-tested with `node --test`.
 * Loaded in the browser via a plain <script> tag (exposes window.CGPA).
 */
(function (root) {
  "use strict";

  const UIU_SCALE = [
    { label: "A", point: 4.0 },
    { label: "A-", point: 3.67 },
    { label: "B+", point: 3.33 },
    { label: "B", point: 3.0 },
    { label: "B-", point: 2.67 },
    { label: "C+", point: 2.33 },
    { label: "C", point: 2.0 },
    { label: "C-", point: 1.67 },
    { label: "D+", point: 1.33 },
    { label: "D", point: 1.0 },
    { label: "F", point: 0.0 },
  ];

  const TERM_PRESETS = {
    trimester: ["Spring", "Summer", "Fall"],
    semester: ["Spring", "Fall"],
  };

  const DEFAULT_SETTINGS = {
    retakePolicy: "best", // "best" | "latest"
    theme: "auto", // "auto" | "light" | "dark"
    gradeScale: UIU_SCALE,
    maxGradePoint: 4,
    termPreset: "trimester", // "trimester" | "semester" | "custom"
    terms: TERM_PRESETS.trimester,
    gradeInputMode: "letter", // "letter" | "custom"
  };

  const SCHEMA_VERSION = 2;

  // Common abbreviations so legacy free text like "spr-25" still parses.
  const TERM_ALIASES = {
    spr: "spring",
    sum: "summer",
    smr: "summer",
    fal: "fall",
    autumn: "fall",
    aut: "fall",
    win: "winter",
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeText(value) {
    return String(value == null ? "" : value).trim().replace(/\s+/g, " ").toLowerCase();
  }

  function normalizeCode(code) {
    return normalizeText(code).replace(/\s+/g, "");
  }

  /**
   * Two entries are attempts of the same course when both have a code and the
   * codes match; when either lacks a code, the names must match instead.
   */
  function sameCourse(a, b) {
    const ca = normalizeCode(a.code);
    const cb = normalizeCode(b.code);
    if (ca && cb) return ca === cb;
    const na = normalizeText(a.name);
    return na !== "" && na === normalizeText(b.name);
  }

  /** Groups course indices into attempt groups (union-find over sameCourse). */
  function groupAttempts(courses) {
    const parent = courses.map((_, i) => i);
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (let i = 0; i < courses.length; i++) {
      for (let j = i + 1; j < courses.length; j++) {
        if (sameCourse(courses[i], courses[j])) parent[find(j)] = find(i);
      }
    }
    const groups = new Map();
    courses.forEach((c, i) => {
      const root = find(i);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root).push({ c: c, i: i });
    });
    return Array.from(groups.values());
  }

  /**
   * Parse free text like "Fall 2025", "fall-25", "2025 Summer", "Spr'24".
   * Returns { name, year } using the canonical term name from `terms`, or null.
   */
  function parseTerm(text, terms) {
    const raw = normalizeText(text);
    if (!raw) return null;
    const yearMatch = raw.match(/(?:^|[^0-9])(\d{4}|\d{2})(?![0-9])/);
    if (!yearMatch) return null;
    let year = parseInt(yearMatch[1], 10);
    if (yearMatch[1].length === 2) year += 2000;

    const words = raw.replace(/[0-9'’_\-\/.,]+/g, " ").trim().split(/\s+/).filter(Boolean);
    if (words.length !== 1) return null;
    let word = words[0];
    const list = terms || TERM_PRESETS.trimester;
    let match = list.find((t) => normalizeText(t) === word);
    if (!match) {
      word = TERM_ALIASES[word] || TERM_ALIASES[word.slice(0, 3)] || word;
      match = list.find((t) => normalizeText(t) === word || normalizeText(t).startsWith(word));
    }
    return match ? { name: match, year: year } : null;
  }

  function formatTerm(course) {
    if (course.term && course.term.name) return course.term.name + " " + course.term.year;
    return String(course.termLabel || "").trim() || "Unassigned";
  }

  /** Stable grouping id for a course's term. */
  function termId(course) {
    if (course.term && course.term.name) return course.term.year + ":" + normalizeText(course.term.name);
    return "other:" + normalizeText(formatTerm(course));
  }

  /**
   * Chronological sort key. Unknown term names (e.g. after the term list
   * changes) sort after known ones in the same year; unparsed labels go last.
   */
  function termOrder(course, terms) {
    if (!course.term || !course.term.name) return Number.POSITIVE_INFINITY;
    const list = terms || TERM_PRESETS.trimester;
    let idx = list.findIndex((t) => normalizeText(t) === normalizeText(course.term.name));
    if (idx < 0) idx = list.length;
    return Number(course.term.year) * 100 + idx;
  }

  function gradeLabelFor(point, scale) {
    const found = (scale || UIU_SCALE).find((g) => Math.abs(Number(g.point) - point) < 0.005);
    return found ? found.label : null;
  }

  function makeId() {
    return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function normalizeSettings(raw) {
    const s = Object.assign(clone(DEFAULT_SETTINGS), raw && typeof raw === "object" ? raw : {});
    if (s.retakePolicy !== "latest") s.retakePolicy = "best";
    if (!["auto", "light", "dark"].includes(s.theme)) s.theme = "auto";
    if (s.gradeInputMode !== "custom") s.gradeInputMode = "letter";
    s.maxGradePoint = Number(s.maxGradePoint) > 0 ? Number(s.maxGradePoint) : 4;
    if (!Array.isArray(s.gradeScale) || s.gradeScale.length === 0) s.gradeScale = clone(UIU_SCALE);
    s.gradeScale = s.gradeScale
      .map((g) => ({ label: String(g.label || "").trim(), point: Number(g.point) }))
      .filter((g) => g.label && Number.isFinite(g.point));
    if (!Array.isArray(s.terms) || s.terms.length === 0) s.terms = clone(TERM_PRESETS.trimester);
    s.terms = s.terms.map((t) => String(t).trim()).filter(Boolean);
    if (!["trimester", "semester", "custom"].includes(s.termPreset)) s.termPreset = "custom";
    return s;
  }

  function normalizeCourse(c, settings) {
    const credits = Number(c.credits) || 0;
    const gpa = Number(c.gpa) || 0;
    let term = null;
    let termLabel = "";
    if (c.term && c.term.name && Number.isFinite(Number(c.term.year))) {
      term = { name: String(c.term.name), year: Number(c.term.year) };
    } else {
      // v1 stored free text in `semester`.
      const text = c.termLabel != null ? c.termLabel : c.semester;
      term = parseTerm(text, settings.terms);
      if (!term) termLabel = String(text || "").trim();
    }
    const prev = c.previousGpa;
    return {
      id: c.id ? String(c.id) : makeId(),
      code: String(c.code || "").trim(),
      name: String(c.name || "").trim(),
      credits: credits,
      gpa: gpa,
      grade: c.grade !== undefined ? c.grade || null : gradeLabelFor(gpa, settings.gradeScale),
      term: term,
      termLabel: termLabel,
      retake: !!c.retake,
      previousGpa: prev === undefined || prev === null || prev === "" || isNaN(Number(prev)) ? null : Number(prev),
    };
  }

  /**
   * Accepts v2 data, v1 data ({ courses: [{ name, semester, ... }] }) or a
   * bare course array, and returns normalized v2 data.
   */
  function migrate(raw) {
    const data = Array.isArray(raw) ? { courses: raw } : raw && typeof raw === "object" ? raw : {};
    const settings = normalizeSettings(data.settings);
    const list = Array.isArray(data.courses) ? data.courses : [];
    const courses = list.filter((c) => c && typeof c === "object").map((c) => normalizeCourse(c, settings));
    return { version: SCHEMA_VERSION, settings: settings, courses: courses };
  }

  /** Earlier attempts of the same course, oldest first. */
  function findAttempts(courses, probe, excludeId, terms) {
    return courses
      .map((c, i) => ({ c: c, i: i }))
      .filter((x) => x.c.id !== excludeId && sameCourse(probe, x.c))
      .sort((a, b) => termOrder(a.c, terms) - termOrder(b.c, terms) || a.i - b.i)
      .map((x) => x.c);
  }

  function validateCourse(input, settings) {
    const errors = {};
    const max = settings.maxGradePoint;
    if (!String(input.name || "").trim()) errors.name = "Enter a course name.";
    if (!input.term && !String(input.termLabel || "").trim()) errors.term = "Pick a term.";
    const credits = Number(input.credits);
    if (input.credits === "" || input.credits == null || !Number.isFinite(credits) || credits <= 0) {
      errors.credits = "Credits must be greater than 0.";
    }
    const gpa = Number(input.gpa);
    if (input.gpa === "" || input.gpa == null || !Number.isFinite(gpa) || gpa < 0 || gpa > max) {
      errors.gpa = "Grade point must be between 0 and " + max + ".";
    }
    const prev = input.previousGpa;
    if (prev !== null && prev !== undefined && prev !== "") {
      const p = Number(prev);
      if (!Number.isFinite(p) || p < 0 || p > max) errors.previousGpa = "Previous grade must be between 0 and " + max + ".";
    }
    return errors;
  }

  /**
   * Core calculation.
   * - Attempts of the same course (see sameCourse) compete; exactly one counts,
   *   chosen by settings.retakePolicy ("best" grade or "latest" term).
   * - Non-counted attempts stay visible but are excluded from both their own
   *   term's SGPA and the CGPA.
   */
  function compute(courses, settingsRaw) {
    const settings = normalizeSettings(settingsRaw);
    const terms = settings.terms;
    const countedIds = new Set();
    const replacedBy = new Map();
    groupAttempts(courses).forEach((list) => {
      // Chronological, ties broken by entry order.
      const sorted = list.slice().sort((a, b) => termOrder(a.c, terms) - termOrder(b.c, terms) || a.i - b.i);
      let winner = sorted[sorted.length - 1];
      if (settings.retakePolicy === "best") {
        // ">=" while scanning oldest -> newest keeps the latest among equal grades.
        winner = sorted.reduce((best, x) => (Number(x.c.gpa) >= Number(best.c.gpa) ? x : best), sorted[0]);
      }
      countedIds.add(winner.c.id);
      sorted.forEach((x) => {
        if (x !== winner) replacedBy.set(x.c.id, winner.c.id);
      });
    });

    const termMap = new Map();
    courses.forEach((c, i) => {
      const id = termId(c);
      if (!termMap.has(id)) {
        termMap.set(id, { id: id, label: formatTerm(c), term: c.term, order: termOrder(c, terms), firstIndex: i, courses: [], credits: 0, points: 0, sgpa: null });
      }
      const t = termMap.get(id);
      t.courses.push(c);
      if (countedIds.has(c.id)) {
        t.credits += Number(c.credits) || 0;
        t.points += (Number(c.credits) || 0) * (Number(c.gpa) || 0);
      }
    });

    const termList = Array.from(termMap.values()).sort(
      (a, b) => a.order - b.order || (a.order === Infinity ? a.label.localeCompare(b.label) : 0) || a.firstIndex - b.firstIndex,
    );
    termList.forEach((t) => {
      t.sgpa = t.credits > 0 ? t.points / t.credits : null;
    });

    let credits = 0;
    let points = 0;
    let earnedCredits = 0;
    let completedCourses = 0;
    courses.forEach((c) => {
      if (!countedIds.has(c.id)) return;
      const cr = Number(c.credits) || 0;
      credits += cr;
      points += cr * (Number(c.gpa) || 0);
      if (Number(c.gpa) > 0) {
        earnedCredits += cr;
        completedCourses += 1;
      }
    });

    const graded = termList.filter((t) => t.sgpa !== null);
    return {
      cgpa: credits > 0 ? points / credits : 0,
      attemptedCredits: credits,
      earnedCredits: earnedCredits,
      completedCourses: completedCourses,
      totalAttempts: courses.length,
      retakeCount: courses.filter((c) => c.retake).length,
      lastSgpa: graded.length ? graded[graded.length - 1].sgpa : null,
      terms: termList,
      trend: graded.map((t) => ({ label: t.label, sgpa: t.sgpa })),
      countedIds: countedIds,
      replacedBy: replacedBy,
    };
  }

  const CGPA = {
    UIU_SCALE: UIU_SCALE,
    TERM_PRESETS: TERM_PRESETS,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    SCHEMA_VERSION: SCHEMA_VERSION,
    sameCourse: sameCourse,
    parseTerm: parseTerm,
    formatTerm: formatTerm,
    termId: termId,
    termOrder: termOrder,
    gradeLabelFor: gradeLabelFor,
    normalizeSettings: normalizeSettings,
    normalizeCourse: normalizeCourse,
    migrate: migrate,
    findAttempts: findAttempts,
    validateCourse: validateCourse,
    compute: compute,
    makeId: makeId,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = CGPA;
  else root.CGPA = CGPA;
})(typeof window !== "undefined" ? window : globalThis);
