/* Browser stubs thin enough that the REAL shipping index.html runs in node,
   unmodified. The point is that a test can never drift from a reimplementation
   of the app: there is only ever one copy of the code under test.

   Lives in test/lib/ rather than test/ because design/test-all.mjs runs every
   .mjs directly inside test/ as a test of its own. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function makeCtx(w, h) {
  const noop = () => {};
  return {
    canvas: { width: w, height: h },
    save: noop, restore: noop, translate: noop, scale: noop, setTransform: noop,
    beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop, arc: noop,
    ellipse: noop, rect: noop, quadraticCurveTo: noop, clip: noop,
    fill: noop, stroke: noop, fillRect: noop, strokeRect: noop, fillText: noop,
    /* width scaled by the font actually set, so a bubble measured before its
       font is applied comes out visibly wrong here too rather than passing */
    font: '',
    measureText(t) {
      const px = /(\d+(?:\.\d+)?)px/.exec(this.font || '');
      const size = px ? parseFloat(px[1]) : 10;
      return { width: String(t).length * size * 0.48 };
    },
    isPointInPath: () => false,
    fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: '', lineJoin: '',
    textAlign: '', textBaseline: '',
  };
}

function makeEl(id) {
  const el = {
    id, style: {}, children: [], dataset: {}, attrs: {},
    textContent: '', value: '', disabled: false, hidden: false,
    width: 380, height: 600,
    className: '', onclick: null, onchange: null,
    set innerHTML(v) { this.children = []; }, get innerHTML() { return ''; },
    appendChild(c) { this.children.push(c); return c; },
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return c; },
    remove() {},
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    removeAttribute(k) { delete this.attrs[k]; },
    hasAttribute(k) { return k in this.attrs; },
    addEventListener() {}, removeEventListener() {},
    setPointerCapture() {}, releasePointerCapture() {},
    click() { if (this.onclick) this.onclick({ target: this }); },
    focus() {}, blur() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 380, height: 600 }; },
    getContext() { return makeCtx(this.width, this.height); },
    toBlob(cb) { cb(null); },
    get parentElement() { return this; },
  };
  return el;
}

/* Loads the real app and returns whatever it hangs on window.__comiccrew. */
export function loadApp(htmlUrl) {
  const path = typeof htmlUrl === 'string' ? htmlUrl : fileURLToPath(htmlUrl);
  const src = readFileSync(path, 'utf8');
  const scripts = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  if (!scripts.length) throw new Error('no inline script found in ' + path);

  const els = new Map();
  const get = (id) => { if (!els.has(id)) els.set(id, makeEl(id)); return els.get(id); };

  const store = new Map();
  const listeners = new Map();

  global.window = {
    devicePixelRatio: 2,
    addEventListener(t, f) { (listeners.get(t) || listeners.set(t, []).get(t)).push(f); },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    print() {},
    visualViewport: null,
  };
  global.addEventListener = (t, f) => {
    if (!listeners.has(t)) listeners.set(t, []);
    listeners.get(t).push(f);
  };
  global.requestAnimationFrame = () => 0;
  global.setTimeout = global.setTimeout;
  global.document = {
    hidden: false,
    getElementById: get,
    createElement: () => makeEl(''),
    body: makeEl('body'),
    activeElement: null,
    addEventListener() {},
    fonts: { ready: { then: () => ({ catch: () => {} }) } },
  };
  global.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
  /* node 24 defines navigator as a getter only, so it has to be redefined
     rather than assigned */
  Object.defineProperty(global, 'navigator', {
    value: { storage: null, share: null, canShare: null, serviceWorker: null },
    configurable: true, writable: true,
  });
  global.performance = { now: () => Number(process.hrtime.bigint()) / 1e6 };
  global.Path2D = class { moveTo() {} lineTo() {} arc() {} closePath() {} };
  global.FileReader = class { readAsText() {} };
  global.Blob = class {};
  global.File = class {};
  global.URL.createObjectURL = () => '';
  global.URL.revokeObjectURL = () => {};

  /* only the app script: the studio seam below it is deliberately not run,
     because the fleet's whole reason for putting it in a second script is that
     it must never be able to stop the app */
  new Function(scripts[0])();
  const api = global.window.__comiccrew;
  if (!api) throw new Error('app did not expose window.__comiccrew');
  api.__els = els;
  api.__storage = store;
  return api;
}

