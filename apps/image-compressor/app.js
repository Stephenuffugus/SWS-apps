// Image Compressor — canvas resize + re-encode, entirely on-device.
import {
  fmtBytes, scaleDims, fitBox, coverRect, sizeDelta, fmtGrowth, outName,
  dupeKey, preflight, decodeFailure, kbToBytes,
  readExifDate, buildExifApp1, insertApp1, uniqueNames,
} from './helpers.js';
import { makeZip } from './zip.js';

const CONFIG = { tipUrl: 'https://buy.stripe.com/14AaEYfm9a5paHP7i17EQ0i' };

/* The cap is a memory ceiling, not a paywall, so it is stated in the UI before
   a single file is chosen (#addHint) and, if it ever bites, it names every
   file it could not take instead of breaking out of the loop in silence. */
const MAX_ITEMS = 200;
const PREF_KEY = 'imgc.settings.v2';
const IMAGE_RE = /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif|tiff?|svg|ico)$/i;

const $ = (id) => document.getElementById(id);
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));

function el(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  if (attrs) for (const k of Object.keys(attrs)) {
    const v = attrs[k];
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined && v !== false) n.setAttribute(k, v);
  }
  for (const kid of kids.flat(9)) {
    if (kid === null || kid === undefined || kid === false) continue;
    n.append(kid.nodeType ? kid : document.createTextNode(kid));
  }
  return n;
}

/* SWS.toast is the shared runtime's; it carries Undo and it pauses its own
   clock while the pointer or the focus is inside it. */
const toast = (msg, opts) => window.SWS.toast(msg, opts);
const plural = (n, word) => n + ' ' + word + (n === 1 ? '' : 's');

let items = [];   // {id,key,file,thumbUrl,w,h,hasAlpha,hotX,hotY,error,out,cmp}
let seq = 0;
let job = null;       // the in-flight run, so Stop has something to set
let busy = false;     // ingest or ZIP is narrating; leave the status line alone
let settingsGen = 0;  // bumped on every settings change; stamped onto results

/* ── Ingest ────────────────────────────────────────────────────────────────
   Full-resolution bitmaps are NOT retained (200 photos ≈ gigabytes of RAM on
   mobile). We keep the File and a small thumb; compression re-decodes.        */

async function readImage(file, key) {
  const bmp = await createImageBitmap(file);
  const t = document.createElement('canvas');
  const td = scaleDims(bmp.width, bmp.height, 120);
  t.width = td.w; t.height = td.h;
  const tc = t.getContext('2d', { willReadFrequently: true });
  tc.drawImage(bmp, 0, 0, td.w, td.h);
  const probe = inspect(tc, td.w, td.h);
  const meta = {
    id: 'i' + (++seq), key, file,
    thumbUrl: t.toDataURL('image/jpeg', 0.7),
    w: bmp.width, h: bmp.height,
    hasAlpha: probe.hasAlpha, hotX: probe.hotX, hotY: probe.hotY,
    error: null, out: null, cmp: null,
  };
  bmp.close && bmp.close();
  return meta;
}

/**
 * One pass over the thumbnail answers two questions at once.
 *
 *  - does this image actually use transparency? (so JPEG can warn before it
 *    quietly paints a white box behind a logo)
 *  - where is the busiest part of it? Compression artefacts show up on edges
 *    and small text, never in a clear sky, so the before/after divider opens
 *    over the highest-detail band instead of dead centre.
 */
function inspect(ctx, w, h) {
  const out = { hasAlpha: false, hotX: 0.5, hotY: 0.5 };
  let d;
  try { d = ctx.getImageData(0, 0, w, h).data; } catch { return out; }
  const BANDS = 8;
  const colScore = new Float64Array(BANDS);
  const rowScore = new Float64Array(BANDS);
  const lum = (i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (d[i + 3] < 250) out.hasAlpha = true;
      if (x + 1 >= w || y + 1 >= h) continue;
      const g = Math.abs(lum(i) - lum(i + 4)) + Math.abs(lum(i) - lum(i + w * 4));
      colScore[Math.min(BANDS - 1, (x * BANDS / w) | 0)] += g;
      rowScore[Math.min(BANDS - 1, (y * BANDS / h) | 0)] += g;
    }
  }
  const peak = (arr) => {
    let best = 0;
    for (let i = 1; i < arr.length; i++) if (arr[i] > arr[best]) best = i;
    return (best + 0.5) / arr.length;
  };
  out.hotX = Math.min(0.8, Math.max(0.2, peak(colScore)));
  out.hotY = peak(rowScore);
  return out;
}

function failedItem(file, key, why) {
  return {
    id: 'i' + (++seq), key, file, thumbUrl: null,
    w: 0, h: 0, hasAlpha: false, hotX: 0.5, hotY: 0.5,
    error: why, out: null, cmp: null,
  };
}

