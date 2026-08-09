// Secret Santa — draw with exclusions, per-person private reveal links.
import {
  parseRoster, drawNames, blamePair, validAssignment,
  encodeReveal, decodeReveal, isRevealHash, ROSTER_MAX,
} from './helpers.js';

const CONFIG = { tipUrl: 'https://buy.stripe.com/4gM8wQa1P2CX7vD1XH7EQ0f' };
const STORE_KEY = 'sws.secret-santa.v1';

const $ = (id) => document.getElementById(id);
function el(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  if (attrs) for (const k of Object.keys(attrs)) {
    const v = attrs[k];
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) n.setAttribute(k, v);
  }
  for (const kid of kids.flat(9)) {
    if (kid === null || kid === undefined) continue;
    n.append(kid.nodeType ? kid : document.createTextNode(kid));
  }
  return n;
}
/* The studio runtime owns the toast (and the undo inside it). Keep working if
   it ever fails to load rather than throwing on a name tap. */
const say = (msg, opts) => (window.SWS && window.SWS.toast ? window.SWS.toast(msg, opts) : null);
const sayUndo = (msg, fn, opts) => (window.SWS && window.SWS.undo
  ? window.SWS.undo(msg, fn, opts) : say(msg));

async function copyText(text, okMsg) {
  try { await navigator.clipboard.writeText(text); say(okMsg || 'Copied'); }
  catch (e) { say('Could not copy — long-press the link row to select it instead.'); }
}

let names = [];
let exclusions = [];    // pairs of NAMES — editing the list must never remap couples
let pendingPick = null; // a name, while picking the second half of a pair
let lastPicked = null;  // the chip focus goes back to after the picker rebuilds
let drawn = null;       // the draw itself: { names, assignment, pairNames, event, budget, sent, changed, isRedraw }

/* ───────────────────────── persistence ─────────────────────────
   The roster, the no-match rules and the finished draw survive a reload, a
   closed tab and tomorrow morning. Nothing leaves this browser. */
let saveTimer = null;
function save(quiet) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      v: 1,
      namesText: $('names').value,
      event: $('eventInput').value,
      budget: $('budgetInput').value,
      exclusions,
      drawn,
    }));
  } catch (e) { /* private mode or a full quota — the app still works */ }
  if (!quiet && window.SWS && window.SWS.saved) window.SWS.saved();
}
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => save(), 700);
}

function cleanDrawn(d) {
  if (!d || typeof d !== 'object') return null;
  if (!Array.isArray(d.names) || !Array.isArray(d.assignment)) return null;
  if (d.names.length < 2 || d.names.length !== d.assignment.length) return null;
  if (!d.names.every((n) => typeof n === 'string' && n)) return null;
  if (!d.assignment.every((i) => Number.isInteger(i) && i >= 0 && i < d.names.length)) return null;
  const strings = (a) => (Array.isArray(a) ? a.filter((x) => typeof x === 'string') : []);
  return {
    names: d.names.slice(),
    assignment: d.assignment.slice(),
    pairNames: (Array.isArray(d.pairNames) ? d.pairNames : [])
      .filter((p) => Array.isArray(p) && typeof p[0] === 'string' && typeof p[1] === 'string')
      .map((p) => [p[0], p[1]]),
    event: typeof d.event === 'string' ? d.event : '',
    budget: typeof d.budget === 'string' ? d.budget : '',
    sent: strings(d.sent),
    changed: strings(d.changed),
    isRedraw: !!d.isRedraw,
  };
}
function restore() {
  let raw = null;
  try { raw = localStorage.getItem(STORE_KEY); } catch (e) { return; }
  if (!raw) return;
  let o = null;
  try { o = JSON.parse(raw); } catch (e) { return; }   // half-written value: start clean
  if (!o || typeof o !== 'object') return;
  if (typeof o.namesText === 'string') $('names').value = o.namesText;
  if (typeof o.event === 'string') $('eventInput').value = o.event;
  if (typeof o.budget === 'string') $('budgetInput').value = o.budget;
  exclusions = (Array.isArray(o.exclusions) ? o.exclusions : [])
    .filter((p) => Array.isArray(p) && typeof p[0] === 'string' && typeof p[1] === 'string')
    .map((p) => [p[0], p[1]]);
  drawn = cleanDrawn(o.drawn);
}

