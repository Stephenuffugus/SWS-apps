// Minimal browser stubs so the real inkbones file runs unmodified in node.
const fs = require('fs');

function makeEl() {
  const el = {
    style: {}, children: [],
    set innerHTML(v) { this.children = []; }, get innerHTML() { return ''; },
    textContent: '',
    appendChild(c) { this.children.push(c); return c; },
    setAttribute() {}, getAttribute() { return null; },
    addEventListener() {}, setPointerCapture() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 380, height: 600 }; },
    getContext() { return makeCtx(); },
    click() {}, focus() {},
    width: 380, height: 600,
    toBlob(cb) { cb({}); },
    get parentElement() { return this; },
  };
  return el;
}
function makeCtx() {
  const noop = () => {};
  return new Proxy({ canvas: { width: 380, height: 600 } }, {
    get(t, k) { return k in t ? t[k] : noop; },
    set(t, k, v) { t[k] = v; return true; },
  });
}

global.window = {
  devicePixelRatio: 2,
  addEventListener() {},
};
global.document = {
  getElementById: () => makeEl(),
  createElement: () => makeEl(),
};
global.Path2D = class { constructor() {} moveTo() {} lineTo() {} arc() {} closePath() {} };
global.FileReader = class { readAsText() {} };
global.Blob = class {};
global.URL = { createObjectURL: () => '', revokeObjectURL: () => {} };
global.performance = { now: () => Number(process.hrtime.bigint()) / 1e6 };

const src = fs.readFileSync(process.argv[2] || '/mnt/user-data/outputs/inkbones-v3.html', 'utf8');
const js = src.match(/<script>([\s\S]*?)<\/script>/)[1];
new Function(js)();
module.exports = global.window.__inkbones;
