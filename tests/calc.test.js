// Run with: node --test
const test = require("node:test");
const assert = require("node:assert/strict");
const CGPA = require("../calc.js");

const T = (name, year) => ({ name, year });
let n = 0;
const course = (o) => Object.assign({ id: "id" + ++n, code: "", name: "X", credits: 3, gpa: 4, grade: null, term: T("Spring", 2025), termLabel: "", retake: false, previousGpa: null }, o);
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test("parseTerm handles common legacy formats", () => {
  const terms = CGPA.TERM_PRESETS.trimester;
  assert.deepEqual(CGPA.parseTerm("Fall 2025", terms), T("Fall", 2025));
  assert.deepEqual(CGPA.parseTerm("fall-25", terms), T("Fall", 2025));
  assert.deepEqual(CGPA.parseTerm("2024 Summer", terms), T("Summer", 2024));
  assert.deepEqual(CGPA.parseTerm("Spr'24", terms), T("Spring", 2024));
  assert.deepEqual(CGPA.parseTerm("Autumn 2023", terms), T("Fall", 2023));
  assert.equal(CGPA.parseTerm("Semester 1", terms), null);
  assert.equal(CGPA.parseTerm("Fall", terms), null);
  assert.equal(CGPA.parseTerm("", terms), null);
});

test("terms sort chronologically: Spring < Summer < Fall, then year", () => {
  const terms = CGPA.TERM_PRESETS.trimester;
  const order = (t) => CGPA.termOrder({ term: t }, terms);
  assert.ok(order(T("Spring", 2025)) < order(T("Summer", 2025)));
  assert.ok(order(T("Summer", 2025)) < order(T("Fall", 2025)));
  assert.ok(order(T("Fall", 2024)) < order(T("Spring", 2025)));
  assert.equal(CGPA.termOrder({ term: null, termLabel: "x" }, terms), Infinity);
});

test("plain CGPA is credit-weighted", () => {
  const r = CGPA.compute([course({ name: "A", credits: 3, gpa: 4 }), course({ name: "B", credits: 1, gpa: 2 })], {});
  near(r.cgpa, 14 / 4);
  assert.equal(r.attemptedCredits, 4);
});

test("retake: best grade policy keeps the higher attempt even if older", () => {
  const old = course({ name: "Physics", gpa: 3.33, term: T("Spring", 2024) });
  const neu = course({ name: "physics ", gpa: 2.0, term: T("Fall", 2024), retake: true });
  const r = CGPA.compute([old, neu], { retakePolicy: "best" });
  assert.ok(r.countedIds.has(old.id));
  assert.equal(r.replacedBy.get(neu.id), old.id);
  near(r.cgpa, 3.33);
});

test("retake: latest policy uses term order, not entry order", () => {
  const neu = course({ name: "Physics", gpa: 2.0, term: T("Fall", 2024), retake: true });
  const old = course({ name: "Physics", gpa: 3.33, term: T("Spring", 2024) }); // entered later
  const r = CGPA.compute([neu, old], { retakePolicy: "latest" });
  assert.ok(r.countedIds.has(neu.id));
  near(r.cgpa, 2.0);
});

test("best policy: equal grades -> latest attempt counts", () => {
  const a = course({ name: "M", gpa: 3, term: T("Spring", 2024) });
  const b = course({ name: "M", gpa: 3, term: T("Summer", 2024) });
  const r = CGPA.compute([b, a], { retakePolicy: "best" });
  assert.ok(r.countedIds.has(b.id));
});

test("replaced attempt is excluded from its own term's SGPA", () => {
  const f = course({ name: "Chem", gpa: 0, credits: 3, term: T("Spring", 2024) });
  const other = course({ name: "Eng", gpa: 4, credits: 3, term: T("Spring", 2024) });
  const re = course({ name: "Chem", gpa: 3, credits: 3, term: T("Fall", 2024), retake: true });
  const r = CGPA.compute([f, other, re], { retakePolicy: "best" });
  const spring = r.terms.find((t) => t.label === "Spring 2024");
  const fall = r.terms.find((t) => t.label === "Fall 2024");
  near(spring.sgpa, 4); // F no longer counted there
  near(fall.sgpa, 3);
  assert.equal(spring.courses.length, 2); // still listed
  near(r.cgpa, 3.5);
});

test("course code takes precedence over name for matching", () => {
  const a = course({ code: "CSE 1111", name: "Structured Programming", gpa: 2, term: T("Spring", 2024) });
  const b = course({ code: "cse1111", name: "SPL", gpa: 3.67, term: T("Fall", 2024) });
  const c = course({ code: "CSE 2213", name: "Structured Programming", gpa: 1, term: T("Fall", 2024) });
  const r = CGPA.compute([a, b, c], {});
  assert.ok(r.countedIds.has(b.id) && r.countedIds.has(c.id) && !r.countedIds.has(a.id));
});

