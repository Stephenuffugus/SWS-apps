// Bracket maker, pure single-elimination logic. Tested in test/helpers.test.mjs.
// State: { names: string[], picks: { "r-m": entrantIndex },
//          scores: { "r-m": [sideAIndex, sideBIndex, scoreA, scoreB] } }
// Round 0 pairs follow standard seeding (1v8, 4v5, 2v7, 3v6 …) so the top two
// seeds can only meet in the final; byes auto-advance.
// A score names the PEOPLE who played, not just the coordinates: if an edit
// upstream sends someone else into that match, the stored score stops matching
// and stops showing, and comes back if the original pairing returns.

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

export const MAX_ENTRANTS = 32;
export const MAX_NAME = 40;
export const MAX_SCORE = 8;

function cleanScore(s) {
  return typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_SCORE) : '';
}

/* Scores arrive from storage, from links and from live docs, all of which a
   stranger can hand you, so they get the same distrust as picks. */
export function sanitizeScores(raw, n) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const k of Object.keys(raw).slice(0, 200)) {
    const v = raw[k];
    if (!/^\d+-\d+$/.test(k) || !Array.isArray(v) || v.length !== 4) continue;
    if (!Number.isInteger(v[0]) || v[0] < 0 || v[0] >= n) continue;
    if (!Number.isInteger(v[1]) || v[1] < 0 || v[1] >= n || v[1] === v[0]) continue;
    if (typeof v[2] !== 'string' || typeof v[3] !== 'string') continue;
    const a = cleanScore(v[2]);
    const b = cleanScore(v[3]);
    if (!a && !b) continue;
    out[k] = [v[0], v[1], a, b];
  }
  return out;
}

/* Record the score of match r-m; two empty strings clear it. */
export function setScore(state, r, m, sa, sb) {
  const a = contender(state, r, m, 0);
  const b = contender(state, r, m, 1);
  if (a === null || b === null) return state;
  const scores = { ...(state.scores || {}) };
  const ca = cleanScore(sa);
  const cb = cleanScore(sb);
  if (!ca && !cb) delete scores[r + '-' + m];
  else scores[r + '-' + m] = [a, b, ca, cb];
  return { ...state, scores };
}

/* The stored score for match r-m, but only while it still names the two
   entrants standing there (in either side order). Returns { sa, sb } or null. */
export function scoreFor(state, r, m) {
  const rec = state.scores && state.scores[r + '-' + m];
  if (!Array.isArray(rec) || rec.length !== 4) return null;
  const a = contender(state, r, m, 0);
  const b = contender(state, r, m, 1);
  if (a === null || b === null) return null;
  if (rec[0] === a && rec[1] === b) return { sa: rec[2], sb: rec[3] };
  if (rec[0] === b && rec[1] === a) return { sa: rec[3], sb: rec[2] };
  return null;
}

/* Parse, but also report what the caps threw away. The app has to be able to
   SAY "you pasted 40, I kept 32", a cap discovered after the work is done is
   the single angriest thing in this category's reviews. */
export function entrantInfo(text) {
  if (typeof text !== 'string') return { names: [], total: 0, dropped: 0, truncated: 0 };
  const raw = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const kept = raw.slice(0, MAX_ENTRANTS);
  return {
    names: kept.map(s => s.slice(0, MAX_NAME)),
    total: raw.length,
    dropped: Math.max(0, raw.length - MAX_ENTRANTS),
    truncated: kept.filter(s => s.length > MAX_NAME).length,
  };
}

export function parseEntrants(text) {
  return entrantInfo(text).names;
}

export function roundCount(n) {
  return Math.log2(nextPow2(Math.max(n, 2)));
}

/* Entrant index (or null for a bye) in a given round-0 slot. */
export function round0Slot(names, slot) {
  const seed = seedOrder(nextPow2(Math.max(names.length, 2)))[slot];
  return seed <= names.length ? seed - 1 : null;
}

/* Who stands in match m of round r on side 0/1, resolved through picks and
   byes; null when not yet decided. */
export function contender(state, r, m, side) {
  if (r === 0) return round0Slot(state.names, m * 2 + side);
  return winnerOf(state, r - 1, m * 2 + side);
}

/* A side is a true bye only when its entire feeding subtree holds no entrants, "opponent not decided yet" must NOT auto-advance anyone. */
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

/* ── Editing the entrant list without deleting the tournament ─────────────
   The old behaviour reset picks:{} whenever the parsed list differed by one
   character, so fixing a typo wiped every result. Instead: work out who is
   who across the edit, express the recorded results as (winner, loser) pairs
   of PEOPLE rather than bracket coordinates, then replay those pairs onto the
   new bracket. A rename in place keeps everything; a reorder keeps every
   result where the same two people still meet; only a genuinely different
   pairing is dropped, and the caller offers an undo for that. */

/** oldIndex → newIndex. Same name in the same slot first, then same name
    anywhere, then leftovers paired in order, which is what a rename is. */
export function mapEntrants(oldNames, newNames) {
  const map = new Array(oldNames.length).fill(-1);
  const takenNew = new Array(newNames.length).fill(false);
  for (let i = 0; i < oldNames.length; i++) {
    if (i < newNames.length && newNames[i] === oldNames[i]) { map[i] = i; takenNew[i] = true; }
  }
  for (let i = 0; i < oldNames.length; i++) {
    if (map[i] !== -1) continue;
    for (let j = 0; j < newNames.length; j++) {
      if (!takenNew[j] && newNames[j] === oldNames[i]) { map[i] = j; takenNew[j] = true; break; }
    }
  }
  const restOld = [];
  for (let i = 0; i < oldNames.length; i++) if (map[i] === -1) restOld.push(i);
  const restNew = [];
  for (let j = 0; j < newNames.length; j++) if (!takenNew[j]) restNew.push(j);
  for (let k = 0; k < Math.min(restOld.length, restNew.length); k++) {
    map[restOld[k]] = restNew[k];
    takenNew[restNew[k]] = true;
  }
  return map;
}

