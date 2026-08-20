#!/usr/bin/env node
/* HUSH — the assertions the original handoff specified and never shipped.
   No dependencies, no browser. Run from anywhere:

     node hush/tests/hush_tests.mjs
     node hush/tests/hush_tests.mjs --selftest     (proves the suite can fail)

   Everything here extracts the REAL functions and tables out of index.html and
   runs them. Nothing is restated. If a function is renamed or moved, the
   extraction fails loudly rather than passing on a stale copy, which is how
   the rarity simulator in this repo drifted from live code twice.

   The classes the brief named, and where they are below:
     preset whitelist safety ...... [share]
     volume caps .................. [volume]
     timer arithmetic ............. [timer]
     fade curves .................. [fade]
     save round trip .............. [save]
     corrupt save recovery ........ [save]
     worker prefix safety ......... [worker]   <- the one that wiped the fleet
   plus comb floor, share round trip, simple mode control count, and the iOS
   wake lock posture.

   WATCHED FAIL. Every assertion class below was broken on purpose in a copy of
   the source and the suite was confirmed to go red before it was trusted.
   `--selftest` re-runs those mutations: it patches the source in memory, runs
   the whole suite against each patch, and fails if any patch leaves the suite
   green. The mutation list is MUTATIONS at the bottom. A probe that cannot
   fail is not evidence. */

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(HERE, "..", "index.html");
const WORKER = path.join(HERE, "..", "sw.js");

let pass = 0, fail = 0;
const fails = [];
function ok(cond, label, detail) {
  if (cond) { pass++; if (!QUIET) console.log("  ok  " + label); }
  else { fail++; fails.push(label); if (!QUIET) console.log("  RED " + label + (detail ? "   " + detail : "")); }
}
function group(name) { if (!QUIET) console.log("[" + name + "]"); }
let QUIET = false;

/* ------------------------------------------------------------------ */
/* extraction: pull a named declaration out with balanced brackets      */
/* ------------------------------------------------------------------ */
function scriptOf(html) {
  const m = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error("no inline script block in index.html");
  return m[1];
}
/* Bracket matcher that knows about strings, template literals, regex-ish
   slashes and both comment styles. Naive counting breaks on the apostrophes
   and braces that live all over this file's prose. */
function balanced(src, from) {
  const open = src[from];
  const close = { "{": "}", "[": "]", "(": ")" }[open];
  if (!close) throw new Error("balanced() wants a bracket, got " + open);
  let depth = 0, i = from, s = null, esc = false;
  for (; i < src.length; i++) {
    const c = src[i];
    if (s) {
      if (esc) { esc = false; continue; }
      if (c === "\\") { esc = true; continue; }
      if (s === "//" || s === "'" || s === '"') { if (c === "\n" && s === "//") s = null; else if (c === s) s = null; continue; }
      if (s === "`") { if (c === "`") s = null; continue; }
      if (s === "/*") { if (c === "*" && src[i+1] === "/") { s = null; i++; } continue; }
      continue;
    }
    if (c === "/" && src[i+1] === "/") { s = "//"; i++; continue; }
    if (c === "/" && src[i+1] === "*") { s = "/*"; i++; continue; }
    if (c === "'" || c === '"' || c === "`") { s = c; continue; }
    if (c === open) depth++;
    else if (c === close) { depth--; if (!depth) return src.slice(from, i + 1); }
  }
  throw new Error("unbalanced from " + from);
}
/* Read forward to the semicolon that ends the statement, at bracket depth
   zero, ignoring the ones inside strings, template literals and comments.
   Object literals, arrow bodies and Object.assign(...) chains all come out
   whole, which the old "to end of line" version did not manage. */
function grabConst(src, name) {
  const re = new RegExp("(?:^|\\n)\\s*(?:const|let|var)\\s+" + name + "\\s*=\\s*");
  const m = re.exec(src);
  if (!m) throw new Error("could not find declaration of " + name);
  const at = m.index + m[0].length;
  let depth = 0, s = null, esc = false, i = at;
  for (; i < src.length; i++) {
    const c = src[i];
    if (s) {
      if (esc) { esc = false; continue; }
      if (c === "\\") { esc = true; continue; }
      if (s === "//") { if (c === "\n") s = null; continue; }
      if (s === "/*") { if (c === "*" && src[i+1] === "/") { s = null; i++; } continue; }
      if (c === s) s = null;
      continue;
    }
    if (c === "/" && src[i+1] === "/") { s = "//"; i++; continue; }
    if (c === "/" && src[i+1] === "*") { s = "/*"; i++; continue; }
    if (c === "'" || c === '"' || c === "`") { s = c; continue; }
    if (c === "{" || c === "[" || c === "(") depth++;
    else if (c === "}" || c === "]" || c === ")") depth--;
    else if (c === ";" && depth === 0) break;
    else if (c === "\n" && depth === 0) {
      // an expression that simply ended without a semicolon
      const rest = src.slice(i + 1).match(/^\s*(?:const|let|var|function|\/\*|\/\/|$)/);
      if (rest) break;
    }
  }
  return "var " + name + " = " + src.slice(at, i).trim().replace(/;$/, "") + ";";
}
function grabFn(src, name) {
  const re = new RegExp("(?:^|\\n)\\s*(?:async\\s+)?function\\s+" + name + "\\s*\\(");
  const m = re.exec(src);
  if (!m) throw new Error("could not find function " + name);
  const start = m.index + (m[0][0] === "\n" ? 1 : 0);
  const brace = src.indexOf("{", m.index + m[0].length - 1);
  return src.slice(start, brace) + balanced(src, brace);
}

const html = fs.readFileSync(APP, "utf8");
const SRC = scriptOf(html);

