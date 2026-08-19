/* ═══════════════════════════════════════════════════════════════════════════
   GRADE SHEET, the arithmetic

   This file is the whole reason the app can be trusted, so it is pure: no DOM,
   no storage, no dates. Everything here is a function of its arguments, which
   is what lets test/grade.test.mjs pin all 79 cases.

   The rule that shapes every decision below: a gradebook that computes a grade
   wrong is worse than no gradebook at all, because a teacher will believe it,
   type the number into the district system, and a family will be told
   something false about their child. So where there was a choice between the
   convenient answer and the defensible one, this takes the defensible one and
   says why in a comment.

   Four ideas do most of the work:

     · Four states, never inferred from a value. An empty cell is not a zero.
       "missing" and a typed 0 produce the same number but are different facts,
       and "excused" leaves the denominator as well as the numerator.

     · Integer centipoints. Points are money-shaped: 2.25 + 1.75 + 4.5 must be
       exactly 8.5, and in binary floating point it is not.

     · Round once, at the very end, and take the letter from the number the
       teacher can actually see. Rounding twice moves real grades.

     · Never invent a number. A category with no graded work yet is `null`, not
       0, the difference between "we don't know" and "she scored nothing" is
       the difference between an A and an F in week two.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── units ──────────────────────────────────────────────────────────────────
   Every points value crosses into the engine through here. Working in integer
   centipoints means a term of quarter-points adds up exactly; working in
   floats means 0.1 + 0.2 = 0.30000000000000004 and a teacher eventually finds
   an 89.99999 sitting on a cutoff. */
export const CP = 100;
export const toCp = (x) => Math.round(Number(x) * CP);
export const fromCp = (n) => n / CP;

/* ── rounding ───────────────────────────────────────────────────────────────
   Half-up, the way people were taught, and the way a parent will do it on
   paper when they check. The naive `Math.round(x * 10**dp) / 10**dp` is wrong
   at exactly the values that matter: 1.005 → 1 and 8.575 → 8.57, because
   neither is representable and both land a hair below the midpoint.

   Shifting through the string form sidesteps that: the decimal exponent moves
   without a multiply, so the midpoint is still a midpoint when Math.round
   sees it. */
export function roundHalfUp(x, dp = 0) {
  if (x === null || x === undefined || !isFinite(x)) return x === null || x === undefined ? x : x;
  const s = x < 0 ? -1 : 1;
  const v = Math.abs(x);
  /* Guard: below this, toString() switches to exponential notation and the
     concatenation trick would build "1e-7e2". Such a value is zero for any
     grading purpose anyway. */
  if (v < 1e-9) return 0;
  const shifted = Number(v.toString() + 'e' + dp);
  return s * Number(Math.round(shifted).toString() + 'e-' + dp);
}

/* ── states ─────────────────────────────────────────────────────────────────
   The enum is explicit and stored. Nothing here ever guesses a state from the
   presence or absence of a number, because "she got zero" and "I haven't
   marked it yet" are the same empty cell to a spreadsheet and must never be
   the same thing here.

     ungraded  not marked yet.   out of both sums today; a zero in the forecast
     graded    points is real,   including a typed 0
     missing   not turned in.    zero on top, but the points still count below
     excused   does not apply.   out of the numerator AND the denominator

   `absent` and `late` are flags, not states. They record a fact about the
   child, attach to any state, and deliberately change no number, a teacher
   decides what absence means for a grade, not us. */
export const STATES = ['ungraded', 'graded', 'missing', 'excused'];

export function participation(row, includeUngraded) {
  const st = row.state || 'ungraded';
  if (st === 'excused') return null;                       // out of both sums
  if (st === 'ungraded') return includeUngraded ? { m: 0 } : null;
  if (st === 'missing') return { m: 0 };                   // denominator still counts
  return { m: toCp(row.points || 0) };                     // 'graded', including a real 0
}