/* ---- fixtures: bodies a child might actually draw ---- */
export function fixtures(API) {
  const { S, cloneJ } = API;
  const R = cloneJ(S.rest);
  const st = (pts) => ({ layer: 'body', slot: 0, pts, bind: null, cell: null });

  function limb(a, b, hw0, hw1) {
    const A = R[a], B = R[b];
    let dx = B[0] - A[0], dy = B[1] - A[1];
    const L = Math.hypot(dx, dy); dx /= L; dy /= L;
    const nx = -dy, ny = dx, out = [];
    for (const sd of [1, -1]) {
      const pts = [];
      for (let t = 0; t <= 1.0001; t += 0.1) {
        const hw = hw0 + (hw1 - hw0) * t;
        pts.push([A[0] + dx * L * t + nx * hw * sd, A[1] + dy * L * t + ny * hw * sd, 6]);
      }
      out.push(st(pts));
    }
    return out;
  }
  function ring(cx, cy, rx, ry) {
    const pts = [];
    for (let a = 0; a <= Math.PI * 2 + 0.01; a += Math.PI / 14)
      pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, 6]);
    return [st(pts)];
  }
  function line(a, b) {
    const A = R[a], B = R[b], pts = [];
    for (let t = 0; t <= 1.0001; t += 0.1)
      pts.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, 6]);
    return [st(pts)];
  }

  function shaped(k) {
    return [].concat(
      k.feet ? ring(R.lank[0] - 14 * k.feet, R.lank[1] + 30 * k.feet, 36 * k.feet, 22 * k.feet) : [],
      k.feet ? ring(R.rank[0] + 14 * k.feet, R.rank[1] + 30 * k.feet, 36 * k.feet, 22 * k.feet) : [],
      ring(500, 222, 84 * k.head, 84 * k.head),
      limb('hip', 'neck', 58 * k.torso, 48 * k.torso),
      limb('lsho', 'lelb', 24 * k.arm, 20 * k.arm), limb('lelb', 'lwri', 20 * k.arm, 15 * k.arm),
      limb('rsho', 'relb', 24 * k.armR, 20 * k.armR), limb('relb', 'rwri', 20 * k.armR, 15 * k.armR),
      limb('lhip', 'lkne', 30 * k.leg, 25 * k.leg), limb('lkne', 'lank', 25 * k.leg, 18 * k.leg),
      limb('rhip', 'rkne', 30 * k.leg, 25 * k.leg), limb('rkne', 'rank', 25 * k.leg, 18 * k.leg),
      ring(R.lwri[0], R.lwri[1], 20 * k.arm, 20 * k.arm),
      ring(R.rwri[0], R.rwri[1], 20 * k.armR, 20 * k.armR));
  }

  return {
    /* the bench body: outlined torso and limbs, wide enough that the chest
       contour sits nearer the collarbone than the spine, which is the exact
       shape that used to collapse */
    bench: () => [].concat(
      ring(500, 222, 84, 84),
      limb('hip', 'neck', 62, 62),
      limb('lsho', 'lelb', 26, 26), limb('lelb', 'lwri', 21, 21),
      limb('rsho', 'relb', 26, 26), limb('relb', 'rwri', 21, 21),
      limb('lhip', 'lkne', 32, 32), limb('lkne', 'lank', 25, 25),
      limb('rhip', 'rkne', 32, 32), limb('rkne', 'rank', 25, 25)),
    potato: () => shaped({ head: 1.15, torso: 1.5, arm: 1.5, armR: 1.5, leg: 1.35, feet: 1.35 }),
    stick: () => shaped({ head: 0.7, torso: 0.42, arm: 0.4, armR: 0.4, leg: 0.48, feet: 0 }),
    lopside: () => shaped({ head: 0.95, torso: 0.95, arm: 0.55, armR: 1.9, leg: 1.0, feet: 1.0 }),
    /* one line per limb and a circle for the head: the likeliest first drawing
       in the whole app, and the one garments used to collapse on */
    single: () => [].concat(
      ring(500, 222, 70, 70),
      line('hip', 'neck'),
      line('lsho', 'lelb'), line('lelb', 'lwri'),
      line('rsho', 'relb'), line('relb', 'rwri'),
      line('lhip', 'lkne'), line('lkne', 'lank'),
      line('rhip', 'rkne'), line('rkne', 'rank')),
  };
}

/* ---- a tiny assertion runner so failures name themselves ---- */
export function runner(title) {
  const fails = [];
  let n = 0;
  return {
    ok(cond, msg) { n++; if (!cond) fails.push(msg); },
    eq(a, b, msg) { n++; if (a !== b) fails.push(`${msg}: got ${a}, wanted ${b}`); },
    near(a, b, tol, msg) { n++; if (!(Math.abs(a - b) <= tol)) fails.push(`${msg}: got ${a}, wanted ${b} +/- ${tol}`); },
    atLeast(a, b, msg) { n++; if (!(a >= b)) fails.push(`${msg}: got ${a}, wanted at least ${b}`); },
    done() {
      if (fails.length) {
        console.error(`${title}: ${fails.length} of ${n} checks failed`);
        fails.forEach((f) => console.error('  ' + f));
        process.exit(1);
      }
      console.log(`${title}: ${n} checks passed`);
    },
  };
}