function baseUrl() {
  return location.origin === 'null' || location.protocol === 'file:'
    ? location.href.split('#')[0]
    : location.origin + location.pathname;
}

const samePair = (p, a, b) => (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a);

/* ───────────────────────── the roster ───────────────────────── */
function readRoster() {
  const report = parseRoster($('names').value);
  names = report.names;
  const notes = [];
  if (report.skipped) {
    notes.push('Only the first ' + ROSTER_MAX + ' names were added — ' +
      report.skipped + ' more ' + (report.skipped === 1 ? 'line was' : 'lines were') + ' left out.');
  }
  if (report.merged.length) {
    notes.push('Two lines said “' + report.merged.slice(0, 3).join('”, “') +
      '” — only one of each was added. Add a surname to tell them apart.');
  }
  if (report.shortened.length) {
    notes.push('Shortened to 40 characters: “' + report.shortened.slice(0, 2).join('”, “') + '”.');
  }
  const note = $('namesNote');
  const text = notes.join(' ');
  if (note.textContent !== text) {           // only speak when something changed
    note.textContent = text;
    note.classList.toggle('hidden', !text);
  }
  return report;
}

/* ───────────────────────── no-match pairs ───────────────────────── */
function pickName(name) {
  lastPicked = name;
  if (pendingPick === null) {
    pendingPick = name;
    renderExclusions();
    say(name + ' selected — now tap who ' + name + ' must not draw.');
    return;
  }
  if (pendingPick === name) {
    pendingPick = null;
    renderExclusions();
    say(name + ' unselected.');
    return;
  }
  const first = pendingPick;
  pendingPick = null;
  if (exclusions.some((p) => samePair(p, first, name))) {
    renderExclusions();
    say(first + ' and ' + name + ' are already a no-match pair.');
    return;
  }
  const before = exclusions.map((p) => p.slice());
  exclusions.push([first, name]);
  renderExclusions();
  save(true);
  sayUndo(first + ' and ' + name + ' won’t draw each other.', () => {
    exclusions = before;
    renderExclusions();
    save(true);
  });
}

function removePair(a, b) {
  const before = exclusions.map((p) => p.slice());
  exclusions = exclusions.filter((p) => !samePair(p, a, b));
  renderExclusions();
  save(true);
  sayUndo('Removed the no-match rule ' + a + ' ⛔ ' + b + '.', () => {
    exclusions = before;
    renderExclusions();
    save(true);
  });
}

function renderExclusions() {
  const picker = $('exclPicker');
  const hadFocus = picker.contains(document.activeElement);
  picker.replaceChildren();
  const chips = new Map();
  for (const name of names) {
    const on = pendingPick === name;
    const chip = el('button', {
      class: 'chip' + (on ? ' sel' : ''),
      type: 'button',
      'aria-pressed': on ? 'true' : 'false',
      onclick: () => pickName(name),
    }, name);
    chips.set(name, chip);
    picker.append(chip);
  }
  $('exclEmpty').classList.toggle('hidden', names.length > 0);
  /* Rebuilding the picker used to drop keyboard focus on <body>, so the second
     half of a pair meant tabbing the whole page again. */
  if (hadFocus && lastPicked && chips.has(lastPicked)) chips.get(lastPicked).focus();

  const list = $('exclList');
  list.replaceChildren();
  let shown = 0;
  for (const [a, b] of exclusions) {
    if (!names.includes(a) || !names.includes(b)) continue;
    shown++;
    list.append(el('li', {},
      el('span', { class: 'grow', text: a + ' ⛔ ' + b }),
      el('button', {
        class: 'btn small', type: 'button',
        'aria-label': 'Remove the no-match rule ' + a + ' and ' + b,
        onclick: () => removePair(a, b),
      }, '✕')));
  }
  $('exclCount').textContent = shown
    ? shown + (shown === 1 ? ' no-match rule' : ' no-match rules')
    : '';
}