/* Extra credit is points with no denominator. An assignment worth 0 points is
   treated as extra credit implicitly, there is no other coherent reading of
   "out of zero", and a teacher who types it means "bonus". */
export const isExtraCredit = (a) =>
  a.extraCredit === true || !(Number(a.pointsPossible) > 0);

const sum = (arr, f) => arr.reduce((n, x) => n + (typeof f === 'function' ? f(x) : x[f]), 0);

/* ── dropping the lowest ────────────────────────────────────────────────────
   The subtle one, and the one every naive gradebook gets wrong.

   "Drop the lowest" does not mean "drop the smallest raw score" and it does
   not mean "drop the worst percentage". It means: leave the student with the
   best grade obtainable by discarding k items. Those are three different
   answers.

     Beth: 80/100, 20/100, 1/20, drop 1
       drop smallest raw    → drops 1/20   → 100/200 = 50.0%
       drop worst percent   → drops 1/20   → 100/200 = 50.0%
       best for the student → drops 20/100 →  81/120 = 67.5%

   A 17-point difference, in the school's favour, silently. Worse, the naive
   rules can LOWER a grade by dropping (5/5 + 50/100 is 52.4%; drop the 5/5 and
   it is 50%), which means a teacher turns on a feature described as helping
   students and quietly hurts them.

   So this maximises (Σm + fixM) / (Σn + fixN) over subsets of a fixed size, a fractional program, solved exactly by Dinkelbach's method. Each round
   ranks items by (m − q·n) for the current best ratio q and keeps the top
   `keep`; the ratio rises monotonically and converges in a handful of passes.
   Exact, not greedy, and test 51 checks it against brute force on 4,000
   randomised categories. */
export function optimalKeep(droppable, keep, neverDrop = []) {
  if (keep >= droppable.length) return { kept: droppable.slice(), dropped: [] };
  if (keep <= 0) return { kept: [], dropped: droppable.slice() };

  const fixM = sum(neverDrop, 'm');
  const fixN = sum(neverDrop, 'pp');
  const ratio = (S) => {
    const d = sum(S, 'pp') + fixN;
    return d ? (sum(S, 'm') + fixM) / d : 0;
  };

  /* Ties are broken for display stability only, tied items have identical m
     and n so the ratio cannot move. Preferring the higher state rank means a
     `missing` is marked dropped before a projected ungraded zero, which keeps
     the SAME cell struck through in both the "so far" and "projected" views.
     A dropped mark that jumps between cells when you toggle the forecast looks
     like a bug even though the number is right. */
  const stateRank = (it) => (it.state === 'graded' ? 2 : it.state === 'ungraded' ? 1 : 0);
  const rankBy = (q) =>
    droppable
      .map((it, i) => ({ it, i }))
      .sort((a, b) => {
        const va = a.it.m - q * a.it.pp;
        const vb = b.it.m - q * b.it.pp;
        if (vb !== va) return vb - va;
        const ra = a.it.pp ? a.it.m / a.it.pp : 0;
        const rb = b.it.pp ? b.it.m / b.it.pp : 0;
        if (rb !== ra) return rb - ra;
        const sa = stateRank(a.it), sb = stateRank(b.it);
        if (sb !== sa) return sb - sa;
        return b.i - a.i;                       // drop the earliest of equals
      })
      .slice(0, keep)
      .map((x) => x.it);

  let S = rankBy(0);
  let q = ratio(S);
  for (let i = 0; i < 64; i++) {
    const S2 = rankBy(q);
    const q2 = ratio(S2);
    if (q2 <= q + 1e-12) { if (q2 >= q) S = S2; break; }
    S = S2; q = q2;
  }
  const keptSet = new Set(S);
  return { kept: S, dropped: droppable.filter((it) => !keptSet.has(it)) };
}

/* ── one category ───────────────────────────────────────────────────────────
   Returns pct: null, never 0, when there is nothing to divide by. That
   single choice is what stops "Tests are 40% and no test has happened" from
   reading as an F. */
