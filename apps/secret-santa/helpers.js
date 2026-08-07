// Secret Santa — pure draw logic. Tested in test/helpers.test.mjs.

export function parseNames(text) {
  if (typeof text !== 'string') return [];
  const seen = new Set();
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const name = raw.trim().slice(0, 40);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push(name);
    if (out.length >= 60) break;
  }
  return out;
}

/* exclusions: array of [i, j] index pairs that may not draw each other
   (either direction — typically couples). Returns assignment array where
   result[i] = index that person i gives to, or null if impossible/unlucky. */
export function drawNames(names, exclusions, rng) {
  const n = names.length;
  if (n < 2) return null;
  const rnd = rng || Math.random;
  const banned = new Set();
  for (const [a, b] of exclusions || []) {
    banned.add(a + '>' + b);
    banned.add(b + '>' + a);
  }
  const ok = (giver, receiver) => giver !== receiver && !banned.has(giver + '>' + receiver);

  for (let attempt = 0; attempt < 3000; attempt++) {
    const receivers = [...Array(n).keys()];
    for (let i = receivers.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [receivers[i], receivers[j]] = [receivers[j], receivers[i]];
    }
    if (receivers.every((r, giver) => ok(giver, r))) return receivers;
  }
  return null;
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
    return {
      santa: obj.s.slice(0, 40), gets: obj.g.slice(0, 40),
      event: String(obj.e || '').slice(0, 60), budget: String(obj.b || '').slice(0, 30),
    };
  } catch (e) { return null; }
}
export const isRevealHash = (hash) => /^#r\./.test(String(hash || ''));