async function ingest(fileList) {
  const files = [...(fileList || [])];
  if (!files.length) return;

  const overCap = [];
  const dupes = [];
  const notImages = [];
  let added = 0;
  busy = true;

  for (const f of files) {
    if (!(f.type || '').startsWith('image/') && !IMAGE_RE.test(f.name || '')) { notImages.push(f.name); continue; }
    if (items.length >= MAX_ITEMS) { overCap.push(f.name); continue; }
    const key = dupeKey(f);
    if (items.some((i) => i.key === key)) { dupes.push(f.name); continue; }

    const pre = preflight(f);
    if (pre) items.push(failedItem(f, key, pre));
    else {
      try { items.push(await readImage(f, key)); }
      catch { items.push(failedItem(f, key, decodeFailure(f))); }
    }
    added++;
    setStatus('Reading ' + plural(added, 'image') + '…');
    scheduleRender();
    await frame();
  }

  busy = false;
  setStatus('');
  render();
  reportIngest(added, overCap, dupes, notImages);
}

/** Everything that was NOT added, named, on screen, and staying there. */
function reportIngest(added, overCap, dupes, notImages) {
  const box = $('notices');
  box.replaceChildren();
  const blocks = [];

  if (overCap.length) {
    blocks.push([
      'The list holds ' + MAX_ITEMS + ' images at a time and it is full, so ' +
      plural(overCap.length, 'file') + ' could not be added. Nothing is uploaded, so the ' +
      'limit is your device’s memory rather than a plan — compress and download these, ' +
      'clear the list, and the rest will go straight in.',
      nameList(overCap),
    ]);
  }
  if (dupes.length) {
    blocks.push([plural(dupes.length, 'file') + ' already in the list, so not added again.', nameList(dupes)]);
  }
  if (notImages.length) {
    blocks.push([plural(notImages.length, 'file') + ' skipped — not an image.', nameList(notImages)]);
  }

  for (const [head, names] of blocks) {
    box.append(el('div', { class: 'warn' }, el('p', { text: head }), el('p', { class: 'sub', text: names })));
  }

  const failed = items.filter((i) => i.error).length;
  if (!added && !blocks.length) return;
  let msg = added ? 'Added ' + plural(added, 'image') : 'Nothing added';
  const tail = [];
  if (failed) tail.push(plural(failed, 'file') + ' this browser cannot open — each says why on its row');
  if (overCap.length) tail.push(overCap.length + ' over the ' + MAX_ITEMS + ' limit');
  if (dupes.length) tail.push(dupes.length + ' already here');
  if (notImages.length) tail.push(notImages.length + ' not images');
  if (tail.length) msg += ' · ' + tail.join(' · ');
  toast(msg, { ms: tail.length ? 7000 : 3000 });
}

function nameList(names) {
  const shown = names.slice(0, 6).join(', ');
  return names.length > 6 ? shown + ' and ' + (names.length - 6) + ' more' : shown;
}

/* ── Settings ─────────────────────────────────────────────────────────────── */

function readSettings() {
  const mode = $('modeSeg').querySelector('[aria-pressed="true"]').dataset.mode;
  const sizeMode = $('sizeMode').value;
  const cfg = {
    mode,
    format: $('format').value,
    quality: clampInt($('quality').value, 30, 95, 80),
    meta: $('meta').value,
    sizeMode,
    maxSide: /^\d+$/.test(sizeMode) ? parseInt(sizeMode, 10) : 0,
    dimW: clampInt($('dimW').value, 1, 20000, 600),
    dimH: clampInt($('dimH').value, 1, 20000, 600),
    targetBytes: 0,
  };
  if (mode === 'target') {
    const sel = $('target').value;
    cfg.targetBytes = sel === 'custom' ? kbToBytes($('targetKb').value) : parseInt(sel, 10);
    if (!cfg.targetBytes) {
      toast('Type how many KB it has to fit under — a whole number, at least 1.', { assertive: true });
      $('targetKb').focus();
      return null;
    }
  }
  return cfg;
}

function clampInt(v, lo, hi, dflt) {
  const n = parseInt(v, 10);
  if (!isFinite(n)) return dflt;
  return Math.min(hi, Math.max(lo, n));
}

function targetLabel(cfg) {
  return cfg.targetBytes >= 1000000
    ? (cfg.targetBytes / 1000000) + ' MB'
    : Math.round(cfg.targetBytes / 1000) + ' KB';
}

/* ── Encoding ─────────────────────────────────────────────────────────────── */

const scratch = document.createElement('canvas');

function planDims(w, h, cfg) {
  if (cfg.sizeMode === 'exact') {
    const r = coverRect(w, h, cfg.dimW, cfg.dimH);
    return { dw: cfg.dimW, dh: cfg.dimH, ...r, upscaled: cfg.dimW > w || cfg.dimH > h };
  }
  if (cfg.sizeMode === 'fit') {
    const f = fitBox(w, h, cfg.dimW, cfg.dimH);
    return { dw: f.w, dh: f.h, sx: 0, sy: 0, sw: w, sh: h, upscaled: false };
  }
  const f = scaleDims(w, h, cfg.maxSide);
  return { dw: f.w, dh: f.h, sx: 0, sy: 0, sw: w, sh: h, upscaled: false };
}

const shrinkPlan = (p, f) => ({
  ...p,
  dw: Math.max(1, Math.round(p.dw * f)),
  dh: Math.max(1, Math.round(p.dh * f)),
});