export function categoryAggregate(items, rules = {}, includeUngraded = false) {
  const live = [];
  for (const it of items) {
    const p = participation(it, includeUngraded);
    if (!p) continue;
    live.push({
      ...it,
      m: p.m,
      pp: isExtraCredit(it) ? 0 : toCp(it.pointsPossible),
    });
  }

  const ec = live.filter(isExtraCredit);
  const scored = live.filter((it) => !isExtraCredit(it));
  const neverDrop = scored.filter((it) => it.neverDrop);
  const droppable = scored.filter((it) => !it.neverDrop);

  let kept = droppable, dropped = [];
  const k = Number(rules.dropLowest) || 0;
  if (k > 0 && droppable.length > 0) {
    /* Never empty a category. Dropping every quiz because the rule says "drop
       2" and there are 2 quizzes leaves nothing to divide by, and the student
       silently vanishes from the category rather than getting a good grade. */
    const keep = Math.max(1, droppable.length - k);
    ({ kept, dropped } = optimalKeep(droppable, keep, neverDrop));
  }

  const counted = kept.concat(neverDrop);
  const earned = sum(counted, 'm') + sum(ec, 'm');
  const possible = sum(counted, 'pp');
  const pct = possible > 0 ? (earned / possible) * 100 : null;

  return {
    earned: fromCp(earned),
    possible: fromCp(possible),
    pct,
    dropped,
    counted,
    extraCreditPoints: fromCp(sum(ec, 'm')),
    isActive: pct !== null,
  };
}

/* ── the whole class ────────────────────────────────────────────────────────
   Two models, because both are in wide use and a teacher who is forced into
   the wrong one will go back to her spreadsheet.

   The weighted branch always divides by W, the weight actually counted. When
   everything is active and the weights sum to 100 that is a no-op. When a
   category is empty it scales the rest up, which is what Canvas does and what
   teachers expect. When the teacher's weights sum to more than 100 it scales
   down, which Canvas does NOT do (its calculator only normalises when the
   total is under 100), so weights of 45/40/20 with scores 80/90/100 give
   Canvas 92.0 and give us 87.6. Ours is the defensible one: a 105-point scheme
   should not hand out 105 points of credit. The app blocks saving weights that
   do not total 100 anyway; this is the belt to that pair of braces. */
export function classGrade(cls, rows, includeUngraded = false) {
  const model = cls.model || 'total-points';

  if (model === 'total-points') {
    const agg = categoryAggregate(rows, { dropLowest: cls.dropLowest }, includeUngraded);
    return {
      raw: agg.pct,
      categories: [{ ...agg, cat: null }],
      W: agg.pct === null ? 0 : 100,
      inactive: [],
      dropped: agg.dropped,
    };
  }

  /* Course-scoped extra credit is in percentage points, not raw points: "two
     points on your final grade" is a different unit from "two points in the
     homework category", and conflating them is a silent 5% swing. */
  const courseEC = rows.filter((r) => r.extraCredit && r.ecScope === 'course');
  const courseSet = new Set(courseEC);

  const cats = (cls.categories || []).map((c) => {
    const mine = rows.filter((r) => r.categoryId === c.id && !courseSet.has(r));
    const agg = categoryAggregate(mine, { dropLowest: c.dropLowest }, includeUngraded);
    return { ...agg, cat: c };
  });

  const active = cats.filter((p) => p.pct !== null && Number(p.cat.weight) > 0);
  const W = sum(active, (p) => Number(p.cat.weight));

  let raw = W === 0 ? null : sum(active, (p) => p.pct * Number(p.cat.weight)) / W;

  if (raw !== null) {
    const ecPts = courseEC.reduce((n, r) => {
      const p = participation(r, includeUngraded);
      return n + (p ? p.m : 0);
    }, 0);
    raw += fromCp(ecPts);
  }

  /* Effective weight is what the category is ACTUALLY worth right now, which
     is the number the teacher needs to see when Tests hasn't happened yet. */
  for (const p of cats) {
    p.effectiveWeight = active.includes(p) ? (Number(p.cat.weight) / W) * 100 : 0;
  }

  return {
    raw,
    categories: cats,
    W,
    inactive: cats.filter((p) => !active.includes(p)).map((p) => p.cat.name),
    dropped: cats.flatMap((p) => p.dropped),
  };
}