/* ───────────────────────── the draw ───────────────────────── */
function warn(msg) {
  const w = $('drawWarn');
  w.classList.remove('hidden');
  w.textContent = msg;
}
function clearWarn() {
  const w = $('drawWarn');
  w.classList.add('hidden');
  w.textContent = '';
}

function runDraw() {
  readRoster();
  clearWarn();
  exclusions = exclusions.filter(([a, b]) => names.includes(a) && names.includes(b));
  const pairs = exclusions.map(([a, b]) => [names.indexOf(a), names.indexOf(b)]);

  if (names.length < 3) {
    warn('You need at least three people for a proper Secret Santa. ' +
      (names.length === 0 ? 'The names box is empty.'
        : 'There ' + (names.length === 1 ? 'is 1 name' : 'are ' + names.length + ' names') + ' in the box.'));
    return;
  }
  const assignment = drawNames(names, pairs, undefined);
  if (!assignment) {
    const blame = blamePair(names.length, pairs);
    warn(blame
      ? names[blame[0]] + ' and ' + names[blame[1]] + ' can’t both be excluded here — with ' +
        names.length + ' people there is no valid draw. Remove that pair and draw again.'
      : 'These ' + pairs.length + ' no-match rules cannot all be satisfied with ' + names.length +
        ' people. Remove one pair and try again.');
    return;
  }

  const previous = drawn;
  const prevMatch = new Map();
  if (previous) {
    previous.names.forEach((n, i) => prevMatch.set(n, previous.names[previous.assignment[i]]));
  }
  const changed = [];
  names.forEach((santa, i) => {
    if (previous && prevMatch.get(santa) !== names[assignment[i]]) changed.push(santa);
  });
  /* A person whose match changed has a dead link in someone's chat thread, so
     their "sent" tick is a lie now. Only unchanged people keep theirs. */
  const keptSent = previous
    ? previous.sent.filter((n) => names.includes(n) && !changed.includes(n)) : [];

  drawn = {
    names: names.slice(),
    assignment: assignment.slice(),
    pairNames: exclusions.map((p) => p.slice()),
    event: $('eventInput').value.trim(),
    budget: $('budgetInput').value.trim(),
    sent: keptSent,
    changed: previous ? changed : [],
    isRedraw: !!previous,
  };
  renderResults();
  save(true);
  $('resultsHeading').focus();

  if (previous) {
    sayUndo(changed.length + ' of ' + names.length + ' links changed — those people need the new one.',
      () => { drawn = previous; renderResults(); save(true); },
      { label: 'Undo re-draw' });
  } else {
    say(names.length + ' links ready. Send each one privately.');
  }
}

function rosterChangedSinceDraw() {
  if (!drawn) return false;
  if (drawn.names.length !== names.length) return true;
  return drawn.names.some((n, i) => n !== names[i]);
}