async function encode(bmp, plan, format, quality) {
  scratch.width = plan.dw; scratch.height = plan.dh;
  const ctx = scratch.getContext('2d');
  ctx.clearRect(0, 0, plan.dw, plan.dh);
  // JPEG has no alpha channel, so undrawn pixels would come out black.
  if (format === 'jpeg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, plan.dw, plan.dh); }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, plan.sx, plan.sy, plan.sw, plan.sh, 0, 0, plan.dw, plan.dh);
  const type = 'image/' + format;
  let blob = await new Promise((r) => scratch.toBlob(r, type, format === 'png' ? undefined : quality));
  if (!blob || (blob.type !== type && format === 'webp')) {
    blob = await new Promise((r) => scratch.toBlob(r, 'image/jpeg', quality)); // Safari-old fallback
  }
  return blob;
}

/**
 * Binary-search the encoder until the file fits under the number the user
 * typed. This is the whole reason the "compress to 200kb" search economy
 * exists, and it is one loop.
 *
 * The first attempt uses the quality already on screen, so the ordinary batch
 * case ("everything under 1 MB") costs exactly one encode per photo and the
 * search only runs when it has to.
 */
async function findUnderTarget(bmp, basePlan, cfg, onAttempt) {
  const target = cfg.targetBytes;
  const allowShrink = cfg.sizeMode !== 'exact'; // "exactly 600×600" means exactly
  const LIMIT = 18;
  let plan = basePlan;
  let attempts = 0;
  let smallest = null;

  const track = (blob, p, q) => {
    if (blob && (!smallest || blob.size < smallest.blob.size)) smallest = { blob, plan: p, quality: q };
  };

  for (let round = 0; round < 4 && attempts < LIMIT; round++) {
    if (cfg.format === 'png') {
      const blob = await encode(bmp, plan, 'png'); attempts++; onAttempt(attempts);
      track(blob, plan, null);
      if (blob && blob.size <= target) return { blob, plan, quality: null, attempts };
    } else {
      const startQ = round === 0 ? cfg.quality : 95;
      const first = await encode(bmp, plan, cfg.format, startQ / 100); attempts++; onAttempt(attempts);
      track(first, plan, startQ);
      if (first && first.size <= target) return { blob: first, plan, quality: startQ, attempts };

      let lo = 30, hi = startQ - 1, best = null, iters = 0;
      while (lo <= hi && iters < 5 && attempts < LIMIT) {
        const q = (lo + hi) >> 1;
        const blob = await encode(bmp, plan, cfg.format, q / 100);
        attempts++; iters++; onAttempt(attempts);
        track(blob, plan, q);
        if (blob && blob.size <= target) { best = { blob, plan, quality: q }; lo = q + 1; }
        else hi = q - 1;
      }
      if (best) return { ...best, attempts };
    }

    if (!allowShrink || !smallest) break;
    const factor = Math.min(0.85, Math.max(0.3, Math.sqrt(target / smallest.blob.size) * 0.95));
    const next = shrinkPlan(plan, factor);
    if (next.dw < 16 || next.dh < 16 || (next.dw === plan.dw && next.dh === plan.dh)) break;
    plan = next;
  }

  return smallest ? { ...smallest, missed: true, attempts } : null;
}

/** Only ever asked when a re-encode inflated: is there a format that would not? */
async function betterOption(bmp, plan, cfg, originalSize) {
  if (cfg.format === 'webp') return null;
  try {
    const alt = await encode(bmp, plan, 'webp', 0.85);
    if (!alt || alt.type !== 'image/webp') return null;
    if (alt.size < originalSize * 0.9) {
      return 'WebP would be ' + Math.round(100 * (1 - alt.size / originalSize)) +
        '% smaller than the original here (' + fmtBytes(alt.size) + '). Switch Format to WebP and press Compress again.';
    }
  } catch { /* the suggestion is a bonus, never a failure path */ }
  return null;
}

async function keepDate(file, blob) {
  if (!/jpe?g/i.test(file.type) && !/\.jpe?g$/i.test(file.name)) return blob;
  try {
    const date = readExifDate(await file.arrayBuffer());
    const app1 = buildExifApp1(date);
    if (!app1) return blob;
    const bytes = insertApp1(new Uint8Array(await blob.arrayBuffer()), app1);
    return new Blob([bytes], { type: 'image/jpeg' });
  } catch { return blob; }
}

async function compressOne(item, cfg, onAttempt) {
  const bmp = await createImageBitmap(item.file);
  let res;
  try {
    const plan = planDims(bmp.width, bmp.height, cfg);
    if (cfg.mode === 'target') {
      res = await findUnderTarget(bmp, plan, cfg, onAttempt);
    } else {
      const blob = await encode(bmp, plan, cfg.format, cfg.quality / 100);
      onAttempt(1);
      res = blob ? { blob, plan, quality: cfg.quality } : null;
    }
    if (!res || !res.blob) throw new Error('encoder returned nothing');

    let blob = res.blob;
    let ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
    if (cfg.meta === 'date' && ext === 'jpg') blob = await keepDate(item.file, blob);

    const notes = [];
    let good = false;

    /* THE HARD PROMISE: this app never hands back something worse than it was
       given. Canvas PNG is unquantised lossless RGBA and routinely inflates —
       measured at 6.4 MB → 21.5 MB — and the old code printed "Done" over it. */
    if (blob.size >= item.file.size) {
      const advice = await betterOption(bmp, res.plan, cfg, item.file.size);
      const delta = sizeDelta(item.file.size, blob.size);
      notes.push(
        delta.dir === 'bigger'
          ? 'Kept your original: re-encoding as ' + cfg.format.toUpperCase() + ' would have made it ' +
            fmtGrowth(delta.times) + ' (' + fmtBytes(blob.size) + ').'
          : 'Kept your original — it is already as small as this browser can make it.');
      if (advice) notes.push(advice);
      const origExt = (item.file.name.match(/\.([^.]+)$/) || [, 'jpg'])[1];
      item.out = {
        blob: item.file, ext: origExt, name: item.file.name, kept: true,
        w: item.w, h: item.h, quality: null, gen: settingsGen,
        notes, good: false,
      };
      return;
    }

    if (res.missed) {
      notes.push('Could not reach ' + targetLabel(cfg) + '. This is the smallest this browser can ' +
        'produce at ' + res.plan.dw + '×' + res.plan.dh + ': ' + fmtBytes(blob.size) + '. ' +
        (cfg.format === 'jpeg' ? 'WebP usually gets 25–35% further.'
          : cfg.sizeMode === 'exact' ? 'The pixel size is pinned, so quality is the only lever left.'
            : 'Try a smaller pixel size.'));
    } else if (cfg.mode === 'target') {
      good = true;
      notes.push('Under ' + targetLabel(cfg) + ' as asked — landed at ' + fmtBytes(blob.size) +
        (res.quality ? ' at quality ' + res.quality + '%' : '') + '.');
    }
    if (res.plan.upscaled) {
      notes.push('Enlarged from ' + item.w + '×' + item.h + ' to reach the size you asked for, so it will look soft.');
    }
    if (item.hasAlpha && cfg.format === 'jpeg') {
      notes.push('This image had transparent areas and JPEG cannot store them, so they were filled with white. ' +
        'Choose WebP or PNG to keep the transparency.');
    }
    if (cfg.meta === 'date' && ext !== 'jpg') {
      notes.push('The date taken can only be carried over into JPEG, so this ' + ext.toUpperCase() + ' has no metadata at all.');
    }

    item.out = {
      blob, ext, name: outName(item.file.name, ext), kept: false,
      w: res.plan.dw, h: res.plan.dh, quality: res.quality, gen: settingsGen,
      notes, good,
    };
  } finally {
    bmp.close && bmp.close();
    // The old preview URL now points at a blob nobody wants. rev is part of the
    // row signature, so the row is rebuilt and the panel makes a fresh one.
    item.rev = (item.rev || 0) + 1;
    if (item.cmp) { revoke(item.cmp.outUrl); item.cmp.outUrl = null; }
  }
}

/* ── Saving ───────────────────────────────────────────────────────────────── */

function download(blob, filename) {
  const a = el('a', { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

const revoke = (u) => { if (u) { try { URL.revokeObjectURL(u); } catch { /* already gone */ } } };

function zipName() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return 'compressed-' + d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '.zip';
}

async function downloadAll() {
  const ready = items.filter((i) => i.out && i.out.blob);
  if (!ready.length) return;
  if (ready.length === 1) {
    download(ready[0].out.blob, ready[0].out.name);
    toast('Saved ' + ready[0].out.name);
    return;
  }
  busy = true;
  syncActions();
  setStatus('Packing ' + plural(ready.length, 'image') + ' into one file…');
  try {
    const names = uniqueNames(ready.map((i) => i.out.name));
    const zip = await makeZip(
      ready.map((i, k) => ({ name: names[k], blob: i.out.blob })),
      (d, t) => setStatus('Packing ' + d + ' of ' + t + '…'));
    download(zip, zipName());
    toast(plural(ready.length, 'image') + ' in one ZIP, ' + fmtBytes(zip.size) +
      ' — a single download, so the browser never asks you to allow anything.', { ms: 6000 });
  } catch (e) {
    toast(String(e && e.message) === 'ZIP_TOO_LARGE'
      ? 'That batch is over 4 GB, which is more than a plain ZIP can hold. Save them in two halves, or use Save on each row.'
      : 'Could not build the ZIP. Use Save on each row instead — the files themselves are fine.',
      { assertive: true, ms: 8000 });
  } finally {
    busy = false;
    setStatus('');
    syncActions();
  }
}

/* ── The run ──────────────────────────────────────────────────────────────── */

function setRunning(on) {
  const btn = $('runBtn');
  btn.textContent = on ? 'Stop' : 'Compress';
  btn.classList.toggle('danger', on);
  btn.classList.toggle('primary', !on);
  // Never disabled: disabling the focused button is what threw focus to <body>
  // after every run, and it is also how the old build hid Cancel.
  $('addBtn').disabled = on;
  $('clearBtn').disabled = on || !items.length;
  $('allBtn').disabled = on || !items.some((i) => i.out);
}

async function run() {
  if (job) { job.cancel = true; setStatus('Stopping…'); return; }
  const queue = items.filter((i) => !i.error);
  if (!queue.length) return;
  const cfg = readSettings();
  if (!cfg) return;

  job = { cancel: false };
  setRunning(true);
  toast('Compressing ' + plural(queue.length, 'image') + '…', { ms: 2000 });

  let done = 0;
  for (const item of queue) {
    if (job.cancel) break;
    setStatus(queue.length > 1
      ? 'Compressing ' + (done + 1) + ' of ' + queue.length + ' — ' + item.file.name
      : 'Compressing ' + item.file.name + '…');
    try {
      await compressOne(item, cfg, (n) => {
        if (n > 1) setStatus('Compressing ' + (done + 1) + ' of ' + queue.length +
          ' — trying settings to fit under ' + targetLabel(cfg) + ' (attempt ' + n + ')');
      });
    } catch {
      item.out = null;
      item.error = decodeFailure(item.file);
    }
    done++;
    scheduleRender();
    await frame();
  }

  const stopped = job.cancel;
  job = null;
  setRunning(false);
  setStatus('');
  render();
  summarise(queue.slice(0, done), stopped, queue.length - done);

  // Focus is the results' front door. render() rebuilds the list, so if nothing
  // else claimed focus, put it back on the button that was just pressed.
  if (document.activeElement === document.body) $('runBtn').focus();
}

function summarise(handled, stopped, remaining) {
  const shrunk = handled.filter((i) => i.out && !i.out.kept);
  const kept = handled.filter((i) => i.out && i.out.kept);
  const failed = handled.filter((i) => !i.out);
  const before = shrunk.reduce((a, i) => a + i.file.size, 0);
  const after = shrunk.reduce((a, i) => a + i.out.blob.size, 0);
  const d = sizeDelta(before, after);

  const parts = [];
  if (stopped) parts.push('Stopped after ' + plural(handled.length, 'image'));
  else parts.push('Done — ' + plural(handled.length, 'image'));
  if (shrunk.length) parts.push(fmtBytes(before) + ' → ' + fmtBytes(after) + ' (' + d.pct + '% smaller)');
  if (kept.length) parts.push(kept.length + ' left untouched, because compressing would have made ' +
    (kept.length === 1 ? 'it' : 'them') + ' bigger');
  if (failed.length) parts.push(plural(failed.length, 'file') + ' could not be read');
  if (remaining > 0) parts.push(remaining + ' still waiting');

  const late = items.filter((i) => !i.error && !i.out).length - Math.max(0, remaining);
  if (!stopped && late > 0) {
    parts.push(plural(late, 'image') + ' arrived mid-run and were not touched — press Compress again');
  }
  toast(parts.join(' · '), { ms: 8000 });
}

/* ── Rendering ────────────────────────────────────────────────────────────── */

let renderPending = false;
let lastRender = 0;
function scheduleRender() {
  if (renderPending) return;
  renderPending = true;
  setTimeout(() => { renderPending = false; render(); }, Math.max(0, 120 - (Date.now() - lastRender)));
}

/** Which control had focus, keyed on something that survives a rebuild. */
function focusKey() {
  const a = document.activeElement;
  const holder = a && a.closest && a.closest('[data-fk]');
  return holder ? holder.getAttribute('data-fk') : null;
}

/**
 * Everything a row displays, as one string. Rebuilding 200 rows — each with a
 * data-URL thumbnail to decode — on every tick of a run is what turns a smooth
 * batch into a stuttering one, so a row whose signature has not moved keeps the
 * node it already has.
 */
function rowSig(item) {
  const o = item.out;
  return [
    item.id, settingsGen, item.rev || 0,
    item.error ? item.error.reason + (item.error.retry === false ? '|noretry' : '') : '',
    o ? [o.blob.size, o.w, o.h, o.kept, o.gen, o.name, o.notes.length, o.good].join('|') : '',
    item.cmp && item.cmp.open ? 'cmp' + (item.cmp.zoom ? ':zoom' : '') : '',
  ].join('~');
}

function render() {
  lastRender = Date.now();
  const list = $('list');
  const key = focusKey();

  const failed = items.filter((i) => i.error).length;
  $('emptyHint').classList.toggle('hidden', items.length > 0);
  $('listHead').textContent = items.length
    ? plural(items.length, 'image') + (failed ? ' · ' + failed + ' this browser cannot open' : '')
    : 'Images';

  const nodes = items.map((item) => {
    const sig = rowSig(item);
    if (item.node && item.sig === sig) return item.node;
    item.node = item.error ? failedRow(item) : imageRow(item);
    item.sig = sig;
    return item.node;
  });

  const unchanged = list.childNodes.length === nodes.length &&
    nodes.every((n, i) => list.childNodes[i] === n);
  if (!unchanged) {
    list.replaceChildren(...nodes);
    if (key) {
      const back = list.querySelector('[data-fk="' + CSS.escape(key) + '"]');
      if (back) back.focus({ preventScroll: true });
    }
  }
  syncActions();
}

function syncActions() {
  if (job) return;                       // setRunning owns the buttons mid-run
  const usable = items.filter((i) => !i.error).length;
  const ready = items.some((i) => i.out);
  $('runBtn').disabled = usable === 0;
  $('allBtn').disabled = busy || !ready;
  $('clearBtn').disabled = busy || items.length === 0;
  $('allBtn').textContent = items.filter((i) => i.out).length === 1
    ? 'Download the image' : 'Download all as a ZIP';
  if (busy) return;
  /* A disabled control with its reason permanently beside it is something you
     can read at your own speed; a toast that teaches by failing is not. */
  setStatus(items.length === 0
    ? 'Add images to turn Compress on.'
    : usable === 0 ? 'None of these can be opened by this browser.'
      : !ready ? 'Press Compress, then Save or download the ZIP.' : '');
}

const setStatus = (t) => { $('runStatus').textContent = t; };

function failedRow(item) {
  return el('li', {},
    el('div', { class: 'thumb failed', 'aria-hidden': 'true' }, '!'),
    el('div', { class: 'grow' },
      el('div', { class: 'rowname', text: item.file.name }),
      el('span', { class: 'rownote' },
        item.error.reason,
        item.error.fix ? el('br') : null,
        item.error.fix || null)),
    el('div', { class: 'rowacts' },
      item.error.retry === false ? null : el('button', {
        class: 'btn rowbtn', type: 'button', 'data-fk': item.id + ':retry',
        'aria-label': 'Try ' + item.file.name + ' again',
        onclick: () => retry(item),
      }, 'Try again'),
      removeButton(item)));
}

function imageRow(item) {
  const out = item.out;
  const img = el('img', { class: 'thumb', alt: '', loading: 'lazy' });
  if (item.thumbUrl && item.thumbUrl.startsWith('data:image/')) img.src = item.thumbUrl;

  const numbers = el('div', { class: 'sub numbers' },
    item.w + '×' + item.h + ' · ' + fmtBytes(item.file.size));
  if (out) {
    const d = sizeDelta(item.file.size, out.blob.size);
    numbers.append(
      el('span', { class: 'arrow', 'aria-hidden': 'true' }, '→'),
      el('span', { class: 'sr-only' }, ' becomes '),
      out.w + '×' + out.h + ' · ' + fmtBytes(out.blob.size) + ' ');
    if (out.kept) numbers.append(el('span', { class: 'kept', text: '· original kept' }));
    else if (d.dir === 'smaller') numbers.append(el('span', { class: 'savings', text: d.pct + '% smaller' }));
    else numbers.append(el('span', { class: 'grew', text: fmtGrowth(d.times) }));
  }

  const notes = [];
  if (out) {
    for (const n of out.notes) notes.push(el('span', { class: 'rownote' + (out.good ? ' good' : ''), text: n }));
    if (out.gen !== settingsGen) {
      notes.push(el('span', { class: 'rownote', text: 'The settings changed after this ran, so this result is from the old ones. Press Compress to redo it.' }));
    }
  }

  const acts = el('div', { class: 'rowacts' });
  if (out) {
    acts.append(el('button', {
      class: 'btn rowbtn', type: 'button', 'data-fk': item.id + ':cmp',
      'aria-expanded': item.cmp && item.cmp.open ? 'true' : 'false',
      'aria-label': (item.cmp && item.cmp.open ? 'Hide the comparison for ' : 'Compare before and after for ') + item.file.name,
      onclick: () => toggleCompare(item),
    }, item.cmp && item.cmp.open ? 'Hide' : 'Compare'));
    acts.append(el('button', {
      class: 'btn rowbtn', type: 'button', 'data-fk': item.id + ':save',
      'aria-label': 'Save ' + out.name,
      onclick: () => { download(out.blob, out.name); toast('Saved ' + out.name, { ms: 2500 }); },
    }, 'Save'));
  }
  acts.append(removeButton(item));

  return el('li', {},
    img,
    el('div', { class: 'grow' }, el('div', { class: 'rowname', text: item.file.name }), numbers, notes),
    acts,
    out && item.cmp && item.cmp.open ? comparePanel(item) : null);
}

function removeButton(item) {
  return el('button', {
    class: 'btn icon rowbtn', type: 'button', 'data-fk': item.id + ':rm',
    'aria-label': 'Remove ' + item.file.name + ' from the list',
    onclick: () => removeItem(item),
  }, '✕');
}

/* ── Before / after ───────────────────────────────────────────────────────── */

function toggleCompare(item) {
  if (item.cmp && item.cmp.open) {
    item.cmp.open = false;
  } else {
    item.cmp = item.cmp || { split: Math.round(item.hotX * 100), zoom: false, srcUrl: null, outUrl: null };
    item.cmp.open = true;
    if (!item.cmp.srcUrl) item.cmp.srcUrl = URL.createObjectURL(item.file);
    if (!item.cmp.outUrl) item.cmp.outUrl = URL.createObjectURL(item.out.blob);
  }
  render();
}

function comparePanel(item) {
  const c = item.cmp;
  const out = item.out;
  if (!c.srcUrl) c.srcUrl = URL.createObjectURL(item.file);
  if (!c.outUrl) c.outUrl = URL.createObjectURL(out.blob);
  const before = el('img', { class: 'before', src: c.srcUrl, alt: 'The original ' + item.file.name });
  const after = el('img', { class: 'after', src: c.outUrl, alt: 'The compressed version of ' + item.file.name });
  const divider = el('div', { class: 'cmp-divider', 'aria-hidden': 'true' });
  const stage = el('div', { class: 'cmp-stage' }, before, after, divider);
  stage.style.aspectRatio = out.w + ' / ' + out.h;
  if (c.zoom) stage.style.width = out.w + 'px';

  const paint = (pct) => {
    after.style.clipPath = 'inset(0 0 0 ' + pct + '%)';
    divider.style.left = pct + '%';
  };
  paint(c.split);

  const view = el('div', { class: 'cmp-view' }, stage);
  if (c.zoom) {
    requestAnimationFrame(() => {
      view.scrollLeft = Math.max(0, out.w * item.hotX - view.clientWidth / 2);
      view.scrollTop = Math.max(0, out.h * item.hotY - view.clientHeight / 2);
    });
  }

  const slider = el('input', {
    type: 'range', min: '0', max: '100', step: '1', value: String(c.split),
    'data-fk': item.id + ':split',
    'aria-label': 'Wipe between the original and the compressed version of ' + item.file.name,
    oninput: (e) => { c.split = parseInt(e.target.value, 10); paint(c.split); },
  });

  return el('div', { class: 'cmp fullrow', role: 'group', 'aria-label': 'Before and after, ' + item.file.name },
    el('div', { class: 'cmp-legend' },
      el('span', { text: 'Left: original, ' + item.w + '×' + item.h + ' · ' + fmtBytes(item.file.size) }),
      el('span', { text: 'Right: ' + (out.kept ? 'your original, kept' : 'compressed') + ', ' + out.w + '×' + out.h + ' · ' + fmtBytes(out.blob.size) })),
    view,
    el('div', { class: 'cmp-controls' },
      slider,
      el('button', {
        class: 'btn rowbtn', type: 'button', 'data-fk': item.id + ':zoom',
        'aria-pressed': c.zoom ? 'true' : 'false',
        onclick: () => { c.zoom = !c.zoom; render(); },
      }, c.zoom ? 'Fit to width' : 'Actual pixels')),
    el('p', { class: 'hint', text: 'The grey behind the photograph is a fixed mid-grey in both themes, ' +
      'because a tinted surround changes how you judge colour. The divider opens over the busiest part ' +
      'of the picture — that is where compression shows first.' }));
}

/* ── Queue editing ────────────────────────────────────────────────────────── */

function removeItem(item) {
  const at = items.indexOf(item);
  if (at < 0) return;
  items.splice(at, 1);
  render();
  window.SWS.undo('Removed ' + item.file.name, () => {
    if (!items.some((i) => i.id === item.id)) items.splice(Math.min(at, items.length), 0, item);
    render();
  });
}

function clearAll() {
  if (!items.length) return;
  const snapshot = items.slice();   // a snapshot cannot forget a side effect
  items = [];
  render();
  window.SWS.undo(plural(snapshot.length, 'image') + ' cleared', () => {
    items = snapshot;
    render();
  });
}

async function retry(item) {
  const at = items.indexOf(item);
  if (at < 0) return;
  try {
    const fresh = await readImage(item.file, item.key);
    items[at] = fresh;
    toast('Opened ' + item.file.name + ' this time.');
  } catch {
    item.error = decodeFailure(item.file);
    item.error.retry = false;
    toast('Still cannot open ' + item.file.name + '. That file is not going to work here.', { assertive: true });
  }
  render();
}

/* ── Drops, pastes, and the drop that used to destroy everything ──────────── */

async function walkEntry(entry, out, depth) {
  if (!entry || out.length > MAX_ITEMS * 2 || depth > 6) return;
  if (entry.isFile) {
    await new Promise((res) => entry.file((f) => { out.push(f); res(); }, res));
  } else if (entry.isDirectory) {
    const reader = entry.createReader();
    for (let guard = 0; guard < 64; guard++) {
      const batch = await new Promise((res) => reader.readEntries(res, () => res([])));
      if (!batch.length) break;
      for (const e of batch) await walkEntry(e, out, depth + 1);
    }
  }
}

async function filesFromDrop(dt) {
  const out = [];
  const entries = [...(dt.items || [])]
    .map((i) => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null))
    .filter(Boolean);
  if (entries.length) {
    for (const e of entries) await walkEntry(e, out, 0);
    if (out.length) return out;
  }
  return [...(dt.files || [])];
}

/* ── Persistence: the recipe, never the pictures ──────────────────────────── */

const PERSISTED = ['target', 'targetKb', 'quality', 'sizeMode', 'format', 'meta', 'dimW', 'dimH'];

function saveSettings() {
  try {
    const out = { mode: $('modeSeg').querySelector('[aria-pressed="true"]').dataset.mode };
    for (const id of PERSISTED) out[id] = $(id).value;
    localStorage.setItem(PREF_KEY, JSON.stringify(out));
  } catch { /* private mode, a full disk — the app still works */ }
}

function loadSettings() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(PREF_KEY) || 'null'); }
  catch { saved = null; }
  if (!saved || typeof saved !== 'object') return;
  for (const id of PERSISTED) {
    const node = $(id);
    const v = saved[id];
    if (typeof v !== 'string') continue;
    if (node.tagName === 'SELECT') {
      if ([...node.options].some((o) => o.value === v)) node.value = v;
    } else if (/^\d+$/.test(v)) {
      node.value = v;
    }
  }
  if (saved.mode === 'quality' || saved.mode === 'target') setMode(saved.mode);
}