/* ── the number she sees ────────────────────────────────────────────────────
   The letter comes from the DISPLAYED value, not the raw one. If the screen
   says 90 the letter must be an A, even though the raw was 89.5, a teacher
   cannot defend "it says 90 but it's a B" to a parent, and she is the one who
   has to have that conversation. */
export function letterFor(display, scale) {
  if (display === null || display === undefined) return null;
  if (!Array.isArray(scale) || !scale.length) return null;
  const bands = scale.slice().sort((a, b) => b.min - a.min);
  for (const b of bands) if (display >= b.min) return b.label;
  return bands[bands.length - 1].label;
}

export function finish(cls, raw) {
  if (raw === null || raw === undefined) return { raw: null, display: null, letter: null };
  const r = cls.capAt100 ? Math.min(100, raw) : raw;
  const dp = Number.isInteger(cls.dp) ? cls.dp : 1;
  const display = roundHalfUp(r, dp);
  return { raw: r, display, letter: letterFor(display, cls.scale) };
}

/* Both projections, always. The headline is what is graded so far; the forecast
   assumes nothing else is ever turned in. Showing the forecast as the headline
   would tell a child in week two that she has a 3%, which is true arithmetic
   and a lie about her situation. */
export function computeClass(cls, rows) {
  const so = classGrade(cls, rows, false);
  const pr = classGrade(cls, rows, true);
  return {
    soFar: { ...so, ...finish(cls, so.raw) },
    projected: { ...pr, ...finish(cls, pr.raw) },
  };
}

/* ── letter scales ──────────────────────────────────────────────────────────
   Rule 6 below is doing more work than it looks. Because `display` is a
   decimal rounded to dp places and a cutoff may carry no more than dp places,
   both are the nearest double to the same decimal, so `display >= cutoff` is
   exact. That single validation removes the whole epsilon-comparison bug class
   rather than papering over it with a tolerance. */
export const SCALES = {
  tenPoint: [
    { label: 'A', min: 90 }, { label: 'B', min: 80 }, { label: 'C', min: 70 },
    { label: 'D', min: 60 }, { label: 'F', min: 0 },
  ],
  plusMinus: [
    { label: 'A+', min: 97 }, { label: 'A', min: 93 }, { label: 'A-', min: 90 },
    { label: 'B+', min: 87 }, { label: 'B', min: 83 }, { label: 'B-', min: 80 },
    { label: 'C+', min: 77 }, { label: 'C', min: 73 }, { label: 'C-', min: 70 },
    { label: 'D+', min: 67 }, { label: 'D', min: 63 }, { label: 'D-', min: 60 },
    { label: 'F', min: 0 },
  ],
  roundedUp: [
    { label: 'A', min: 89.5 }, { label: 'B', min: 79.5 }, { label: 'C', min: 69.5 },
    { label: 'D', min: 59.5 }, { label: 'F', min: 0 },
  ],
  esn: [{ label: 'E', min: 90 }, { label: 'S', min: 70 }, { label: 'N', min: 50 }, { label: 'U', min: 0 }],
  levels4: [{ label: '4', min: 90 }, { label: '3', min: 80 }, { label: '2', min: 70 }, { label: '1', min: 0 }],
  passFail: [{ label: 'P', min: 60 }, { label: 'F', min: 0 }],
  none: [],
};

const decimals = (n) => {
  const s = String(n);
  const i = s.indexOf('.');
  return i === -1 ? 0 : s.length - i - 1;
};