function renderResults() {
  const results = $('results');
  if (!drawn) {
    results.classList.add('hidden');
    $('linkList').replaceChildren();
    $('slips').replaceChildren();
    $('drawBtn').textContent = '🎁 Draw names';
    return;
  }
  const d = drawn;
  const list = $('linkList');
  const slips = $('slips');
  list.replaceChildren();
  slips.replaceChildren();

  d.names.forEach((santa, i) => {
    const gets = d.names[d.assignment[i]];
    const url = baseUrl() + '#r.' + encodeReveal({ santa, gets, event: d.event, budget: d.budget });
    const msg = '🎁 ' + santa + ', your Secret Santa draw' +
      (d.event ? ' for ' + d.event : '') +
      ' is ready! Open your private link (no peeking at others’): ' + url;

    const row = el('li', { class: 'linkrow' });
    const label = el('span', { class: 'grow' }, el('span', { class: 'who', text: santa }));
    if (d.isRedraw) {
      const isNew = d.changed.includes(santa);
      label.append(el('span', {
        class: 'tag' + (isNew ? ' tag-new' : ''),
        text: isNew ? 'new link — re-send' : 'unchanged',
      }));
    }
    row.append(label);

    /* Painted in place, never by rebuilding the list — a re-render here would
       throw focus off the button that was just pressed. */
    const sentBtn = el('button', { class: 'btn small sentbtn', type: 'button' });
    const paintSent = () => {
      const on = d.sent.includes(santa);
      sentBtn.className = 'btn small sentbtn' + (on ? ' on' : '');
      sentBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      sentBtn.setAttribute('aria-label', (on ? 'Sent to ' : 'Mark as sent to ') + santa);
      sentBtn.textContent = on ? '✓ Sent' : 'Sent';
      row.classList.toggle('is-sent', on);
    };
    const markSent = (on) => {
      const at = d.sent.indexOf(santa);
      if (on && at < 0) d.sent.push(santa);
      if (!on && at >= 0) d.sent.splice(at, 1);
      paintSent();
      save(true);
    };
    sentBtn.addEventListener('click', () => markSent(!d.sent.includes(santa)));
    paintSent();
    row.append(sentBtn);

    row.append(el('button', {
      class: 'btn small', type: 'button',
      'aria-label': 'Copy the message for ' + santa,
      onclick: () => {
        copyText(msg, 'Message for ' + santa + ' copied — paste it into their text thread');
        markSent(true);
      },
    }, 'Copy message'));

    row.append(el('button', {
      class: 'btn small', type: 'button',
      'aria-label': 'Show a QR code for ' + santa,
      onclick: () => { showQr(url, santa); markSent(true); },
    }, 'QR'));

    list.append(row);

    /* Paper mode: one fold-over slip per person, name outside, match inside. */
    slips.append(el('div', { class: 'slip' },
      el('div', { class: 'slipTop' },
        el('strong', { text: santa }),
        el('span', {
          class: 'slipEvent',
          text: [d.event, d.budget && ('Budget: ' + d.budget)].filter(Boolean).join(' · '),
        })),
      el('div', { class: 'slipFold', 'aria-hidden': 'true', text: '— — — fold — — —' }),
      el('div', { class: 'slipBottom' },
        el('span', { text: 'You are the Secret Santa for' }),
        el('strong', { text: gets }))));
  });

  /* The proof. The correctness was always there; it was just invisible. */
  const idx = d.pairNames
    .map(([a, b]) => [d.names.indexOf(a), d.names.indexOf(b)])
    .filter(([a, b]) => a >= 0 && b >= 0);
  const sound = validAssignment(d.names, idx, d.assignment);
  $('proof').textContent = sound
    ? d.names.length + ' people · everyone gives once · everyone receives once · ' +
      'nobody drew themselves · ' + idx.length +
      (idx.length === 1 ? ' no-match rule respected' : ' no-match rules respected')
    : 'This draw did not pass its own check — draw again before sending anything.';
  $('proof').classList.toggle('warn', !sound);

  const stale = rosterChangedSinceDraw();
  $('staleNote').classList.toggle('hidden', !stale);
  $('drawBtn').textContent = stale ? '🎁 Re-draw with the new list' : '🎲 Re-draw everyone';
  results.classList.remove('hidden');
}

/* ───────────────────────── the reveal ───────────────────────── */
function showReveal(data) {
  $('organizer').classList.add('hidden');
  $('linkErr').classList.add('hidden');
  $('reveal').classList.remove('hidden');
  $('revealWho').textContent = data.santa + ', you drew a name…';
  $('revealEvent').textContent = [data.event, data.budget && ('Budget: ' + data.budget)]
    .filter(Boolean).join(' · ');

  const btn = $('revealBtn');
  const nameEl = $('revealName');
  const note = $('revealNote');
  let shown = false;
  const paint = () => {
    btn.setAttribute('aria-expanded', shown ? 'true' : 'false');
    btn.textContent = shown ? '🙈 Hide it again' : '🎁 Tap to reveal your person';
    nameEl.classList.toggle('hidden', !shown);
    note.classList.toggle('hidden', !shown);
    nameEl.textContent = shown ? '🎄 ' + data.gets + ' 🎄' : '';
  };
  /* Deliberately NOT {once:true}: people open these links in rooms containing
     the person they drew, and covering it again has to be possible. */
  btn.addEventListener('click', () => { shown = !shown; paint(); });
  paint();
}