function setMode(mode) {
  for (const b of $('modeSeg').querySelectorAll('button')) {
    b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
  }
  $('targetPane').classList.toggle('hidden', mode !== 'target');
  $('qualityPane').classList.toggle('hidden', mode !== 'quality');
}

function syncSettingsUI() {
  const sizeMode = $('sizeMode').value;
  const custom = sizeMode === 'fit' || sizeMode === 'exact';
  $('dimRow').classList.toggle('hidden', !custom);
  $('dimHint').classList.toggle('hidden', !custom);
  $('dimHint').textContent = sizeMode === 'exact'
    ? 'The picture is centred and cropped to fill exactly these pixels — this is what passport, ' +
      'visa and avatar forms mean when they say 600×600.'
    : 'The picture is scaled to fit inside this box and keeps its shape, so one side is usually smaller ' +
      'than the number you typed. Nothing is cropped and nothing is enlarged.';

  $('customWrap').classList.toggle('hidden', $('target').value !== 'custom');

  const fmt = $('format').value;
  $('formatHint').classList.remove('hidden');
  $('formatHint').textContent = fmt === 'png'
    ? 'PNG here is lossless and unquantised, so for photographs it is usually LARGER than the original. ' +
      'It is the right choice only for flat graphics with transparency — and if it does inflate, ' +
      'this app keeps your original file instead and says so on the row.'
    : fmt === 'webp'
      ? 'WebP is typically 25–35% smaller than JPEG at the same quality and keeps transparency. ' +
        'Every current browser reads it; a few very old apps do not.'
      : 'JPEG is understood by everything and is the safe answer for photographs and for forms. ' +
        'It has no transparency, so any transparent area is filled with white.';

  $('metaHint').textContent = $('meta').value === 'date'
    ? 'The date the photo was taken is copied into the new JPEG so your photo library still sorts it ' +
      'correctly instead of filing every copy under today. Location, camera make and model are still ' +
      'removed. WebP and PNG output carry nothing either way.'
    : 'GPS coordinates, camera make and model, serial numbers and the date are all dropped — the ' +
      're-encode simply does not carry them. Safest for a passport scan; it is also why compressed ' +
      'photos can land in a camera roll under today’s date.';

  $('qLabel').textContent = $('quality').value + '%';
  $('quality').setAttribute('aria-valuetext', $('quality').value + '% quality');
}