export function validateScale(scale, dp = 1) {
  const errs = [];
  if (!Array.isArray(scale) || scale.length === 0) {
    return [{ row: -1, msg: 'A scale needs at least one band.' }];
  }
  const sorted = scale.slice().sort((a, b) => b.min - a.min);
  const seen = new Set();
  sorted.forEach((b, i) => {
    if (!b.label || !String(b.label).trim()) errs.push({ row: i, msg: 'Every band needs a name.' });
    const key = String(b.label).trim().toLowerCase();
    if (seen.has(key)) errs.push({ row: i, msg: `Two bands are both called “${b.label}”.` });
    seen.add(key);
    if (!(b.min >= 0 && b.min <= 100)) errs.push({ row: i, msg: 'A cutoff must be between 0 and 100.' });
    if (decimals(b.min) > dp) {
      errs.push({ row: i, msg: `${b.min} has more decimal places than this class shows. Show one decimal place, or use a rounder cutoff.` });
    }
    if (i > 0 && !(sorted[i - 1].min > b.min)) {
      errs.push({ row: i, msg: 'Each cutoff must be lower than the one above it.' });
    }
  });
  if (sorted[sorted.length - 1].min !== 0) {
    errs.push({ row: sorted.length - 1, msg: 'The lowest band must start at 0, so every grade lands somewhere.' });
  }
  return errs;
}

/* ── showing the work ───────────────────────────────────────────────────────
   Returns the literal arithmetic behind one student's number. This exists
   because the honest answer to "why is my child's grade an 88?" is the sum,
   and a teacher standing in a conference should be able to read it off the
   screen rather than defend a black box. Test 77 asserts the lines reproduce
   the returned value exactly. */
export function explain(cls, rows, includeUngraded = false) {
  const g = classGrade(cls, rows, includeUngraded);
  const dp = Number.isInteger(cls.dp) ? cls.dp : 1;
  const lines = [];
  const droppedSet = new Set(g.dropped);

  for (const p of g.categories) {
    if (p.cat) lines.push({ kind: 'cat', text: `${p.cat.name}, worth ${p.cat.weight}%` });
    for (const it of p.counted) {
      const st = it.state || 'ungraded';
      const val = st === 'missing' ? '0 (missing)' : st === 'ungraded' ? '0 (not turned in yet)' : String(fromCp(it.m));
      lines.push({ kind: 'item', text: `${it.name}: ${val} out of ${fromCp(it.pp)}` });
    }
    for (const it of p.dropped) {
      lines.push({ kind: 'dropped', text: `${it.name}: dropped (lowest)` });
    }
    for (const it of rows.filter((r) => (p.cat ? r.categoryId === p.cat.id : true) && r.state === 'excused')) {
      lines.push({ kind: 'excused', text: `${it.name}: excused, taken out of the total too` });
    }
    if (p.extraCreditPoints) lines.push({ kind: 'ec', text: `Extra credit: +${p.extraCreditPoints}` });
    lines.push({
      kind: 'subtotal',
      text: p.pct === null
        ? `${p.cat ? p.cat.name : 'Total'}: nothing graded yet, so it is not counted`
        : `${p.cat ? p.cat.name : 'Total'}: ${p.earned} out of ${p.possible} = ${roundHalfUp(p.pct, 2)}%`,
    });
  }

  if (cls.model === 'weighted-categories') {
    if (g.inactive.length) {
      lines.push({ kind: 'note', text: `Not counted yet: ${g.inactive.join(', ')}, nothing graded in there.` });
    }
    lines.push({ kind: 'note', text: `Counting ${g.W}% of the total weight, so the parts are scaled to fill it.` });
  }

  const f = finish(cls, g.raw);
  lines.push({
    kind: 'result',
    text: f.raw === null
      ? 'Nothing graded yet, so there is no grade to show.'
      : `${roundHalfUp(f.raw, 6)}% rounded to ${dp} decimal place${dp === 1 ? '' : 's'} = ${f.display}%${f.letter ? ` = ${f.letter}` : ''}`,
  });

  return { lines, ...f, W: g.W, inactive: g.inactive, droppedSet };
}