/** Every decided head-to-head in `state`, as [winnerIndex, loserIndex]. */
export function resultPairs(state) {
  const out = [];
  const n = state.names.length;
  if (n < 2) return out;
  const rounds = roundCount(n);
  const size = nextPow2(Math.max(n, 2));
  for (let r = 0; r < rounds; r++) {
    for (let m = 0; m < size / Math.pow(2, r + 1); m++) {
      const p = state.picks[r + '-' + m];
      if (p === undefined) continue;
      const a = contender(state, r, m, 0);
      const b = contender(state, r, m, 1);
      if (a === null || b === null) continue;
      if (p !== a && p !== b) continue;
      out.push([p, p === a ? b : a]);
    }
  }
  return out;
}

/** Carry results across an edit of the entrant list.
    Returns { state, kept, lost }. */
export function carryPicks(oldState, newNames) {
  const map = mapEntrants(oldState.names, newNames);
  const had = resultPairs(oldState);
  const pairs = [];
  for (const [w, l] of had) {
    if (map[w] >= 0 && map[l] >= 0) pairs.push([map[w], map[l]]);
  }
  let next = { names: newNames, picks: {}, title: oldState.title || '', scores: {} };
  if (newNames.length >= 2 && pairs.length) {
    const rounds = roundCount(newNames.length);
    const size = nextPow2(Math.max(newNames.length, 2));
    for (let pass = 0; pass <= rounds; pass++) {
      let changed = false;
      for (let r = 0; r < rounds; r++) {
        for (let m = 0; m < size / Math.pow(2, r + 1); m++) {
          if (next.picks[r + '-' + m] !== undefined) continue;
          const a = contender(next, r, m, 0);
          const b = contender(next, r, m, 1);
          if (a === null || b === null) continue;
          for (const [w, l] of pairs) {
            if ((w === a && l === b) || (w === b && l === a)) {
              next = setPick(next, r, m, w);
              changed = true;
              break;
            }
          }
        }
      }
      if (!changed) break;
    }
  }

  /* Scores follow their people the same way. A recorded score whose two
     entrants both survive the edit reattaches wherever those two now meet,
     with the side order fixed up; the rest quietly drop. */
  const oldScores = oldState.scores || {};
  const carried = [];
  for (const k of Object.keys(oldScores)) {
    const rec = oldScores[k];
    if (!Array.isArray(rec) || rec.length !== 4) continue;
    const a2 = map[rec[0]];
    const b2 = map[rec[1]];
    if (!(a2 >= 0) || !(b2 >= 0)) continue;
    carried.push([a2, b2, rec[2], rec[3]]);
  }
  if (carried.length && newNames.length >= 2) {
    const scores = {};
    const rounds = roundCount(newNames.length);
    const size = nextPow2(Math.max(newNames.length, 2));
    for (let r = 0; r < rounds; r++) {
      for (let m = 0; m < size / Math.pow(2, r + 1); m++) {
        const a = contender(next, r, m, 0);
        const b = contender(next, r, m, 1);
        if (a === null || b === null) continue;
        for (const rec of carried) {
          if (rec[0] === a && rec[1] === b) { scores[r + '-' + m] = [a, b, rec[2], rec[3]]; break; }
          if (rec[0] === b && rec[1] === a) { scores[r + '-' + m] = [a, b, rec[3], rec[2]]; break; }
        }
      }
    }
    next = { ...next, scores };
  }

  const kept = Object.keys(next.picks).length;
  return { state: next, kept, lost: Math.max(0, had.length - kept) };
}

/* ── Arranging the draw ───────────────────────────────────────────────────
   The seeding IS the array order, so trading two entrants' array slots trades
   their places in the bracket. Results and scores between people who still
   meet are carried; the caller reports and offers undo for what is lost. */
export function swapSeeds(state, i, j) {
  const n = state.names.length;
  if (i === j || !Number.isInteger(i) || !Number.isInteger(j)
    || i < 0 || j < 0 || i >= n || j >= n) return { state, kept: 0, lost: 0 };
  const names = state.names.slice();
  const t = names[i];
  names[i] = names[j];
  names[j] = t;
  return carryPicks(state, names);
}

/** Random draw (Fisher-Yates); rand is injectable for tests. */
export function shuffleSeeds(state, rand) {
  const rnd = rand || Math.random;
  const names = state.names.slice();
  for (let i = names.length - 1; i > 0; i--) {
    const k = Math.floor(rnd() * (i + 1));
    const t = names[i];
    names[i] = names[k];
    names[k] = t;
  }
  return carryPicks(state, names);
}

/** Two brackets are "the same tournament" when the line-up and the name match;
    results are allowed to differ (that is what a stale shared link is). */
export function sameBracket(a, b) {
  if (!a || !b) return false;
  return (a.title || '') === (b.title || '')
    && a.names.length === b.names.length
    && a.names.every((x, i) => x === b.names[i]);
}

/* URL-hash codec. The same string is the payload of a live doc, so this is
   the one wire format the app has. */
export function encodeBracket(state) {
  const payload = { n: state.names, p: state.picks, t: state.title || '' };
  if (state.scores && Object.keys(state.scores).length) payload.s = state.scores;
  const json = JSON.stringify(payload);
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
    return {
      names, picks,
      title: typeof obj.t === 'string' ? obj.t.slice(0, 60) : '',
      scores: sanitizeScores(obj.s, names.length),
    };
  } catch (e) { return null; }
}