/* ── Wiring ───────────────────────────────────────────────────────────────── */

function markSettingsChanged() {
  settingsGen++;
  syncSettingsUI();
  saveSettings();
  if (items.some((i) => i.out)) render();
}

function wire() {
  $('addBtn').addEventListener('click', () => $('fileInput').click());
  $('fileInput').addEventListener('change', async (ev) => {
    const files = [...(ev.target.files || [])];
    ev.target.value = '';
    await ingest(files);
  });

  $('runBtn').addEventListener('click', run);
  $('allBtn').addEventListener('click', downloadAll);
  $('clearBtn').addEventListener('click', clearAll);

  for (const b of $('modeSeg').querySelectorAll('button')) {
    b.addEventListener('click', () => { setMode(b.dataset.mode); markSettingsChanged(); });
  }
  for (const id of PERSISTED) {
    $(id).addEventListener('change', markSettingsChanged);
  }
  $('quality').addEventListener('input', () => {
    $('qLabel').textContent = $('quality').value + '%';
    $('quality').setAttribute('aria-valuetext', $('quality').value + '% quality');
  });
  for (const chip of $('qChips').querySelectorAll('button')) {
    chip.addEventListener('click', () => { $('quality').value = chip.dataset.q; markSettingsChanged(); });
  }

  /* Without a drop handler the browser default takes over: a dropped photo
     navigates the tab to that image and the whole queue, compressed results
     and all, is gone. This is the defensive half. */
  let depth = 0;
  document.addEventListener('dragenter', (e) => {
    if (!e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return;
    e.preventDefault(); depth++; $('dropCard').classList.add('dropping');
  });
  document.addEventListener('dragover', (e) => {
    if (!e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
  });
  document.addEventListener('dragleave', () => {
    if (--depth <= 0) { depth = 0; $('dropCard').classList.remove('dropping'); }
  });
  document.addEventListener('drop', async (e) => {
    e.preventDefault();
    depth = 0; $('dropCard').classList.remove('dropping');
    if (!e.dataTransfer) return;
    await ingest(await filesFromDrop(e.dataTransfer));
  });

  document.addEventListener('paste', (e) => {
    const target = e.target;
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    const files = [...((e.clipboardData && e.clipboardData.files) || [])];
    if (!files.length) return;
    e.preventDefault();
    ingest(files);
  });

  /* Session-only is the correct privacy posture — but it should be a choice,
     not a surprise on an accidental back-swipe. */
  window.addEventListener('beforeunload', (e) => {
    if (!items.length) return;
    e.preventDefault();
    e.returnValue = '';
  });
}

function init() {
  loadSettings();
  syncSettingsUI();
  wire();
  if (CONFIG.tipUrl) {
    const t = $('tipLink');
    t.href = CONFIG.tipUrl;
    t.classList.remove('hidden');
  }
  render();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
init();
