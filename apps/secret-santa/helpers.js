// Secret Santa — pure draw logic. Tested in test/helpers.test.mjs.

export const NAME_MAX = 40;   // one line of a roster
export const ROSTER_MAX = 200; // 60 used to be the cap; 200 draws in a few ms

/* parseRoster reports what it had to throw away. parseNames is the same thing
   with the report dropped, kept because the whole app used to call it. */
export function parseRoster(text) {
  const empty = { names: [], merged: [], shortened: [], skipped: 0 };
  if (typeof text !== 'string') return empty;
  const seen = new Map();          // lowercase key → display name kept
  const names = [];
  const merged = [];               // names a second line collapsed into
  const shortened = [];            // names cut at NAME_MAX
  let skipped = 0;                 // lines past the cap
  for (const raw of text.split(/\r?\n/)) {
    const full = raw.trim();
    if (!full) continue;
    const name = full.slice(0, NAME_MAX);
    const key = name.toLowerCase();
    if (seen.has(key)) {
      const kept = seen.get(key);
      if (!merged.includes(kept)) merged.push(kept);
      continue;
    }
    if (names.length >= ROSTER_MAX) { skipped++; continue; }
    if (full.length > NAME_MAX && !shortened.includes(name)) shortened.push(name);
    seen.set(key, name);
    names.push(name);
  }
  return { names, merged, shortened, skipped };
}

export function parseNames(text) {
  return parseRoster(text).names;
}

/* exclusions: array of [i, j] index pairs that may not draw each other
   (either direction — typically couples). Returns assignment array where
   result[i] = index that person i gives to, or null if impossible. */
export function drawNames(names, exclusions, rng) {
  const n = names.length;
  if (n < 2) return null;
  const rnd = rng || Math.random;
  const ok = allowed(n, exclusions);

  /* Fast path: a shuffle is a uniform draw and almost always lands first try. */
  for (let attempt = 0; attempt < 300; attempt++) {
    const receivers = [...Array(n).keys()];
    for (let i = receivers.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [receivers[i], receivers[j]] = [receivers[j], receivers[i]];
    }
    if (receivers.every((r, giver) => ok(giver, r))) return receivers;
  }
  /* Tightly constrained but still solvable configurations can defeat shuffling
     for any number of attempts, and "impossible" is a lie the organizer cannot
     check. So the answer comes from an exact bipartite matching instead: a
     perfect matching of givers to receivers IS a valid assignment, and its
     absence is a proof of impossibility rather than a guess. */
  return matchAssignment(n, ok, rnd);
}

/**
 * Re-draw while keeping as many of yesterday's matches as the rules allow.
 *
 * `keep[i]` is the receiver person i had in the previous draw, or -1 if they
 * are new or their old match has left. Adding one latecomer to a nine-person
 * exchange then changes one or two links instead of all nine, which is the
 * whole difference between "add a name" and "re-run the exchange".
 */
export function redrawKeeping(n, exclusions, keep, rng) {
  if (n < 2) return null;
  return matchAssignment(n, allowed(n, exclusions), rng || Math.random, keep);
}

/** true when a valid draw exists at all — exact, not a guess. */
export function drawPossible(n, exclusions) {
  if (n < 2) return false;
  return matchAssignment(n, allowed(n, exclusions), null) !== null;
}

/**
 * Which single no-match rule is making this draw impossible?
 * Drops one pair at a time and asks whether the rest can be satisfied.
 * Returns that [i, j] pair, or null when no single pair is to blame.
 */
export function blamePair(n, exclusions) {
  const pairs = (exclusions || []).filter((p) => Array.isArray(p) && p.length === 2);
  if (!pairs.length || drawPossible(n, pairs)) return null;
  for (let k = 0; k < pairs.length; k++) {
    const without = pairs.filter((_, i) => i !== k);
    if (drawPossible(n, without)) return pairs[k].slice();
  }
  return null;
}

function allowed(n, exclusions) {
  const banned = new Set();
  for (const [a, b] of exclusions || []) {
    banned.add(a + '>' + b);
    banned.add(b + '>' + a);
  }
  return (giver, receiver) => giver !== receiver && !banned.has(giver + '>' + receiver);
}

/* Kuhn's algorithm. Receiver order is shuffled when an rng is supplied so two
   runs of the same tight roster do not produce the same list every time.
   `keep` seeds the matching with the pairs a previous draw already had, and
   augmenting only disturbs them where it has no choice. */
function matchAssignment(n, ok, rnd, keep) {
  const order = [...Array(n).keys()];
  if (rnd) {
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
  }
  const giverOf = new Array(n).fill(-1);   // receiver → giver
  const settled = new Set();
  if (Array.isArray(keep)) {
    for (let g = 0; g < n; g++) {
      const r = keep[g];
      if (Number.isInteger(r) && r >= 0 && r < n && giverOf[r] === -1 && ok(g, r)) {
        giverOf[r] = g;
        settled.add(g);
      }
    }
  }
  const augment = (giver, seen) => {
    for (const r of order) {
      if (seen[r] || !ok(giver, r)) continue;
      seen[r] = true;
      if (giverOf[r] === -1 || augment(giverOf[r], seen)) { giverOf[r] = giver; return true; }
    }
    return false;
  };
  for (let g = 0; g < n; g++) {
    if (settled.has(g)) continue;
    if (!augment(g, new Array(n).fill(false))) return null;
  }
  const out = new Array(n);
  for (let r = 0; r < n; r++) out[giverOf[r]] = r;
  return out;
}

export function validAssignment(names, exclusions, assignment) {
  const n = names.length;
  if (!Array.isArray(assignment) || assignment.length !== n) return false;
  if (new Set(assignment).size !== n) return false;
  const banned = new Set();
  for (const [a, b] of exclusions || []) {
    banned.add(a + '>' + b);
    banned.add(b + '>' + a);
  }
  return assignment.every((r, g) =>
    Number.isInteger(r) && r >= 0 && r < n && r !== g && !banned.has(g + '>' + r));
}

/* Per-person reveal payload: only THEIR match, never the whole draw. */
export function encodeReveal(payload) {
  const json = JSON.stringify({
    s: payload.santa, g: payload.gets, e: payload.event || '', b: payload.budget || '',
  });
  return btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeReveal(hash) {
  try {
    let s = String(hash || '').replace(/^#r\./, '').replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const obj = JSON.parse(decodeURIComponent(escape(atob(s))));
    if (!obj || typeof obj.s !== 'string' || typeof obj.g !== 'string') return null;
    /* A payload that decodes to two empty strings is a truncated link, not a
       reveal — without this it produces a ceremony with nobody in it. */
    const santa = obj.s.trim().slice(0, NAME_MAX);
    const gets = obj.g.trim().slice(0, NAME_MAX);
    if (!santa || !gets) return null;
    return {
      santa, gets,
      event: String(obj.e || '').slice(0, 60), budget: String(obj.b || '').slice(0, 30),
    };
  } catch (e) { return null; }
}
export const isRevealHash = (hash) => /^#r\./.test(String(hash || ''));