test("name matches when only one attempt has a code", () => {
  const a = course({ code: "", name: "Physics", gpa: 2, term: T("Spring", 2024) });
  const b = course({ code: "PHY 2105", name: "physics", gpa: 3, term: T("Fall", 2024) });
  const r = CGPA.compute([a, b], {});
  assert.equal(r.replacedBy.get(a.id), b.id);
  assert.equal(CGPA.findAttempts([a, b], { name: "Physics", code: "PHY2105" }, null).length, 2);
});

test("unlimited credits in a term are accepted", () => {
  const big = course({ name: "Future", credits: 60, gpa: 3.5 });
  assert.deepEqual(CGPA.validateCourse(big, CGPA.normalizeSettings({})), {});
  near(CGPA.compute([big], {}).cgpa, 3.5);
});

test("validation respects configurable max grade point", () => {
  const s = CGPA.normalizeSettings({ maxGradePoint: 5 });
  assert.deepEqual(CGPA.validateCourse(course({ gpa: 4.8 }), s), {});
  assert.ok(CGPA.validateCourse(course({ gpa: 4.8 }), CGPA.normalizeSettings({})).gpa);
  assert.ok(CGPA.validateCourse(course({ credits: 0 }), s).credits);
  assert.ok(CGPA.validateCourse(course({ name: " " }), s).name);
  assert.ok(CGPA.validateCourse(course({ term: null, termLabel: "" }), s).term);
});

test("earned credits exclude F; stats count only counted attempts", () => {
  const r = CGPA.compute([course({ name: "A", gpa: 0, credits: 3 }), course({ name: "B", gpa: 3, credits: 4 })], {});
  assert.equal(r.earnedCredits, 4);
  assert.equal(r.completedCourses, 1);
  assert.equal(r.attemptedCredits, 7);
});

test("findAttempts returns other attempts oldest-first and skips self", () => {
  const a = course({ name: "Bio", term: T("Fall", 2024) });
  const b = course({ name: "Bio", term: T("Spring", 2024) });
  const self = course({ name: "Bio", term: T("Fall", 2025) });
  const found = CGPA.findAttempts([a, b, self], { name: "BIO" }, self.id, CGPA.TERM_PRESETS.trimester);
  assert.deepEqual(found.map((c) => c.id), [b.id, a.id]);
  assert.deepEqual(CGPA.findAttempts([a], { name: "" }, null), []);
});

test("migrate upgrades v1 data and keeps unparseable labels", () => {
  const v1 = {
    courses: [
      { name: "Math", semester: "Fall 2025", credits: 3, gpa: 3.67, gradePoints: 11.01, retake: false, previousGpa: null },
      { name: "Art", semester: "Semester 1", credits: "2", gpa: 3.5, retake: true, previousGpa: "2" },
    ],
  };
  const d = CGPA.migrate(v1);
  assert.equal(d.version, 2);
  assert.equal(d.settings.retakePolicy, "best");
  assert.deepEqual(d.courses[0].term, T("Fall", 2025));
  assert.equal(d.courses[0].grade, "A-");
  assert.equal(d.courses[1].term, null);
  assert.equal(d.courses[1].termLabel, "Semester 1");
  assert.equal(d.courses[1].grade, null); // 3.5 is custom
  assert.equal(d.courses[1].credits, 2);
  assert.equal(d.courses[1].previousGpa, 2);
  assert.ok(d.courses[0].id && d.courses[0].id !== d.courses[1].id);
});

test("migrate is idempotent on v2 data and accepts bare arrays / junk", () => {
  const d = CGPA.migrate({ courses: [{ name: "X", semester: "Spring 2024", credits: 3, gpa: 4 }] });
  assert.deepEqual(CGPA.migrate(JSON.parse(JSON.stringify(d))), d);
  assert.equal(CGPA.migrate([{ name: "Y", credits: 1, gpa: 1 }]).courses.length, 1);
  assert.deepEqual(CGPA.migrate(null).courses, []);
});

test("unparsed terms sort after real terms", () => {
  const r = CGPA.compute([course({ name: "A", term: null, termLabel: "Old stuff" }), course({ name: "B", term: T("Fall", 2030) })], {});
  assert.deepEqual(r.terms.map((t) => t.label), ["Fall 2030", "Old stuff"]);
});

test("stored grade point wins over a changed grading scale", () => {
  const c = course({ grade: "A", gpa: 4 });
  const r = CGPA.compute([c], { gradeScale: [{ label: "A", point: 5 }], maxGradePoint: 5 });
  near(r.cgpa, 4);
});
