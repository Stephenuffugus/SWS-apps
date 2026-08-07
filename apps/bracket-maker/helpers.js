// Bracket maker — pure single-elimination logic. Tested in test/helpers.test.mjs.
// State: { names: string[], picks: { "r-m": entrantIndex } }
// Round 0 pairs follow standard seeding (1v8, 4v5, 2v7, 3v6 …) so the top two
// seeds can only meet in the final; byes auto-advance.

export function nextPow2(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/* Standard bracket seed order (1-based seeds) for a power-of-2 size. */
export function seedOrder(size) {
  let order = [1];
  while (order.length < size) {
    const next = [];
    const s = order.length * 2;
    for (const x of order) next.push(x, s + 1 - x);
    order = next;
  }
  return order;
}

export function parseEntrants(text) {
  if (typeof text !== 'string') return [];
  return text.split(/\r?\n/).map(s => s.trim()).filter(Boolean).slice(0, 32)
    .map(s => s.slice(0, 40));
}

export function roundCount(n) {
  return Math.log2(nextPow2(Math.max(n, 2)));
}

/* Entrant index (or null for a bye) in a given round-0 slot. */
export function round0Slot(names, slot) {
  const seed = seedOrder(nextPow2(Math.max(names.length, 2)))[slot];
  return seed <= names.length ? seed - 1 : null;
}

/* Who stands in match m of round r on side 0/1 — resolved through picks and
   byes; null when not yet decided. */
export function contender(state, r, m, side) {
  if (r === 0) return round0Slot(state.names, m * 2 + side);
  return winnerOf(state, r - 1, m * 2 + side);
}

/* A side is a true bye only when its entire feeding subtree holds no entrants —
   "opponent not decided yet" must NOT auto-advance anyone. */
function sideEmpty(state, r, m, side) {
  if (r === 0) return round0Slot(state.names, m * 2 + side) === null;
  const fm = m * 2 + side;
  return sideEmpty(state, r - 1, fm, 0) && sideEmpty(state, r - 1, fm, 1);
}

export function winnerOf(state, r, m) {
  const a = contender(state, r, m, 0);
  const b = contender(state, r, m, 1);
  const pick = state.picks[r + '-' + m];
  if (pick !== undefined && (pick === a || pick === b) && a !== null && b !== null) return pick;
  if (a !== null && b === null && sideEmpty(state, r, m, 1)) return a; // bye
  if (b !== null && a === null && sideEmpty(state, r, m, 0)) return b;
  return null;
}

/* Record a winner; clears any downstream picks that involved the loser's path. */
export function setPick(state, r, m, entrant) {
  const a = contender(state, r, m, 0);
  const b = contender(state, r, m, 1);
  if (entrant !== a && entrant !== b) return state;
  if (a === null || b === null) return state; // byes aren't picks
  const picks = { ...state.picks, [r + '-' + m]: entrant };
  const rounds = roundCount(state.names.length);
  // invalidate downstream picks that no longer match a contender
  let mm = m;
  const next = { ...state, picks };
  for (let rr = r + 1; rr < rounds; rr++) {
    mm = Math.floor(mm / 2);
    const key = rr + '-' + mm;
    if (picks[key] !== undefined) {
      const ca = contender(next, rr, mm, 0);
      const cb = contender(next, rr, mm, 1);
      if (picks[key] !== ca && picks[key] !== cb) delete picks[key];
    }
  }
  return next;
}

export function champion(state) {
  const rounds = roundCount(state.names.length);
  return winnerOf(state, rounds - 1, 0);
}

/* URL-hash codec. */
export function encodeBracket(state) {
  const json = JSON.stringify({ n: state.names, p: state.picks, t: state.title || '' });
  return btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeBracket(hash) {
  try {
    let s = String(hash || '').replace(/^#/, '').replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const obj = JSON.parse(decodeURIComponent(escape(atob(s))));
    if (!obj || !Array.isArray(obj.n)) return null;
    const names = obj.n.filter(x => typeof x === 'string').slice(0, 32).map(x => x.slice(0, 40));
    const picks = {};
    if (obj.p && typeof obj.p === 'object') {
      for (const k of Object.keys(obj.p)) {
        if (/^\d+-\d+$/.test(k) && Number.isInteger(obj.p[k]) && obj.p[k] >= 0 && obj.p[k] < names.length)
          picks[k] = obj.p[k];
      }
    }
    return { names, picks, title: typeof obj.t === 'string' ? obj.t.slice(0, 60) : '' };
  } catch (e) { return null; }
}
