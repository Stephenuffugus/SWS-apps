/* DUCTUS engine, grows a whole alphabet from a few hand-drawn marks.
   Works in browser (window.Ductus) and node (module.exports). */
(function (root) {
  'use strict';
  // Anchor grid: 3 columns × 4 rows in a unit glyph box.
  const NX = [0.14, 0.5, 0.86];
  const NY = [0.06, 0.353, 0.647, 0.94];
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const DIGITS = '0123456789';
  const GEN_CHARS = LETTERS + DIGITS + '?';

  // ---------- utils ----------
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pick = (R, arr) => arr[Math.floor(R() * arr.length)];
  const randInt = (R, a, b) => a + Math.floor(R() * (b - a + 1));
  const nodeXY = ([c, r]) => [NX[c], NY[r]];

  function resample(pts, n) {
    if (pts.length < 2) return pts.map(p => p.slice());
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (L === 0) return [pts[0].slice()];
    const step = L / (n - 1), out = [pts[0].slice()];
    const src = pts.map(p => p.slice());
    let D = 0;
    for (let i = 1; i < src.length; i++) {
      const d = Math.hypot(src[i][0] - src[i - 1][0], src[i][1] - src[i - 1][1]);
      if (D + d >= step && d > 0) {
        const t = (step - D) / d;
        const q = [src[i - 1][0] + t * (src[i][0] - src[i - 1][0]), src[i - 1][1] + t * (src[i][1] - src[i - 1][1])];
        out.push(q); src.splice(i, 0, q); D = 0;
      } else D += d;
    }
    while (out.length < n) out.push(pts[pts.length - 1].slice());
    return out.slice(0, n);
  }
  function perpSigned(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    if (L === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    return (dx * (p[1] - a[1]) - dy * (p[0] - a[0])) / L; // signed
  }
  // Ramer-Douglas-Peucker returning indices of kept points
  function rdpIdx(pts, eps, i0, i1, keep) {
    let dmax = 0, idx = -1;
    for (let i = i0 + 1; i < i1; i++) {
      const d = Math.abs(perpSigned(pts[i], pts[i0], pts[i1]));
      if (d > dmax) { dmax = d; idx = i; }
    }
    if (dmax > eps && idx > 0) { rdpIdx(pts, eps, i0, idx, keep); keep.push(idx); rdpIdx(pts, eps, idx, i1, keep); }
  }
  function snap(p) {
    let bc = 0, br = 0, bd = 1e9;
    for (let c = 0; c < 3; c++) for (let r = 0; r < 4; r++) {
      const d = (p[0] - NX[c]) ** 2 + (p[1] - NY[r]) ** 2;
      if (d < bd) { bd = d; bc = c; br = r; }
    }
    return [bc, br];
  }
  function chaikin(pts, closed) {
    if (pts.length < 3) return pts;
    const out = [];
    if (!closed) out.push(pts[0]);
    const n = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      out.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]]);
      out.push([0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
    }
    if (!closed) out.push(pts[pts.length - 1]);
    return out;
  }

  // ---------- analysis of a hand-drawn doodle ----------
  // strokes: [[[x,y],...], ...] in any pixel space (one imagined letter)
  function analyzeDoodle(strokes) {
    strokes = (strokes || []).filter(s => s && s.length >= 1);
    if (!strokes.length) return null;
    let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
    for (const s of strokes) for (const p of s) { minx = Math.min(minx, p[0]); miny = Math.min(miny, p[1]); maxx = Math.max(maxx, p[0]); maxy = Math.max(maxy, p[1]); }
    const w = maxx - minx, h = maxy - miny, S = Math.max(w, h, 1e-6);
    const ox = (S - w) / 2, oy = (S - h) / 2;
    const norm = p => [(p[0] - minx + ox) / S, (p[1] - miny + oy) / S];
    const prims = [];
    let bulgeAbs = 0, bulgeN = 0, slantSum = 0, slantN = 0, corners = 0, interior = 0, dots = 0;
    for (const raw of strokes) {
      const pts = resample(raw.map(norm), 40);
      let ext = 0;
      for (const p of pts) ext = Math.max(ext, Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]));
      if (ext < 0.09 || pts.length < 2) { // a dot
        const c = pts[Math.floor(pts.length / 2)];
        prims.push({ nodes: [snap(c)], bulges: [], dot: true });
        dots++; continue;
      }
      const keep = [0]; rdpIdx(pts, 0.13, 0, pts.length - 1, keep); keep.push(pts.length - 1);
      // turning angles at interior vertices (angularity)
      for (let k = 1; k < keep.length - 1; k++) {
        const a = pts[keep[k - 1]], b = pts[keep[k]], c = pts[keep[k + 1]];
        const a1 = Math.atan2(b[1] - a[1], b[0] - a[0]), a2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
        let d = Math.abs(a2 - a1); if (d > Math.PI) d = 2 * Math.PI - d;
        interior++; if (d > 0.9) corners++;
      }
      // slant from near-vertical segments
      for (let i = 1; i < pts.length; i++) {
        const dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1];
        if (Math.abs(dy) > Math.abs(dx) * 1.4 && Math.abs(dy) > 0.004) { slantSum += -dx / dy; slantN++; }
      }
      // snap vertices, measure bulges of each raw sub-arc
      const nodes = [], bulges = [];
      for (let k = 0; k < keep.length; k++) {
        const n = snap(pts[keep[k]]);
        if (nodes.length && nodes[nodes.length - 1][0] === n[0] && nodes[nodes.length - 1][1] === n[1]) {
          // merge: extend previous segment's bulge measurement window
          continue;
        }
        if (k > 0) {
          const i0 = keep[k - 1], i1 = keep[k];
          let best = 0;
          for (let i = i0 + 1; i < i1; i++) { const d = perpSigned(pts[i], pts[i0], pts[i1]); if (Math.abs(d) > Math.abs(best)) best = d; }
          const chord = Math.hypot(pts[i1][0] - pts[i0][0], pts[i1][1] - pts[i0][1]) || 1;
          const b = clamp(best / chord, -0.5, 0.5);
          if (nodes.length) { bulges.push(b); bulgeAbs += Math.abs(b); bulgeN++; }
        }
        nodes.push(n);
      }
      if (nodes.length < 2) { // collapsed to one node: make it a short stem toward the stroke direction
        const a = pts[0], b = pts[pts.length - 1];
        const n2 = snap([a[0] + (b[0] - a[0]) * 2, a[1] + (b[1] - a[1]) * 2]);
        if (n2[0] === nodes[0][0] && n2[1] === nodes[0][1]) { prims.push({ nodes: [nodes[0]], bulges: [], dot: true }); dots++; continue; }
        nodes.push(n2); bulges.push(0);
      }
      const closed = nodes.length >= 4 && nodes[0][0] === nodes[nodes.length - 1][0] && nodes[0][1] === nodes[nodes.length - 1][1];
      prims.push({ nodes, bulges, dot: false, closed });
    }
    return {
      prims,
      strokeCount: strokes.length,
      curv: bulgeN ? bulgeAbs / bulgeN : 0,
      slant: slantN ? slantSum / slantN : 0,
      angular: interior ? corners / interior : 0.5,
      dotRate: dots / strokes.length
    };
  }

  function aggregate(analyses) {
    const n = analyses.length;
    const mean = f => analyses.reduce((s, a) => s + f(a), 0) / n;
    return {
      spg: clamp(mean(a => a.strokeCount), 1, 3.5),
      nodesPer: clamp(mean(a => a.prims.reduce((s, p) => s + (p.dot ? 1 : p.nodes.length), 0)), 3, 7),
      curv: clamp(mean(a => a.curv) / 0.22, 0, 1),
      slant: clamp(mean(a => a.slant), -0.3, 0.4),
      angular: clamp(mean(a => a.angular), 0, 1),
      dotRate: clamp(mean(a => a.dotRate), 0, 1)
    };
  }
  function randomFeats(R) {
    return { spg: 1 + R() * 2, nodesPer: 3 + R() * 3, curv: R(), slant: (R() - 0.4) * 0.4, angular: R(), dotRate: R() < 0.4 ? R() * 0.5 : 0 };
  }

  // ---------- glyph generation ----------
  function neighbor(R, [c, r]) {
    for (let t = 0; t < 20; t++) {
      const nc = clamp(c + randInt(R, -1, 1), 0, 2), nr = clamp(r + randInt(R, -1, 1), 0, 3);
      if (nc !== c || nr !== r) return [nc, nr];
    }
    return [c, (r + 1) % 4];
  }
  function randBulge(R, feats) {
    let b = (R() < 0.5 ? -1 : 1) * (0.12 + R() * 0.38) * (0.25 + feats.curv);
    if (feats.angular > 0.6 && R() < 0.6) b *= 0.25;
    return clamp(b, -0.5, 0.5);
  }
  function inventStroke(R, feats) {
    const len = randInt(R, 2, feats.spg < 1.6 ? 4 : 3);
    const nodes = [[randInt(R, 0, 2), randInt(R, 0, 3)]], bulges = [];
    while (nodes.length < len) {
      const nb = neighbor(R, nodes[nodes.length - 1]);
      if (nodes.some(n => n[0] === nb[0] && n[1] === nb[1])) continue;
      nodes.push(nb); bulges.push(randBulge(R, feats));
    }
    return { nodes, bulges, dot: false, closed: false };
  }
  function cleanup(nodes, bulges) {
    for (let i = nodes.length - 1; i > 0; i--) {
      if (nodes[i][0] === nodes[i - 1][0] && nodes[i][1] === nodes[i - 1][1]) { nodes.splice(i, 1); bulges.splice(i - 1, 1); }
    }
  }
  function mutate(R, s, feats) {
    if (s.dot) return { nodes: [[randInt(R, 0, 2), randInt(R, 0, 3)]], bulges: [], dot: true };
    let nodes = s.nodes.map(n => n.slice()), bulges = s.bulges.slice();
    if (R() < 0.35) { nodes = nodes.map(([c, r]) => [2 - c, r]); bulges = bulges.map(b => -b); }
    if (R() < 0.2) { nodes = nodes.map(([c, r]) => [c, 3 - r]); bulges = bulges.map(b => -b); }
    if (R() < 0.55) { const dc = randInt(R, -1, 1), dr = randInt(R, -1, 1); nodes = nodes.map(([c, r]) => [clamp(c + dc, 0, 2), clamp(r + dr, 0, 3)]); }
    cleanup(nodes, bulges);
    if (R() < 0.2 && nodes.length > 3) { nodes.pop(); bulges.pop(); }
    const pExt = nodes.length < 3 ? 0.7 : 0.3;
    if (R() < pExt) { nodes.push(neighbor(R, nodes[nodes.length - 1])); bulges.push(randBulge(R, feats)); }
    if (R() < 0.25 && nodes.length < 4) { nodes.unshift(neighbor(R, nodes[0])); bulges.unshift(randBulge(R, feats)); }
    if (R() < 0.3 && nodes.length >= 2) { const i = randInt(R, 0, nodes.length - 1); nodes[i] = neighbor(R, nodes[i]); }
    bulges = bulges.map(b => (R() < 0.2 ? -b : b));
    cleanup(nodes, bulges);
    while (nodes.length < 2) { nodes.push(neighbor(R, nodes[nodes.length - 1])); bulges.push(randBulge(R, feats)); cleanup(nodes, bulges); }
    const closed = nodes.length >= 4 && nodes[0][0] === nodes[nodes.length - 1][0] && nodes[0][1] === nodes[nodes.length - 1][1];
    return { nodes, bulges, dot: false, closed };
  }
  function cheb(a, b) { return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])); }
  function minDist(s, others) {
    let m = 9;
    for (const o of others) for (const a of o.nodes) for (const b of s.nodes) m = Math.min(m, cheb(a, b));
    return m;
  }
  function attach(R, s, existing) {
    if (minDist(s, existing) <= 1) return s;
    const target = R() < 0.5 ? 0 : 1;
    let best = null, bestCost = 99;
    for (let dc = -2; dc <= 2; dc++) for (let dr = -3; dr <= 3; dr++) {
      const nodes = s.nodes.map(([c, r]) => [c + dc, r + dr]);
      if (nodes.some(([c, r]) => c < 0 || c > 2 || r < 0 || r > 3)) continue;
      const cand = Object.assign({}, s, { nodes });
      const d = minDist(cand, existing);
      if (d > 1) continue;
      const cost = Math.abs(dc) + Math.abs(dr) + (d === target ? 0 : 0.5);
      if (cost < bestCost) { bestCost = cost; best = cand; }
    }
    return best || s;
  }
  function dotNear(R, strokes) {
    const all = []; for (const s of strokes) for (const n of s.nodes) all.push(n);
    const base = pick(R, all);
    for (let t = 0; t < 12; t++) {
      const n = neighbor(R, base);
      if (!all.some(a => a[0] === n[0] && a[1] === n[1])) return { nodes: [n], bulges: [], dot: true };
    }
    return { nodes: [[1, 0]], bulges: [], dot: true };
  }
  function signature(strokes) {
    const set = new Set();
    for (const s of strokes) for (const n of s.nodes) set.add(n[0] + '' + n[1]);
    return [...set].sort().join('') + '|' + strokes.length + '|' + strokes.filter(s => s.dot).length;
  }
  function glyphExtent(strokes) {
    let minc = 9, maxc = -1, minr = 9, maxr = -1;
    for (const s of strokes) for (const [c, r] of s.nodes) { minc = Math.min(minc, c); maxc = Math.max(maxc, c); minr = Math.min(minr, r); maxr = Math.max(maxr, r); }
    return { w: maxc - minc, h: maxr - minr };
  }
  const complexity = strokes => strokes.reduce((s, st) => s + (st.dot ? 1 : st.nodes.length), 0);
  function genGlyph(R, prims, invented, feats, seen, stats) {
    stats = stats || { simple: 0, short: 0 };
    const target = feats.nodesPer || 4;
    let fallback = null;
    for (let attempt = 0; attempt < 500; attempt++) {
      const k = clamp(Math.round(feats.spg + (R() - 0.5) * 1.8), 1, 3);
      const strokes = [];
      for (let i = 0; i < k; i++) {
        const base = R() < 0.22 ? pick(R, invented) : pick(R, prims);
        let s = mutate(R, base, feats);
        if (i > 0 && !s.dot) s = attach(R, s, strokes.filter(x => !x.dot));
        strokes.push(s);
      }
      if (feats.dotRate > 0.12 && R() < feats.dotRate * 0.9 && !strokes.some(s => s.dot)) strokes.push(dotNear(R, strokes));
      const real = strokes.filter(s => !s.dot);
      if (!real.length) continue; // a lone dot is not a letter
      const ext = glyphExtent(strokes), cx = complexity(strokes);
      const early = attempt < 300;
      if (ext.h < 1 && ext.w < 1) continue;
      if (ext.h === 0 && attempt < 450) continue; // flat dashes are rare
      if (cx < 3 && (stats.simple >= 2 || early)) continue; // a bare line is a letter only twice
      if (early && (cx < target - 1 || cx > target + 3)) continue; // match the hand's complexity
      if (ext.h < 2 && (stats.short >= 8 || early)) continue; // most letters stand tall
      const sig = signature(strokes);
      if (seen.has(sig)) { fallback = fallback || strokes; continue; }
      seen.add(sig);
      if (cx < 3) stats.simple++;
      if (ext.h < 2) stats.short++;
      return { strokes };
    }
    return { strokes: fallback || [inventStroke(R, feats)] };
  }

  // ---------- names & traits ----------
  function makeName(R) {
    const on = ['v', 'k', 'th', 's', 'r', 'm', 'n', 'l', 'd', 'sh', 'z', 'h', 'f', 'q', 'y', 'br', 'kr', 'tz', ''];
    const nu = ['a', 'e', 'i', 'o', 'u', 'ae', 'ai', 'ei', 'ia', 'ou'];
    const co = ['', '', 'n', 'r', 'l', 'sh', 'th', 'k', 's', 'm', 'x'];
    const syl = R() < 0.7 ? 2 : 3;
    let s = '';
    for (let i = 0; i < syl; i++) s += pick(R, on) + pick(R, nu) + (i === syl - 1 ? pick(R, co) : (R() < 0.25 ? pick(R, co) : ''));
    if (s.length > 8) s = s.slice(0, 8).replace(/[^aeiou]+$/, '') || s.slice(0, 6);
    s = s.charAt(0).toUpperCase() + s.slice(1);
    const suf = pick(R, ['', '', ' script', ' hand', 'ic', ' letters', 'an']);
    return s + suf;
  }
  function describe(f) {
    const t = [];
    t.push(f.curv < 0.3 ? 'Angular' : f.curv > 0.65 ? 'Flowing' : 'Rounded');
    t.push(f.slant > 0.12 ? 'Italic' : f.slant < -0.08 ? 'Backhand' : 'Upright');
    t.push(f.spg < 1.5 ? 'Single-stroke' : f.spg < 2.5 ? 'Two-stroke' : 'Many-stroke');
    if (f.dotRate > 0.12) t.push('Dotted');
    return t;
  }

  function makeScript(doodles, seed) {
    const R = rng(seed);
    const analyses = (doodles || []).map(analyzeDoodle).filter(Boolean);
    let prims = [], feats;
    if (analyses.length) { for (const a of analyses) prims.push(...a.prims); feats = aggregate(analyses); }
    else feats = randomFeats(R);
    const nonDot = prims.filter(p => !p.dot);
    while (nonDot.length < 3) { const s = inventStroke(R, feats); prims.push(s); nonDot.push(s); }
    const invented = [inventStroke(R, feats), inventStroke(R, feats), inventStroke(R, feats)];
    const seen = new Set(), glyphs = {}, stats = { simple: 0, short: 0 };
    for (const ch of GEN_CHARS) glyphs[ch] = genGlyph(R, prims, invented, feats, seen, stats);
    // fixed punctuation in the same voice
    glyphs['.'] = { strokes: [{ nodes: [[1, 3]], bulges: [], dot: true }] };
    glyphs[','] = { strokes: [{ nodes: [[1, 3]], bulges: [], dot: true }, { nodes: [[1, 3], [0, 3]], bulges: [0.3], dot: false }] };
    glyphs['!'] = { strokes: [{ nodes: [[1, 0], [1, 2]], bulges: [0], dot: false }, { nodes: [[1, 3]], bulges: [], dot: true }] };
    glyphs['-'] = { strokes: [{ nodes: [[0, 2], [2, 2]], bulges: [0], dot: false }] };
    glyphs["'"] = { strokes: [{ nodes: [[1, 0], [1, 1]], bulges: [0.15], dot: false }] };
    glyphs[':'] = { strokes: [{ nodes: [[1, 1]], bulges: [], dot: true }, { nodes: [[1, 3]], bulges: [], dot: true }] };
    return { seed, feats, prims, invented, glyphs, name: makeName(R), traits: describe(feats), lastSeed: seed };
  }
  function recastGlyph(script, ch) {
    script.lastSeed = (script.lastSeed * 1664525 + 1013904223) >>> 0;
    const R = rng(script.lastSeed ^ ch.charCodeAt(0));
    const seen = new Set(Object.keys(script.glyphs).filter(c => c !== ch).map(c => signature(script.glyphs[c].strokes)));
    script.glyphs[ch] = genGlyph(R, script.prims, script.invented, script.feats, seen, { simple: 2, short: 8 });
    return script.glyphs[ch];
  }

  // ---------- rendering ----------
  function strokePoints(s) {
    const N = s.nodes.map(nodeXY), pts = [];
    for (let i = 0; i < N.length - 1; i++) {
      const A = N[i], B = N[i + 1], b = s.bulges[i] || 0;
      const dx = B[0] - A[0], dy = B[1] - A[1];
      const C = [(A[0] + B[0]) / 2 - dy * 2 * b, (A[1] + B[1]) / 2 + dx * 2 * b];
      const segs = Math.abs(b) < 0.02 ? 1 : 8;
      for (let k = (i === 0 ? 0 : 1); k <= segs; k++) {
        const t = k / segs, u = 1 - t;
        pts.push([u * u * A[0] + 2 * u * t * C[0] + t * t * B[0], u * u * A[1] + 2 * u * t * C[1] + t * t * B[1]]);
      }
    }
    return pts;
  }
  // Returns paths in unit coords: [{dot, pts:[[x,y]..]}]
  function glyphPaths(glyph, style) {
    const age = style.age || 0;
    const smooth = Math.min(3, Math.floor(age * 3.2));
    let paths = [];
    for (const s of glyph.strokes) {
      if (s.dot) paths.push({ dot: true, pts: [nodeXY(s.nodes[0])] });
      else paths.push({ dot: false, pts: strokePoints(s) });
    }
    if (age >= 0.34) { // the pen stops lifting inside a letter
      const merged = [], dots = [];
      for (const p of paths) { if (p.dot) dots.push(p); else merged.push(...p.pts); }
      paths = merged.length ? [{ dot: false, pts: merged }].concat(dots) : dots;
    }
    for (const p of paths) if (!p.dot) { let pts = p.pts; for (let i = 0; i < smooth; i++) pts = chaikin(pts, false); p.pts = pts; }
    const sl = (style.slant || 0) + age * 0.14;
    for (const p of paths) p.pts = p.pts.map(([x, y]) => [x + (0.5 - y) * sl, y]);
    return paths;
  }
  function pathsBBox(paths) {
    let minx = 9, maxx = -9;
    for (const p of paths) for (const q of p.pts) { minx = Math.min(minx, q[0]); maxx = Math.max(maxx, q[0]); }
    if (minx > maxx) { minx = 0.3; maxx = 0.7; }
    return { minx, maxx };
  }
  const NIB = 35 * Math.PI / 180;
  // Width of the pen for the segment a→b, t = position along the stroke (0..1)
  function segWidth(pen, a, b, t, wmax, wmin) {
    if (pen.type === 'round') return wmax;
    if (pen.type === 'broad') {
      const th = Math.atan2(b[1] - a[1], b[0] - a[0]);
      return wmin + (wmax - wmin) * Math.abs(Math.sin(th - NIB));
    }
    const tap = Math.min(1, t * 3.2, (1 - t) * 3.2);
    return wmin + (wmax - wmin) * (0.25 + 0.75 * tap);
  }
  // Draw a list of page-space polylines with a pen. ctx is a 2D context.
  function drawPaths(ctx, paths, pen, H, ink) {
    const wmax = H * pen.weight, wmin = wmax * (pen.type === 'round' ? 1 : 0.36);
    const nib = NIB;
    ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const buckets = new Map();
    const B = 9;
    for (const p of paths) {
      if (p.dot) { ctx.beginPath(); ctx.arc(p.pts[0][0], p.pts[0][1], wmax * 0.62, 0, Math.PI * 2); ctx.fill(); continue; }
      const pts = p.pts;
      if (pts.length === 1) { ctx.beginPath(); ctx.arc(pts[0][0], pts[0][1], wmax * 0.5, 0, Math.PI * 2); ctx.fill(); continue; }
      if (pen.type === 'round') {
        ctx.lineWidth = wmax; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.stroke(); continue;
      }
      let total = 0; const cum = [0];
      for (let i = 1; i < pts.length; i++) { total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); cum.push(total); }
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        let w;
        if (pen.type === 'broad') {
          const th = Math.atan2(b[1] - a[1], b[0] - a[0]);
          w = wmin + (wmax - wmin) * Math.abs(Math.sin(th - nib));
        } else { // brush: taper at both ends, swell in the middle
          const t = total ? cum[i] / total : 0.5;
          const tap = Math.min(1, t * 3.2, (1 - t) * 3.2);
          w = wmin + (wmax - wmin) * (0.25 + 0.75 * tap);
        }
        const k = Math.round((w - wmin) / ((wmax - wmin) || 1) * (B - 1));
        let path = buckets.get(k); if (!path) { path = new Path2D(); buckets.set(k, path); }
        path.moveTo(a[0], a[1]); path.lineTo(b[0], b[1]);
      }
    }
    for (const [k, path] of buckets) { ctx.lineWidth = wmin + (wmax - wmin) * k / (B - 1); ctx.stroke(path); }
  }
  function transform(paths, x, y, W, H) {
    return paths.map(p => ({ dot: p.dot, pts: p.pts.map(([u, v]) => [x + u * W, y + v * H]) }));
  }
  function glyphFor(script, ch) {
    const u = ch.toUpperCase();
    return script.glyphs[u] || null;
  }
  // Lay out text; returns {lines:[{glyphs:[{ch,paths,x}]}], height}
  function layout(script, text, style, opts) {
    const H = opts.H, W = H * 0.78, gap = W * (opts.gap || 0.24), space = W * (opts.space || 0.55), lineH = H * (opts.lineH || 1.5);
    const maxW = opts.maxW;
    const cursive = (style.age || 0) >= 0.68;
    const words = [];
    for (const rawLine of (text || '').split('\n')) {
      const lineWords = rawLine.split(/\s+/).filter(Boolean);
      words.push(lineWords.map(w => {
        const items = [];
        for (const ch of w) {
          const g = glyphFor(script, ch); if (!g) continue;
          const paths = glyphPaths(g, style), bb = pathsBBox(paths);
          items.push({ ch, paths, bb, w: (bb.maxx - bb.minx) * W });
        }
        const width = items.reduce((s, it) => s + it.w, 0) + gap * Math.max(0, items.length - 1);
        return { items, width };
      }));
    }
    const lines = []; let y = 0;
    for (const lineWords of words) {
      let cur = { glyphs: [], y }, x = 0;
      for (const word of lineWords) {
        if (x > 0 && x + word.width > maxW) { lines.push(cur); y += lineH; cur = { glyphs: [], y }; x = 0; }
        let prev = null;
        for (const it of word.items) {
          const gx = x - it.bb.minx * W;
          const pagePaths = transform(it.paths, gx, y, W, H);
          if (cursive && prev && prev.main && pagePaths.length && !pagePaths[0].dot) {
            // join the pen from the last letter into this one with an under-swoop
            const E = prev.main[prev.main.length - 1], S = pagePaths[0].pts[0];
            const C = [(E[0] + S[0]) / 2, Math.max(E[1], S[1]) + H * 0.18];
            const join = [];
            for (let k = 1; k < 7; k++) { const t = k / 7, u = 1 - t; join.push([u * u * E[0] + 2 * u * t * C[0] + t * t * S[0], u * u * E[1] + 2 * u * t * C[1] + t * t * S[1]]); }
            pagePaths[0].pts = prev.main.concat(join, pagePaths[0].pts);
            prev.drop = true;
          }
          const g = { ch: it.ch, paths: pagePaths, x: x, w: it.w, main: pagePaths.length && !pagePaths[0].dot ? pagePaths[0].pts : null };
          cur.glyphs.push(g); prev = g;
          x += it.w + gap;
        }
        x += space - gap;
      }
      lines.push(cur); y += lineH;
    }
    // remove paths swallowed by cursive joins
    for (const L of lines) for (const g of L.glyphs) if (g.drop) g.paths = g.paths.filter(p => p.dot);
    return { lines, height: y - lineH + H, W, H };
  }
  function renderText(ctx, script, text, style, opts) {
    const lay = layout(script, text, style, opts);
    const ox = opts.x || 0, oy = opts.y || 0;
    for (const L of lay.lines) for (const g of L.glyphs) {
      const paths = g.paths.map(p => ({ dot: p.dot, pts: p.pts.map(([x, y]) => [x + ox, y + oy]) }));
      drawPaths(ctx, paths, style.pen, opts.H, style.ink);
      if (opts.showKey) {
        ctx.fillStyle = opts.keyColor || 'rgba(0,0,0,0.45)';
        ctx.font = `${Math.round(opts.H * 0.26)}px Georgia, serif`;
        ctx.textAlign = 'center';
        ctx.fillText(g.ch.toUpperCase(), ox + g.x + g.w / 2, oy + L.y + opts.H * 1.22);
      }
    }
    return lay;
  }
  function drawGlyph(ctx, script, ch, x, y, H, style) {
    const g = glyphFor(script, ch); if (!g) return;
    const W = H * 0.78;
    const paths = glyphPaths(g, style), bb = pathsBBox(paths);
    const cx = x - ((bb.minx + bb.maxx) / 2) * W; // center ink horizontally on x
    drawPaths(ctx, transform(paths, cx, y, W, H), style.pen, H, style.ink);
  }

  // ---------- hand codes: a script as a short pasteable string ----------
  const B12 = '0123456789ab';
  const encStroke = s => s.dot ? 'D' + B12[s.nodes[0][0] * 4 + s.nodes[0][1]]
    : s.nodes.map(n => B12[n[0] * 4 + n[1]]).join('') + ':' + s.bulges.map(b => String.fromCharCode(102 + Math.round(clamp(b, -0.5, 0.5) * 10))).join('');
  const encGlyph = g => g.strokes.map(encStroke).join('.');
  function decStroke(t) {
    if (t[0] === 'D') { const v = B12.indexOf(t[1]); if (v < 0) throw 0; return { nodes: [[v / 4 | 0, v % 4]], bulges: [], dot: true }; }
    const [ns, bs] = t.split(':'); if (!ns || ns.length < 2) throw 0;
    const nodes = [...ns].map(c => { const v = B12.indexOf(c); if (v < 0) throw 0; return [v / 4 | 0, v % 4]; });
    const bulges = [...(bs || '')].map(c => (c.charCodeAt(0) - 102) / 10);
    while (bulges.length < nodes.length - 1) bulges.push(0);
    const closed = nodes.length >= 4 && nodes[0][0] === nodes[nodes.length - 1][0] && nodes[0][1] === nodes[nodes.length - 1][1];
    return { nodes, bulges: bulges.slice(0, nodes.length - 1), dot: false, closed };
  }
  const decGlyph = t => ({ strokes: t.split('.').map(decStroke) });
  function encodeScript(s) {
    const f = s.feats, q = v => Math.round(v * 100);
    return ['DUCTUS1', [q(f.spg), q(f.curv), q(f.slant), q(f.angular), q(f.dotRate), q(f.nodesPer || 4)].join(' '),
      GEN_CHARS.split('').map(c => encGlyph(s.glyphs[c])).join(','),
      s.prims.map(encStroke).join(','), s.invented.map(encStroke).join(','), s.name].join('|');
  }
  function decodeScript(str) {
    try {
      const parts = String(str).trim().split('|');
      if (parts[0] !== 'DUCTUS1' || parts.length < 6) return null;
      const f = parts[1].split(' ').map(Number);
      const feats = { spg: f[0] / 100, curv: f[1] / 100, slant: f[2] / 100, angular: f[3] / 100, dotRate: f[4] / 100, nodesPer: f[5] / 100 };
      const gl = parts[2].split(','); if (gl.length !== GEN_CHARS.length) return null;
      const glyphs = {}; GEN_CHARS.split('').forEach((c, i) => glyphs[c] = decGlyph(gl[i]));
      const base = makeScript([], 1); // punctuation
      for (const k of Object.keys(base.glyphs)) if (!glyphs[k]) glyphs[k] = base.glyphs[k];
      const prims = parts[3] ? parts[3].split(',').map(decStroke) : [];
      const invented = parts[4] ? parts[4].split(',').map(decStroke) : [inventStroke(rng(1), feats)];
      const name = parts.slice(5).join('|').slice(0, 40) || 'Imported hand';
      return { seed: hashStr(str), feats, prims: prims.length ? prims : [inventStroke(rng(2), feats)], invented, glyphs, name, traits: describe(feats), lastSeed: hashStr(str) };
    } catch (e) { return null; }
  }
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  // ---------- TrueType export (no libraries) ----------
  function Bin() { const a = []; const w = {
    u8: v => a.push(v & 255), u16: v => a.push((v >> 8) & 255, v & 255), i16: v => w.u16(v < 0 ? v + 65536 : v),
    u32: v => a.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255), i32: v => w.u32(v >>> 0),
    i64: v => { w.u32(0); w.u32(v >>> 0); }, tag: s => { for (let i = 0; i < 4; i++) a.push(s.charCodeAt(i)); },
    bytes: b => { for (const x of b) a.push(x); }, get length() { return a.length; }, out: () => Uint8Array.from(a) }; return w; }
  function rdpPts(pts, eps) { if (pts.length < 3) return pts; const keep = [0]; rdpIdx(pts, eps, 0, pts.length - 1, keep); keep.push(pts.length - 1); return keep.map(i => pts[i]); }
  function circlePoly(cx, cy, r, n) { const o = []; for (let i = 0; i < n; i++) { const a = -i / n * Math.PI * 2; o.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } return o; }
  function clockwise(poly) { let s = 0; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; s += (b[0] - a[0]) * (b[1] + a[1]); } return s > 0 ? poly : poly.slice().reverse(); }
  // Outline a glyph as filled contours in font units (y up). Overlapping same-direction contours union under nonzero fill.
  function glyphContours(glyph, style, pen) {
    const UPM = 1000, W = 780, wmax = UPM * pen.weight, wmin = wmax * (pen.type === 'round' ? 1 : 0.36);
    const paths = glyphPaths(glyph, style), bb = pathsBBox(paths);
    const lsb = 60, adv = Math.round((bb.maxx - bb.minx) * W + lsb * 2);
    const F = ([x, y]) => [(x - bb.minx) * W + lsb, (0.94 - y) * UPM];
    const contours = [];
    for (const p of paths) {
      if (p.dot) { const c = F(p.pts[0]); contours.push(circlePoly(c[0], c[1], wmax * 0.62, 14)); continue; }
      let pts = rdpPts(p.pts.map(F), 2.5);
      if (pts.length === 1) { contours.push(circlePoly(pts[0][0], pts[0][1], wmax / 2, 12)); continue; }
      let total = 0; const cum = [0];
      for (let i = 1; i < pts.length; i++) { total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); cum.push(total); }
      const widths = [];
      for (let i = 1; i < pts.length; i++) widths.push(segWidth(pen, pts[i - 1], pts[i], total ? cum[i] / total : 0.5, wmax, wmin));
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], w = widths[i - 1];
        const wa = i > 1 ? (widths[i - 2] + w) / 2 : w, wb = i < pts.length - 1 ? (widths[i] + w) / 2 : w;
        const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
        // extend each piece a little past its ends so neighbours overlap (no antialiasing seams)
        const ex = Math.min(w * 0.35, L * 0.45), ux = dx / L * ex, uy = dy / L * ex;
        const a2 = [a[0] - ux, a[1] - uy], b2 = [b[0] + ux, b[1] + uy];
        contours.push(clockwise([[a2[0] + nx * wa / 2, a2[1] + ny * wa / 2], [b2[0] + nx * wb / 2, b2[1] + ny * wb / 2], [b2[0] - nx * wb / 2, b2[1] - ny * wb / 2], [a2[0] - nx * wa / 2, a2[1] - ny * wa / 2]]));
      }
      // round caps at the ends, round joints where the stroke turns
      contours.push(circlePoly(pts[0][0], pts[0][1], widths[0] / 2, 10));
      contours.push(circlePoly(pts[pts.length - 1][0], pts[pts.length - 1][1], widths[widths.length - 1] / 2, 10));
      for (let i = 1; i < pts.length - 1; i++) {
        const a = pts[i - 1], b = pts[i], c = pts[i + 1];
        const t1 = Math.atan2(b[1] - a[1], b[0] - a[0]), t2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
        let d = Math.abs(t2 - t1); if (d > Math.PI) d = 2 * Math.PI - d;
        if (d > 0.2) contours.push(circlePoly(b[0], b[1], (widths[i - 1] + widths[i]) / 4, 8));
      }
    }
    return { contours: contours.map(clockwise), adv };
  }
  function buildFont(script, style, familyName) {
    const pen = style.pen;
    const order = [{ ch: null }, { ch: ' ' }];
    for (const ch of LETTERS + DIGITS + ".,!-':?") order.push({ ch });
    const glyphs = order.map(o => {
      if (!o.ch || o.ch === ' ') return { contours: [], adv: o.ch === ' ' ? 420 : 500 };
      const g = script.glyphs[o.ch]; if (!g) return { contours: [], adv: 500 };
      return glyphContours(g, style, pen);
    });
    // glyf + loca
    const glyf = Bin(), loca = [];
    let maxPts = 0, maxCont = 0, xMin = 9999, yMin = 9999, xMax = -9999, yMax = -9999, advMax = 0, xExt = 0;
    const metrics = [];
    for (const g of glyphs) {
      loca.push(glyf.length);
      let gxMin = 0, gxMax = 0;
      if (g.contours.length) {
        const pts = []; const ends = [];
        for (const c of g.contours) { for (const p of c) pts.push([Math.round(p[0]), Math.round(p[1])]); ends.push(pts.length - 1); }
        let x0 = 9999, y0 = 9999, x1 = -9999, y1 = -9999;
        for (const p of pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
        gxMin = x0; gxMax = x1;
        xMin = Math.min(xMin, x0); yMin = Math.min(yMin, y0); xMax = Math.max(xMax, x1); yMax = Math.max(yMax, y1);
        maxPts = Math.max(maxPts, pts.length); maxCont = Math.max(maxCont, g.contours.length);
        glyf.i16(g.contours.length); glyf.i16(x0); glyf.i16(y0); glyf.i16(x1); glyf.i16(y1);
        for (const e of ends) glyf.u16(e);
        glyf.u16(0);
        for (let i = 0; i < pts.length; i++) glyf.u8(1);
        let px = 0, py = 0;
        for (const p of pts) { glyf.i16(p[0] - px); px = p[0]; }
        for (const p of pts) { glyf.i16(p[1] - py); py = p[1]; }
        while (glyf.length % 4) glyf.u8(0);
      }
      metrics.push({ adv: g.adv, lsb: gxMin });
      advMax = Math.max(advMax, g.adv); xExt = Math.max(xExt, gxMax);
    }
    loca.push(glyf.length);
    if (xMin > xMax) { xMin = 0; yMin = 0; xMax = 500; yMax = 700; }
    const locaB = Bin(); for (const o of loca) locaB.u32(o);
    const hmtx = Bin(); for (const m of metrics) { hmtx.u16(m.adv); hmtx.i16(m.lsb); }
    const n = glyphs.length;
    const head = Bin(); head.u32(0x00010000); head.u32(0x00010000); head.u32(0); head.u32(0x5F0F3CF5); head.u16(0x000B); head.u16(1000);
    head.i64(0); head.i64(0); head.i16(xMin); head.i16(yMin); head.i16(xMax); head.i16(yMax); head.u16(0); head.u16(8); head.i16(2); head.i16(1); head.i16(0);
    const hhea = Bin(); hhea.u32(0x00010000); hhea.i16(950); hhea.i16(-250); hhea.i16(0); hhea.u16(advMax); hhea.i16(Math.min(...metrics.map(m => m.lsb))); hhea.i16(0); hhea.i16(xExt);
    hhea.i16(1); hhea.i16(0); hhea.i16(0); for (let i = 0; i < 4; i++) hhea.i16(0); hhea.i16(0); hhea.u16(n);
    const maxp = Bin(); maxp.u32(0x00010000); maxp.u16(n); maxp.u16(maxPts); maxp.u16(maxCont); maxp.u16(0); maxp.u16(0); maxp.u16(2); for (let i = 0; i < 8; i++) maxp.u16(0);
    const os2 = Bin(); os2.u16(4); os2.i16(Math.round(metrics.reduce((s, m) => s + m.adv, 0) / n)); os2.u16(400); os2.u16(5); os2.u16(0);
    [650, 600, 0, 75, 650, 600, 0, 350, 50, 300].forEach(v => os2.i16(v)); os2.i16(0); for (let i = 0; i < 10; i++) os2.u8(0);
    os2.u32(1); os2.u32(0); os2.u32(0); os2.u32(0); os2.tag('DCTS'); os2.u16(0x40); os2.u16(32); os2.u16(122);
    os2.i16(950); os2.i16(-250); os2.i16(0); os2.u16(950); os2.u16(250); os2.u32(1); os2.u32(0); os2.i16(500); os2.i16(880); os2.u16(0); os2.u16(32); os2.u16(0);
    // cmap format 4
    const cmapMap = []; order.forEach((o, gi) => { if (!o.ch) return; cmapMap.push([o.ch.charCodeAt(0), gi]); if (/[A-Z]/.test(o.ch)) cmapMap.push([o.ch.toLowerCase().charCodeAt(0), gi]); });
    cmapMap.sort((a, b) => a[0] - b[0]);
    const segs = [];
    for (const [cp, gi] of cmapMap) { const s = segs[segs.length - 1]; if (s && s.end === cp - 1 && s.gi + (cp - s.start) === gi) s.end = cp; else segs.push({ start: cp, end: cp, gi }); }
    segs.push({ start: 0xFFFF, end: 0xFFFF, gi: 0, last: true });
    const sc = segs.length, sub = Bin();
    const esel = Math.floor(Math.log2(sc)), srange = 2 ** esel * 2;
    sub.u16(4); sub.u16(16 + sc * 8); sub.u16(0); sub.u16(sc * 2); sub.u16(srange); sub.u16(esel); sub.u16(sc * 2 - srange);
    for (const s of segs) sub.u16(s.end); sub.u16(0); for (const s of segs) sub.u16(s.start);
    for (const s of segs) sub.u16(s.last ? 1 : ((s.gi - s.start) + 65536) % 65536); for (const s of segs) sub.u16(0);
    const cmap = Bin(); cmap.u16(0); cmap.u16(2); cmap.u16(0); cmap.u16(3); cmap.u32(20); cmap.u16(3); cmap.u16(1); cmap.u32(20); cmap.bytes(sub.out());
    // name
    const fam = (familyName || 'Ductus').replace(/[^\x20-\x7e]/g, '').slice(0, 40) || 'Ductus';
    const ps = fam.replace(/[^A-Za-z0-9]/g, '') + '-Regular';
    const names = [[1, fam], [2, 'Regular'], [3, 'DUCTUS:' + fam], [4, fam + ' Regular'], [5, 'Version 1.0'], [6, ps]];
    const recs = [], strs = Bin();
    for (const [id, s] of names) { const off = strs.length; for (const ch of s) strs.u8(ch.charCodeAt(0)); recs.push([1, 0, 0, id, s.length, off]); }
    for (const [id, s] of names) { const off = strs.length; for (const ch of s) strs.u16(ch.charCodeAt(0)); recs.push([3, 1, 0x409, id, s.length * 2, off]); }
    const name = Bin(); name.u16(0); name.u16(recs.length); name.u16(6 + recs.length * 12);
    for (const r of recs) { name.u16(r[0]); name.u16(r[1]); name.u16(r[2]); name.u16(r[3]); name.u16(r[4]); name.u16(r[5]); }
    name.bytes(strs.out());
    const post = Bin(); post.u32(0x00030000); post.u32(0); post.i16(-100); post.i16(50); post.u32(0); for (let i = 0; i < 4; i++) post.u32(0);
    // assemble
    const tables = [['OS/2', os2.out()], ['cmap', cmap.out()], ['glyf', glyf.out()], ['head', head.out()], ['hhea', hhea.out()], ['hmtx', hmtx.out()], ['loca', locaB.out()], ['maxp', maxp.out()], ['name', name.out()], ['post', post.out()]];
    const pad4 = b => { const o = new Uint8Array(Math.ceil(b.length / 4) * 4); o.set(b); return o; };
    const csum = b => { let s = 0; for (let i = 0; i < b.length; i += 4) s = (s + ((b[i] << 24 | b[i + 1] << 16 | b[i + 2] << 8 | b[i + 3]) >>> 0)) >>> 0; return s; };
    const nt = tables.length, es = Math.floor(Math.log2(nt)), sr = 2 ** es * 16;
    const dir = Bin(); dir.u32(0x00010000); dir.u16(nt); dir.u16(sr); dir.u16(es); dir.u16(nt * 16 - sr);
    let off = 12 + nt * 16; const padded = [];
    for (const [tag, b] of tables) { const p = pad4(b); padded.push(p); dir.tag(tag); dir.u32(csum(p)); dir.u32(off); dir.u32(b.length); off += p.length; }
    const out = new Uint8Array(off); out.set(dir.out()); let o = 12 + nt * 16; let headOff = 0;
    tables.forEach(([tag], i) => { if (tag === 'head') headOff = o; out.set(padded[i], o); o += padded[i].length; });
    const adj = (0xB1B0AFBA - csum(out)) >>> 0;
    out[headOff + 8] = adj >>> 24; out[headOff + 9] = (adj >>> 16) & 255; out[headOff + 10] = (adj >>> 8) & 255; out[headOff + 11] = adj & 255;
    return out;
  }

  const api = { makeScript, recastGlyph, analyzeDoodle, glyphPaths, drawPaths, renderText, drawGlyph, layout, encodeScript, decodeScript, buildFont, hashStr, LETTERS, DIGITS, GEN_CHARS, rng, NX, NY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Ductus = api;
})(typeof window !== 'undefined' ? window : globalThis);