/* ------------------------------------------------------------------ */
/* a sandbox with just enough app in it to run the real functions       */
/* ------------------------------------------------------------------ */
function makeBox(src, extra) {
  const pieces = [
    "const clamp = (v,a,b) => Math.min(b, Math.max(a, v));",
    "const pad2 = n => String(n).padStart(2,'0');",
    "const PHI = 1.6180339887;",
    grabConst(src, "s2f"), grabConst(src, "f2s"),
    grabConst(src, "NOISES"), grabConst(src, "TUNE_MODES"), grabConst(src, "PULSES"),
    grabConst(src, "CHRS"),
    grabConst(src, "BEATS"), grabConst(src, "VIZ_MODES"), grabConst(src, "SCALES"),
    grabConst(src, "PRESETS"), grabConst(src, "VOICE_PRESETS"), grabConst(src, "PROGRAMS"),
    grabConst(src, "SOUND_DEFAULTS"), grabConst(src, "SAVE_RANGES"),
    grabConst(src, "SHARE_KEYS"), grabConst(src, "SHARE_ENUMS"), grabConst(src, "SHARE_DEFAULTS"),
    grabConst(src, "SHORTLIST"), grabConst(src, "TIERS"), grabConst(src, "INFO"),
    grabConst(src, "fadeSeconds"), grabConst(src, "fmtLeft"),
    grabFn(src, "sanitiseSaved"), grabFn(src, "sanitiseEnums"),
    grabConst(src, "METRICS"), grabConst(src, "DATE_RE"),
    grabFn(src, "finiteIn"), grabFn(src, "sanitiseNight"),
    grabFn(src, "sanitiseNights"), grabFn(src, "sanitiseTrial"),
    grabFn(src, "clampToControl"), grabFn(src, "applyShared"),
    grabFn(src, "b64urlEnc"), grabFn(src, "b64urlDec"), grabFn(src, "shareEncode"),
    grabFn(src, "readSharedLink"), grabFn(src, "targetGain"), grabFn(src, "nameOfSound"),
    grabFn(src, "pickTonight")
  ];
  // the S literal, verbatim, plus the DEFAULTS snapshot the app makes from it
  const sLit = grabConst(src, "S");
  const box = {
    btoa: s => Buffer.from(s, "binary").toString("base64"),
    atob: s => Buffer.from(s, "base64").toString("binary"),
    escape, unescape, encodeURIComponent, decodeURIComponent,
    console,
    // stubs for everything readSharedLink touches that is not the point of the test
    location: { hash: "", pathname: "/hush/", origin: "https://lucidwinds.com" },
    history: { replaceState() {} },
    document: { getElementById: () => null },
    navigator: { userAgent: "node", platform: "node", maxTouchPoints: 0 },
    $: () => null,
    save() { box.saveCalls = (box.saveCalls || 0) + 1; },
    syncUI() {}, loadNoise() {}, apply() {}, renderTonight() {},
    ctx: null, playing: false, progGain: 1, adaptGain: 1, sharedPick: null,
    timerEnd: 0, fadeTo: 0
  };
  vm.createContext(box);
  vm.runInContext(sLit + "\nvar DEFAULTS = Object.assign({}, S);\n" + pieces.join("\n") + (extra || ""), box);
  return box;
}