function showLinkError() {
  $('organizer').classList.add('hidden');
  $('reveal').classList.add('hidden');
  $('linkErr').classList.remove('hidden');
}

function showOrganizer() {
  $('reveal').classList.add('hidden');
  $('linkErr').classList.add('hidden');
  $('organizer').classList.remove('hidden');
}

function route() {
  if (!isRevealHash(location.hash)) { showOrganizer(); return; }
  const data = decodeReveal(location.hash);
  if (data) showReveal(data);
  else showLinkError();
}

/* ───────────────────────── boot ───────────────────────── */
function init() {
  if (CONFIG.tipUrl) {
    const t = $('tipLink');
    t.href = CONFIG.tipUrl;
    t.classList.remove('hidden');
  }

  restore();
  readRoster();
  renderExclusions();
  renderResults();

  $('names').addEventListener('input', () => {
    readRoster();
    exclusions = exclusions.filter(([a, b]) => names.includes(a) && names.includes(b));
    pendingPick = null;
    renderExclusions();
    /* The results used to vanish on the first keystroke, which meant fixing a
       typo destroyed every unsent link. They stay, and say they are older. */
    renderResults();
    saveSoon();
  });
  $('eventInput').addEventListener('input', saveSoon);
  $('budgetInput').addEventListener('input', saveSoon);
  $('drawBtn').addEventListener('click', runDraw);
  $('printBtn').addEventListener('click', () => window.print());
  $('linkErrBtn').addEventListener('click', () => {
    history.replaceState(null, '', location.pathname + location.search);
    route();
    $('names').focus();
  });
  $('startOver').addEventListener('click', startOver);
  window.addEventListener('hashchange', route);

  route();

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

function startOver() {
  const before = {
    namesText: $('names').value,
    event: $('eventInput').value,
    budget: $('budgetInput').value,
    exclusions: exclusions.map((p) => p.slice()),
    drawn,
  };
  $('names').value = '';
  $('eventInput').value = '';
  $('budgetInput').value = '';
  exclusions = [];
  pendingPick = null;
  drawn = null;
  readRoster();
  clearWarn();
  renderExclusions();
  renderResults();
  save(true);
  sayUndo('Cleared the group, the rules and the draw.', () => {
    $('names').value = before.namesText;
    $('eventInput').value = before.event;
    $('budgetInput').value = before.budget;
    exclusions = before.exclusions;
    drawn = before.drawn;
    readRoster();
    renderExclusions();
    renderResults();
    save(true);
  });
}

init();

/* ---------- QR share (scan instead of typing a link) ---------- */
function showQr(url, who) {
  try {
    const qr = qrcode(0, 'M');
    qr.addData(url); qr.make();
    const canvas = $('qrCanvas');
    const count = qr.getModuleCount();
    /* Size the canvas to whole modules that fit the viewport, rather than
       letting CSS resample a fixed 300px square — a resampled QR stops
       scanning, and a 300px square overflows a 320px phone. */
    const room = Math.max(180, Math.min(300, (window.innerWidth || 320) - 96));
    const cell = Math.max(2, Math.floor(room / (count + 8)));
    const size = cell * (count + 8);
    canvas.width = size; canvas.height = size;
    const off = Math.floor((size - cell * count) / 2);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#000';
    for (let r = 0; r < count; r++) for (let c = 0; c < count; c++)
      if (qr.isDark(r, c)) ctx.fillRect(off + c * cell, off + r * cell, cell, cell);
    canvas.setAttribute('aria-label', 'QR code that opens the private reveal link for ' + who);
  } catch (e) { say('Could not draw the QR'); return; }
  $('qrTitle').textContent = who + ' — scan for your private reveal';
  const d = $('qrDlg');
  try { d.showModal(); } catch (e) { d.setAttribute('open', ''); }
}
$('qrClose').addEventListener('click', () => {
  const d = $('qrDlg');
  try { d.close(); } catch (e) { d.removeAttribute('open'); }
});