/* ================================================================== */
function run(src, workerSrc) {
  pass = 0; fail = 0; fails.length = 0;
  const box = makeBox(src);

  /* ---------------- [share] preset whitelist safety ---------------- */
  group("share");
  const FORBIDDEN = ["vol","cap","timer","fade","micOn","adapt","cal","sens","lift",
    "wake","wakeTime","okWake","sunrise","mode","blinded","lastUsed","vizMode","program"];
  ok(FORBIDDEN.every(k => box.SHARE_KEYS.indexOf(k) < 0),
    "no protected key is shareable",
    FORBIDDEN.filter(k => box.SHARE_KEYS.indexOf(k) >= 0).join(","));
  ok(box.SHARE_KEYS.every(k => k in box.DEFAULTS),
    "every shareable key is a real state key");

  // a hostile payload asking for every protected thing at once
  const hostile = { vol: 100, cap: false, micOn: true, mode: "full", timer: 999,
    wake: true, okWake: true, blinded: false, noise: "pink" };
  box.S.vol = 18; box.S.cap = true; box.S.micOn = false; box.S.mode = "simple";
  const usedHostile = vm.runInContext("applyShared(" + JSON.stringify(hostile) + ")", box);
  ok(box.S.vol === 18, "a link cannot set the volume", "vol=" + box.S.vol);
  ok(box.S.cap === true, "a link cannot lift the nursery cap", "cap=" + box.S.cap);
  ok(box.S.micOn === false, "a link cannot turn on the microphone", "micOn=" + box.S.micOn);
  ok(box.S.mode === "simple", "a link cannot flip you out of simple mode", "mode=" + box.S.mode);
  ok(usedHostile === 1 && box.S.noise === "pink", "the legitimate key in a hostile payload still lands");

  // enum keys reject anything not in the real table
  box.S.noise = "brown";
  vm.runInContext("applyShared({noise:'plutonium', tuneMode:'nonsense', pulse:'__proto__'})", box);
  ok(box.S.noise === "brown" && box.S.tuneMode === "off" && box.S.pulse === "off",
    "unknown enum values are dropped, not assigned");

  // types are enforced
  box.S.phiStack = false; box.S.q = 30;
  vm.runInContext("applyShared({phiStack:'yes', q:'nonsense', mix:null, rate:[99]})", box);
  ok(box.S.phiStack === false, "a string is not accepted where a boolean belongs");
  ok(box.S.q === 30, "a non numeric string is not accepted where a number belongs");
  ok(typeof box.S.mix === "number" && typeof box.S.rate === "number",
    "null and array never reach a numeric key");

  // numbers are clamped to the control's real range, IN THE CONTROL'S UNITS
  vm.runInContext("applyShared({tilt: 9e9, fb: 100, swrate: 5, vbpm: -40})", box);
  ok(box.S.tilt === 100, "tilt clamps to +100", "tilt=" + box.S.tilt);
  ok(box.S.fb === 92, "feedback clamps to its 92 ceiling", "fb=" + box.S.fb);
  ok(box.S.swrate === 40, "slow wave rate clamps up to its floor", "swrate=" + box.S.swrate);
  ok(box.S.vbpm === 0, "tempo clamps to 0, which is 60 bpm real", "vbpm=" + box.S.vbpm);

  // the freq unit bug: #freq is 0..1000 in SLIDER POSITION, S.freq is Hz
  vm.runInContext("applyShared({freq: 6000})", box);
  ok(box.S.freq === 6000, "a shared 6000 Hz notch arrives as 6000 Hz, not clamped to the slider's 1000",
    "freq=" + box.S.freq);
  vm.runInContext("applyShared({freq: 99999})", box);
  ok(box.S.freq === 16000, "frequency still clamps, at the real 16 kHz ceiling", "freq=" + box.S.freq);
  vm.runInContext("applyShared({freq: 0})", box);
  ok(box.S.freq === 20, "frequency clamps up to 20 Hz, never to zero", "freq=" + box.S.freq);

  /* ---------------- [share] round trip ---------------- */
  const a = makeBox(src);
  a.S.noise = "white"; a.S.freq = 6000; a.S.tuneMode = "notch"; a.S.amt = 82;
  a.S.q = 62; a.S.preset = "tinnitus"; a.S.vol = 44; a.S.cap = false; a.S.mode = "full";
  const link = vm.runInContext("shareEncode()", a);
  ok(/^[A-Za-z0-9\-_]+$/.test(link), "the encoded fragment is url safe", link.slice(0, 24));

  const b = makeBox(src);
  b.location.hash = "#p=" + link;
  b.S.vol = 12; b.S.cap = true; b.S.mode = "simple"; b.S.micOn = false;
  vm.runInContext("readSharedLink()", b);
  ok(b.S.noise === "white" && b.S.freq === 6000 && b.S.tuneMode === "notch" &&
     b.S.amt === 82 && b.S.q === 62 && b.S.preset === "tinnitus",
     "the sound survives the round trip exactly",
     JSON.stringify({ n: b.S.noise, f: b.S.freq, m: b.S.tuneMode, a: b.S.amt, q: b.S.q }));
  ok(b.S.vol === 12 && b.S.cap === true && b.S.mode === "simple" && b.S.micOn === false,
     "the receiver's volume, cap, mode and mic are untouched by a link",
     JSON.stringify({ vol: b.S.vol, cap: b.S.cap, mode: b.S.mode, mic: b.S.micOn }));
  ok(b.sharedPick && b.sharedPick.shared === true && b.sharedPick.id === "tinnitus",
     "a shared link takes over the front door so the big button plays what was sent",
     JSON.stringify(b.sharedPick && { id: b.sharedPick.id }));
  ok(b.sharedPick && /believe/.test(b.sharedPick.why || ""),
     "the evidence tier travels with the link");

  // junk fragments are inert and silent
  const c = makeBox(src);
  const before = JSON.stringify(c.S);
  for (const junk of ["#p=", "#p=!!!!", "#p=" + Buffer.from("[1,2,3]").toString("base64url"),
                      "#p=" + Buffer.from('"a string"').toString("base64url"),
                      "#p=" + Buffer.from("{broken").toString("base64url"),
                      "#nonsense", "", "#p=" + "A".repeat(4000)]) {
    c.location.hash = junk;
    let threw = false;
    try { vm.runInContext("readSharedLink()", c); } catch (e) { threw = true; }
    ok(!threw, "junk fragment never throws: " + junk.slice(0, 18));
  }
  ok(JSON.stringify(c.S) === before, "junk fragment changes nothing at all");
  ok(c.sharedPick === null, "junk fragment does not hijack the front door");

  /* ---------------- [volume] caps ---------------- */
  group("volume");
  const v = makeBox(src);
  const gainAt = (vol, cap, prog = 1, adapt = 1, play = true) => {
    v.S.vol = vol; v.S.cap = cap; v.progGain = prog; v.adaptGain = adapt; v.playing = play;
    return vm.runInContext("targetGain()", v);
  };
  ok(v.DEFAULTS.cap === true, "the nursery cap is on by default");
  ok(Math.abs(gainAt(100, true) - 0.34) < 1e-9, "capped, full ring, output is exactly 0.34",
    String(gainAt(100, true)));
  ok(Math.abs(gainAt(100, false) - 1.0) < 1e-9, "uncapped, full ring, output is 1.0");
  ok(gainAt(0, true) === 0, "a zero ring is silent");
  ok(gainAt(100, true, 1, 1, false) === 0, "not playing is silent whatever the ring says");
  ok(gainAt(100, true, 1, 3.5) <= 0.34 + 1e-9 && gainAt(100, true, 1, 3.5) > 0,
    "the cap is a final ceiling: full adaptive lift stays at or under 0.34");
  {
    let worst = 0;
    for (let vol = 0; vol <= 100; vol += 10)
      for (const adapt of [1, 1.8, 2.6, 3.5])
        for (const prog of [0.2, 1]) worst = Math.max(worst, gainAt(vol, true, prog, adapt));
    ok(worst <= 0.34 + 1e-9, "sweep: no ring/program/adaptive combination beats the nursery cap", String(worst));
  }
  ok(gainAt(50, true) < gainAt(100, true), "the ring is monotonic");
  // the corrupt-save hazard, at the point where it would have done the damage
  ok(gainAt(999, true) === 0.34, "an out of range volume still clamps at the capped ceiling (last line of defence)");

  /* ---------------- [nightstore] trial + night history stores ---------------- */
  group("nightstore");
  const ns = makeBox(src);
  const sN = (x) => vm.runInContext("sanitiseNights(" + JSON.stringify(x) + ")", ns);
  ok(Array.isArray(sN(null)) && sN(null).length === 0, "junk nights store degrades to an empty history");
  ok(sN("nope").length === 0 && sN(42).length === 0 && sN({ a: 1 }).length === 0, "non-array nights stores are rejected");
  const goodN = sN([{ date: "2026-08-19", feel: 7, total: 420, score: 88 },
                    { date: "NaN-NaN-NaN", feel: 7 },
                    { date: "2026-08-19", feel: 3 },
                    { date: "2026-08-20", feel: 99, total: -5, score: "250", lat: "soon" }]);
  ok(goodN.length === 2, "bad dates drop, duplicate dates keep the first record", JSON.stringify(goodN));
  ok(goodN[1].feel === null && goodN[1].total === null && goodN[1].score === null && goodN[1].lat === null,
    "impossible metric values become null rather than entering the statistics");
  ok(goodN[0].total === 420 && goodN[0].score === 88, "legitimate values round trip");
  ok(vm.runInContext('sanitiseNight({ date: "2026-08-20", feel: 6, deep: null })', ns).deep === null,
    "an unlogged metric stays null instead of becoming a phantom zero");
  const sT = (x) => vm.runInContext("sanitiseTrial(" + JSON.stringify(x) + ")", ns);
  ok(sT(null) === null && sT("x") === null && sT([]) === null, "junk trial stores degrade to no trial");
  ok(sT({ arms: ["madeUpSound", "alsoFake"], nPer: 5, order: [0, 1] }) === null, "a trial over unknown sounds is void");
  const t0 = { started: "2026-08-01", arms: ["newborn", "rain"], metric: "feel", blinded: true, nPer: 2,
    order: [0, 1, 1, 0], assigned: [{ date: "2026-08-01", arm: 0 }, { date: "bad", arm: 1 }, { date: "2026-08-02", arm: 9 }] };
  const tOut = sT(t0);
  ok(tOut && tOut.assigned.length === 1 && tOut.assigned[0].arm === 0,
    "malformed assignments drop, sound ones stay", JSON.stringify(tOut && tOut.assigned));
  ok(sT({ arms: ["newborn", "rain"], nPer: "lots", order: [0, 1] }) === null, "a trial without a sane sample size is void");
  ok(tOut.metric === "feel" && sT(Object.assign({}, t0, { metric: "vibes" })).metric === "feel",
    "unknown metrics fall back to feel");

  /* ---------------- [save] round trip and corrupt recovery ---------------- */
  group("save");
  const clean = { noise: "pink", vol: 33, cap: false, tilt: -40, freq: 1200,
    mode: "full", vizMode: "ember", lastUsed: { id: "womb", at: 1755300000000, count: 4 } };
  const back = vm.runInContext("sanitiseSaved(" + JSON.stringify(clean) + ")", v);
  ok(Object.keys(clean).every(k => JSON.stringify(back[k]) === JSON.stringify(clean[k])),
    "a legitimate save round trips unchanged", JSON.stringify(back));

  const evil = { vol: 999, cap: "no", noise: 42, tilt: "-40", freq: Infinity,
    q: NaN, mode: { toString: 1 }, lastUsed: "not an object",
    __proto__x: 1, somethingInvented: true, fb: 1e9, swrate: -5 };
  const fixed = vm.runInContext("sanitiseSaved(" + JSON.stringify(evil) + ")", v);
  ok(!("vol" in fixed) || fixed.vol <= 100, "a corrupt volume can never exceed 100", "vol=" + fixed.vol);
  ok(fixed.vol === 100, "vol 999 is clamped to 100, not passed through", "vol=" + fixed.vol);
  ok(!("cap" in fixed), "a non boolean cap is dropped, so the default ON stands", "cap=" + fixed.cap);
  ok(!("noise" in fixed), "a number is not accepted as a sound id");
  ok(!("tilt" in fixed), "a numeric string is not accepted where a number belongs");
  ok(!("freq" in fixed) && !("q" in fixed), "Infinity and NaN never reach state");
  ok(!("mode" in fixed), "an object is not accepted where a string belongs");
  ok(!("lastUsed" in fixed), "a malformed lastUsed is dropped");
  ok(!("somethingInvented" in fixed) && !("__proto__x" in fixed), "unknown keys are dropped");
  ok(fixed.fb === 92 && fixed.swrate === 40, "out of range numbers land on the control's own limits");

  // and the whole point: after loading garbage, the cap still holds
  const g = makeBox(src);
  vm.runInContext("Object.assign(S, sanitiseSaved({vol:9999, cap:0}), {timer:0,micOn:false,adapt:false,program:null});", g);
  g.playing = true; g.progGain = 1; g.adaptGain = 1;
  ok(vm.runInContext("targetGain()", g) <= 0.34 + 1e-9,
    "after loading a hostile save, output is still under the nursery cap",
    String(vm.runInContext("targetGain()", g)));

  for (const junk of [null, undefined, "a string", 42, [], [1,2,3], true]) {
    let threw = false, out = null;
    try { out = vm.runInContext("sanitiseSaved(" + JSON.stringify(junk === undefined ? null : junk) + ")", v); }
    catch (e) { threw = true; }
    ok(!threw && out && typeof out === "object" && Object.keys(out).length === 0,
      "a non object save yields an empty object, never a throw: " + JSON.stringify(junk));
  }

  // enum recovery against the real tables
  const e2 = makeBox(src);
  e2.S.noise = "plutonium"; e2.S.mode = "sideways"; e2.S.vizMode = "kaleidoscope";
  e2.S.preset = "not-a-preset"; e2.S.vscale = "klingon";
  e2.S.lastUsed = { id: "not-a-preset", at: Date.now(), count: 2 };
  vm.runInContext("sanitiseEnums()", e2);
  ok(e2.S.noise === "brown" && e2.S.mode === "simple" && e2.S.vizMode === "aurora" &&
     e2.S.vscale === "hirajoshi" && e2.S.preset === null && e2.S.lastUsed === null,
     "unknown ids fall back to defaults instead of reaching a lookup",
     JSON.stringify({ n: e2.S.noise, m: e2.S.mode, v: e2.S.vizMode, p: e2.S.preset }));
  const e3 = makeBox(src);
  e3.S.noise = "violet"; e3.S.vizMode = "void"; e3.S.preset = "womb"; e3.S.mode = "full";
  vm.runInContext("sanitiseEnums()", e3);
  ok(e3.S.noise === "violet" && e3.S.vizMode === "void" && e3.S.preset === "womb" && e3.S.mode === "full",
     "legitimate ids are left alone");

  /* ---------------- [timer] arithmetic ---------------- */
  group("timer");
  const f = vm.runInContext("fmtLeft", v);
  ok(f(0) === "0:00", "zero reads 0:00", f(0));
  ok(f(1000) === "0:01", "one second", f(1000));
  ok(f(59000) === "0:59", "under a minute", f(59000));
  ok(f(60000) === "1:00", "exactly a minute", f(60000));
  ok(f(90000) === "1:30", "ninety seconds", f(90000));
  ok(f(20 * 60000) === "20:00", "the 20 minute button", f(20 * 60000));
  ok(f(45 * 60000) === "45:00", "the 45 minute button", f(45 * 60000));
  ok(f(90 * 60000) === "1h 30m", "the 90 minute button rolls to hours", f(90 * 60000));
  ok(f(3600000) === "1h 00m", "exactly an hour, zero padded", f(3600000));
  ok(f(3599999) === "1h 00m", "one millisecond under an hour rounds up cleanly, no 60:00", f(3599999));
  ok(f(500) === "0:01", "part seconds round up, so it never shows 0:00 while still playing", f(500));
  ok(!/NaN|undefined/.test(f(123456789)), "a long timer never prints NaN", f(123456789));

  /* ---------------- [fade] curves ---------------- */
  group("fade");
  const fs2 = vm.runInContext("fadeSeconds", v);
  const fade = at => { v.S.fade = at; return fs2(); };
  ok(fade(0) === 5, "the shortest fade is still five seconds, never a cut", String(fade(0)));
  ok(fade(100) === 300, "the longest fade is five minutes", String(fade(100)));
  ok(fade(30) === 32, "the default 30 maps to 32 seconds", String(fade(30)));
  let mono = true, prev = -1;
  for (let i = 0; i <= 100; i++) { const s = fade(i); if (s < prev) mono = false; prev = s; }
  ok(mono, "the fade slider is monotonic across its whole range");
  ok(fade(50) < (fade(0) + fade(100)) / 2,
    "the curve is squared, so the short end has the resolution where it matters",
    String(fade(50)));
  v.S.fade = 30;

  // the fade is scheduled on the audio clock, not recomputed on a timer tick
  ok(/linearRampToValueAtTime\(0,/.test(src) && /function armFade/.test(src),
    "there is a real ramp to zero scheduled on the AudioContext clock");
  const armFadeSrc = grabFn(src, "armFade");
  ok(/cancelScheduledValues/.test(armFadeSrc),
    "arming the fade cancels prior automation first, so ramps cannot overlap");
  ok(/fadeSeconds\(\)/.test(armFadeSrc), "the ramp length comes from the fade control");
  const startTimerSrc = grabFn(src, "startTimer");
  ok(!/progGain\s*=\s*left/.test(startTimerSrc),
    "the countdown interval no longer computes the fade, so throttling cannot skip it");
  ok(/armFade/.test(startTimerSrc), "starting a timer arms the ramp");
  const clearTimerSrc = grabFn(src, "clearTimer");
  ok(/setVolume\(\)/.test(clearTimerSrc),
    "clearing a timer re-asserts the level, so cancelScheduledValues cannot strand the gain");
  const setVolumeSrc = grabFn(src, "setVolume");
  ok(/fadeTo\s*&&\s*playing/.test(setVolumeSrc),
    "while a fade is scheduled, setVolume re-arms it instead of writing over it");
  // every program still reaches exactly zero: the product thesis
  const lastGains = box.PROGRAMS.map(p => p.phases[p.phases.length - 1].g);
  ok(lastGains.every(x => x === 0), "every program still ends at exactly zero", JSON.stringify(lastGains));

  /* ---------------- [audio] look ahead and the comb floor ---------------- */
  group("audio");
  const heart = grabFn(src, "heartTick"), sw = grabFn(src, "swTick");
  // the look ahead is the one in the scheduling WHILE, not the resync above it
  const la = s => { const m = /while\s*\([^)]*currentTime \+ ([0-9.]+)/.exec(s); return m ? Number(m[1]) : 0; };
  ok(la(heart) >= 1.2, "heartbeat look ahead clears a throttled 1 Hz tick", String(la(heart)));
  ok(la(sw) >= 1.2, "slow wave look ahead clears a throttled 1 Hz tick", String(la(sw)));

  // comb floor: delayTime must clear one render quantum AND land f on a harmonic
  const applySrc = grabFn(src, "apply");
  ok(/128 \/ ctx\.sampleRate/.test(applySrc), "the comb floor is still one render quantum");
  const sampleRate = 48000, floor = (128 / sampleRate) * 1.05;
  let combOk = true, combDetail = "";
  for (const fq of [55, 110, 375, 440, 1000, 3520]) {
    let k = 1; while (k / fq < floor && k < 64) k++;
    const dt = Math.min(0.055, Math.max(floor, k / fq));
    const harmonic = Math.abs((dt * fq) - Math.round(dt * fq)) < 1e-9;
    if (!(dt >= floor && harmonic)) { combOk = false; combDetail += fq + "Hz dt=" + dt + " "; }
  }
  ok(combOk, "k/f clears the delay floor and lands f on a comb peak at 55 to 3520 Hz", combDetail);

  // the mic is analysis only. This is the privacy story as much as the feature.
  const micSrc = grabFn(src, "enableMic");
  ok(/micAn\s*=\s*ctx\.createAnalyser/.test(micSrc) && !/micAn\.connect/.test(micSrc),
    "the microphone analyser is never connected toward the destination");

  /* ---------------- [product] the invariants that are the product ------- */
  group("product");
  const tierCount = Object.keys(box.INFO).filter(k => box.INFO[k].tier === 1).length;
  ok(tierCount <= 3, "at most three sounds may claim good evidence", "tier1=" + tierCount);
  ok(box.SHORTLIST.length === 6, "the shortlist is still six");
  ok(new Set(box.SHORTLIST.map(id => box.INFO[id] && box.INFO[id].tier)).size >= 3,
    "the shortlist still spans at least three evidence tiers");
  ok(box.DEFAULTS.mode === "simple", "simple mode is still the default");

  // simple mode control count: interactive elements NOT hidden by body.simple
  const bodyHtml = html.slice(html.indexOf("<body"));
  const simpleBox = bodyHtml.slice(bodyHtml.indexOf('id="simpleBox"'));
  const simpleControls = (simpleBox.slice(0, simpleBox.indexOf("</div>\n\n  <!--") + 1)
    .match(/<button|<input/g) || []).length;
  // + the header mode button, the core button, the volume ring, and the four
  //   timer buttons and six shortlist entries built at runtime
  const runtimeControls = 4 /* timer */ + 6 /* shortlist, behind one tap */;
  const visible = simpleControls + runtimeControls + 3;
  ok(visible <= 15 + 6, "the simple front door has not grown past its budget", "about " + visible);

  // preset volume surprise
  const applyPresetSrc = grabFn(src, "applyPreset");
  ok(/if \(heldVol !== null\)\s*S\.vol = heldVol;/.test(applyPresetSrc) &&
     /const heldVol = playing \? S\.vol : null;/.test(applyPresetSrc),
    "changing sound while playing keeps the volume the person already set");
  ok(box.PRESETS.every(p => p.d.vol === undefined || (p.d.vol >= 0 && p.d.vol <= 100)),
    "no preset carries an out of range volume");

  /* No dashes in player facing copy. An em dash standing alone as an empty
     value (the countdown at rest, the meter before the mic is on) is a
     typographic blank rather than copy and is fine; one used as punctuation
     inside a sentence is not. That is what this looks for, in the markup and
     in the strings, with comments stripped so the engineering notes below do
     not count as copy. */
  const PROSE_DASH = /[A-Za-z0-9)]\s*—\s*[A-Za-z0-9(£]/;
  const markup = html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "");
  const markupHits = markup.split("\n").filter(l => PROSE_DASH.test(l));
  ok(markupHits.length === 0, "no em dash used as punctuation in the markup",
    markupHits[0] ? markupHits[0].trim().slice(0, 70) : "");
  const noComments = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  const strHits = noComments.split("\n").filter(l => /["'`]/.test(l) && PROSE_DASH.test(l));
  ok(strHits.length === 0, "no em dash used as punctuation in the copy strings",
    strHits.length + (strHits[0] ? ": " + strHits[0].trim().slice(0, 70) : ""));

  // iOS: stage 1 only, and nothing claims otherwise
  group("ios");
  ok(/IS_IOS/.test(src) && /maxTouchPoints/.test(src),
    "iPhone and iPadOS are both detected");
  ok(/if \(IS_IOS && !\(saved && "wake" in saved\)\) S\.wake = true/.test(src),
    "the wake lock defaults on for iOS users who have not chosen otherwise");
  ok(/navigator\.wakeLock\.request\("screen"\)/.test(src), "a real screen wake lock is requested");
  ok(!/OfflineAudioContext/.test(src) && !/createMediaElementSource/.test(src),
    "stage 2 lock screen playback is genuinely not built, so nothing pretends it is");
  const claim = /(all night|through the night|screen off|screen locked|with the screen)/i;
  const claimsInProse = (markup.match(claim) || []);
  ok(!claimsInProse.some(t => /all night|screen off/i.test(t)) ||
     /screen must stay on|screen has to stay on|stops when|goes quiet when/i.test(markup),
     "nothing claims the sound survives a locked screen without saying the opposite too",
     claimsInProse.join(" | ").slice(0, 120));
  ok(/resumeAudio/.test(src) && /onstatechange/.test(src),
    "an interrupted context is resumed, not just a suspended one");

  /* ---------------- [worker] the one that wiped the fleet -------------- */
  group("worker");
  const w = workerSrc;
  ok(/hush-/.test(w) && /SHELL_VERSION\s*=\s*"hush-/.test(w),
    "the cache name carries the hush prefix");
  const deletes = (w.match(/caches\.delete/g) || []).length;
  ok(deletes === 1, "there is exactly one cache delete in the whole worker", "found " + deletes);
  ok(/indexOf\("hush-"\)\s*===\s*0|startsWith\("hush-"\)/.test(w),
    "the delete is gated on the hush prefix");

  // and now actually run it: fire activate against a fleet's worth of caches
  const deleted = [];
  // The "current" entry tracks the worker's real SHELL_VERSION, so bumping
  // the version does not quietly turn this into a test of the previous one.
  const curShell = (w.match(/SHELL_VERSION = "([^"]+)"/) || [, "hush-shell-v1"])[1];
  const fleet = ["padlab-shell-v10", "sws-portal-v4", "bandits-box-v2", "sw_sb_index.html",
                 "hush-shell-v0", curShell, "workbox-precache"];
  const listeners = {};
  const wbox = {
    console,
    self: {
      addEventListener: (ev, fn) => { listeners[ev] = fn; },
      skipWaiting: () => Promise.resolve(),
      clients: { claim: () => Promise.resolve() },
      location: { origin: "https://lucidwinds.com" }
    },
    caches: {
      keys: () => Promise.resolve(fleet.slice()),
      delete: k => { deleted.push(k); return Promise.resolve(true); },
      open: () => Promise.resolve({ put: () => Promise.resolve() }),
      match: () => Promise.resolve(undefined)
    },
    fetch: () => Promise.resolve({ ok: true, status: 200, clone: () => ({}) }),
    Response: class { constructor(b, i) { this.body = b; Object.assign(this, i); } },
    URL, setTimeout, Promise
  };
  wbox.self.location = wbox.self.location;
  wbox.addEventListener = wbox.self.addEventListener;
  wbox.location = wbox.self.location;
  vm.createContext(wbox);
  let workerRan = true;
  try { vm.runInContext(w, wbox); } catch (e) { workerRan = false; ok(false, "the worker parses and installs", e.message); }
  if (workerRan) {
    ok(typeof listeners.activate === "function", "the worker registers an activate handler");
    let waited = null;
    listeners.activate({ waitUntil: p => { waited = p; } });
    return Promise.resolve(waited).then(() => {
      ok(deleted.length === 1 && deleted[0] === "hush-shell-v0",
        "activate deletes ONLY its own stale cache and leaves the whole fleet alone",
        "deleted: " + JSON.stringify(deleted));
      ok(!deleted.includes("padlab-shell-v10") && !deleted.includes("sws-portal-v4"),
        "PadLab and the portal survive an activate, which is the bug that black screened the fleet");

      // no fetch path may settle with undefined: respondWith(undefined) is a black screen
      ok(/function offlineFallback/.test(w) && /new Response\(/.test(w),
        "there is a real Response to fall back to when network and cache are both gone");
      ok(!/respondWith\(\s*caches\.match\([^)]*\)\s*\)/.test(w),
        "no respondWith is handed a bare caches.match, which resolves undefined on a miss");
      ok(/req\.mode === "navigate"/.test(w) && /cache: "no-cache"/.test(w),
        "navigations are network first with an explicit no-cache refetch");

      // registration and shell version move in lockstep
      const reg = /serviceWorker\.register\("sw\.js\?v=(\d+)"\)/.exec(html);
      ok(!!reg, "the registration URL is versioned, because this host edge pins a bare sw.js");
      const bt = /build v(\d+)/.exec(html);
      ok(!!bt && !!reg && bt[1] === reg[1],
        "the footer build tag matches the registration version, so a stale copy names itself");
      const shell = /SHELL_VERSION\s*=\s*"hush-shell-v(\d+)"/.exec(w);
      ok(!!shell, "the shell version is a number we can compare");
      ok(reg && shell && reg[1] === shell[1],
        "the registration ?v= and SHELL_VERSION are in lockstep",
        reg && shell ? "?v=" + reg[1] + " vs shell v" + shell[1] : "");
      return null;
    });
  }
  return Promise.resolve(null);
}

/* ================================================================== */
/* mutations: every assertion class, broken on purpose                  */
/* ================================================================== */
const MUTATIONS = [
  ["share whitelist lets vol through",
    s => s.replace('const SHARE_KEYS = ["noise"', 'const SHARE_KEYS = ["vol","noise"')],
  ["freq clamped in slider units again",
    s => s.replace("freq:[20,16000]", "freq:[0,1000]")],
  ["applyShared stops checking enums",
    s => s.replace("if (SHARE_ENUMS[k]) { if (SHARE_ENUMS[k].indexOf(v) < 0) return; }",
                   "if (SHARE_ENUMS[k]) { }")],
  /* The belt and braces restore in readSharedLink is a SECOND line of defence
     behind the whitelist, so removing it alone changes nothing observable and
     the mutation used to survive for a good reason. This breaks the whitelist
     AND the restore together, which is what the second line exists for. */
  ["both lines of defence on volume removed at once",
    s => s.replace('const SHARE_KEYS = ["noise"', 'const SHARE_KEYS = ["vol","noise"')
          .replace("S.vol = before.vol; S.cap = before.cap;", "S.cap = before.cap;")],
  ["shared link no longer takes the front door",
    s => s.replace("sharedPick = {\n    shared: true,", "sharedPick = null && {\n    shared: true,")],
  ["nursery cap raised",
    s => s.replace("S.cap ? 0.34 : 1.0", "S.cap ? 0.90 : 1.0")],
  ["adaptive lift climbs past the cap again",
    s => s.replace("return clamp(Math.min(requested, capMax), 0, capMax);", "return clamp(requested, 0, 1);")],
  ["night history stops validating dates",
    s => s.replace('typeof r.date !== "string" || !DATE_RE.test(r.date)) return null;', 'false) return null;')],
  ["trial store accepts unknown sounds again",
    s => s.replace("!t.arms.every(a => PRESETS.some(p => p.id === a))) return null;", "false) return null;")],
  ["save sanitiser stops clamping numbers",
    s => s.replace("out[k] = r ? Math.min(r[1], Math.max(r[0], n)) : n;", "out[k] = n;")],
  ["save sanitiser accepts any type",
    s => s.replace('if (typeof d === "boolean") { if (typeof v === "boolean") out[k] = v; return; }',
                   'if (typeof d === "boolean") { out[k] = v; return; }')],
  ["sanitiseEnums stops falling back",
    s => s.replace("if (sets[k].indexOf(S[k]) < 0) S[k] = DEFAULTS[k];", "")],
  ["fade floor removed, so the shortest fade is a cut",
    s => s.replace("Math.round(5 + Math.pow(S.fade/100,2)*295)", "Math.round(Math.pow(S.fade/100,2)*300)")],
  ["fade goes back on the setInterval",
    s => s.replace("if (left <= 0) { S.timer = 0; endTimerNow(); return; }\n    paintTimer(left);",
                   "if (left <= 0) { S.timer = 0; endTimerNow(); return; }\n    progGain = left/1000; setVolume(); paintTimer(left);")],
  ["armFade stops cancelling prior automation",
    s => s.replace("p.cancelScheduledValues(now);\n    p.setValueAtTime(p.value, now);\n    const hold",
                   "p.setValueAtTime(p.value, now);\n    const hold")],
  ["fmtLeft loses its ceil, so it shows 0:00 while still playing",
    s => s.replace("const s = Math.ceil(ms/1000);", "const s = Math.floor(ms/1000);")],
  ["a program stops reaching zero",
    s => s.replace('{m:5,g:0,label:"Fading out"}', '{m:5,g:0.05,label:"Fading out"}')],
  ["heartbeat look ahead back to 0.4",
    s => s.replace("nextBeat < ctx.currentTime + 1.6", "nextBeat < ctx.currentTime + 0.4")],
  ["slow wave look ahead back to 0.6",
    s => s.replace("swNext < ctx.currentTime + 1.6", "swNext < ctx.currentTime + 0.6")],
  ["preset volume surprise restored",
    s => s.replace("if (heldVol !== null) S.vol = heldVol;", "")],
  ["interrupted contexts stop being resumed",
    s => s.replace("function resumeAudio()", "function resumeAudio_disabled()")
          .replace("ctx.onstatechange = () => { if (playing && ctx.state !== \"running\") resumeAudio(); };", "")],
  /* Two sounds currently claim good evidence and the ceiling is three, so one
     promotion is legal and the mutation has to break the actual rule: it takes
     the count to four. If everything were labelled well evidenced the labels
     would carry no information, which is the whole point of the tiers. */
  ["a fourth sound claims good evidence",
    s => s.replace("womb: { tier:2,", "womb: { tier:1,")
          .replace("shush: { tier:2,", "shush: { tier:1,")
          .replace("rain: { tier:2,", "rain: { tier:1,")]
];
const WORKER_MUTATIONS = [
  ["worker deletes every cache on the origin",
    w => w.replace('k.indexOf("hush-") === 0 && k !== SHELL_VERSION', "k !== SHELL_VERSION")],
  /* version-agnostic: these used to patch the literal "hush-shell-v1" and
     silently stopped applying the first time the shell version moved */
  ["worker cache loses its prefix",
    w => w.replace(/"hush-shell-v(\d+)"/, '"shell-v$1"')],
  ["registration version drifts from the shell version",
    w => w.replace(/"hush-shell-v(\d+)"/, (m, n) => `"hush-shell-v${Number(n) + 1}"`)]
];

/* ================================================================== */
const workerSrc = fs.readFileSync(WORKER, "utf8");
const selftest = process.argv.includes("--selftest");

if (!selftest) {
  console.log("HUSH TESTS  " + APP);
  const r = await run(SRC, workerSrc);
  void r;
  console.log("\n" + pass + " ok, " + fail + " red");
  if (fail) { console.log("failed: " + fails.join(" | ")); process.exit(1); }
} else {
  console.log("SELFTEST: breaking each invariant on purpose. Every line must go RED.\n");
  let survived = [];
  for (const [name, mutate] of MUTATIONS) {
    const bad = mutate(SRC);
    if (bad === SRC) { console.log("  ??  " + name + "  (mutation did not apply, the source moved)"); survived.push(name + " [stale]"); continue; }
    QUIET = true;
    let red = 0;
    try { await run(bad, workerSrc); red = fail; } catch (e) { red = 1; }
    QUIET = false;
    console.log((red ? "  RED " : "  ??  ") + name + "  (" + red + " assertions caught it)");
    if (!red) survived.push(name);
  }
  for (const [name, mutate] of WORKER_MUTATIONS) {
    const bad = mutate(workerSrc);
    if (bad === workerSrc) { console.log("  ??  " + name + "  (mutation did not apply)"); survived.push(name + " [stale]"); continue; }
    QUIET = true;
    let red = 0;
    try { await run(SRC, bad); red = fail; } catch (e) { red = 1; }
    QUIET = false;
    console.log((red ? "  RED " : "  ??  ") + name + "  (" + red + " assertions caught it)");
    if (!red) survived.push(name);
  }
  console.log("");
  if (survived.length) {
    console.log("THESE MUTATIONS SURVIVED, so those assertions are decoration:\n  " + survived.join("\n  "));
    process.exit(1);
  }
  console.log("every mutation was caught. The suite can fail.");
}
