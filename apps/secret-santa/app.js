// Secret Santa — draw with exclusions, per-person private reveal links.
import {
  parseNames, drawNames, encodeReveal, decodeReveal, isRevealHash,
} from './helpers.js';

const CONFIG = { tipUrl: 'https://buy.stripe.com/4gM8wQa1P2CX7vD1XH7EQ0f' };

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
let toastTimer = null;
function toast(msg, ms) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms || 2400);
}
async function copyText(text, okMsg) {
  try { await navigator.clipboard.writeText(text); toast(okMsg || 'Copied'); }
  catch (e) { toast('Could not copy'); }
}

let names = [];
let exclusions = [];   // pairs of NAMES — editing the list must never remap couples
let pendingPick = null; // a name, while picking the second half of a pair

function baseUrl() {
  return location.origin === 'null' || location.protocol === 'file:'
    ? location.href.split('#')[0]
    : location.origin + location.pathname;
}

const samePair = (p, a, b) => (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a);

function renderExclusions() {
  const picker = $('exclPicker');
  picker.replaceChildren();
  for (const name of names) {
    picker.append(el('button', {
      class: 'chip' + (pendingPick === name ? ' sel' : ''), type: 'button',
      onclick: () => {
        if (pendingPick === null) pendingPick = name;
        else if (pendingPick === name) pendingPick = null;
        else {
          if (!exclusions.some(p => samePair(p, pendingPick, name)))
            exclusions.push([pendingPick, name]);
          pendingPick = null;
        }
        renderExclusions();
      },
    }, name));
  }
  const list = $('exclList');
  list.replaceChildren();
  exclusions.forEach(([a, b], idx) => {
    if (!names.includes(a) || !names.includes(b)) return;
    list.append(el('li', {},
      el('span', { class: 'grow', text: a + ' ⛔ ' + b }),
      el('button', { class: 'btn small', type: 'button', 'aria-label': 'Remove pair',
        onclick: () => { exclusions.splice(idx, 1); renderExclusions(); } }, '✕')));
  });
}

function draw() {
  names = parseNames($('names').value);
  // resolve name pairs to CURRENT indices at draw time
  const valid = exclusions
    .map(([a, b]) => [names.indexOf(a), names.indexOf(b)])
    .filter(([a, b]) => a >= 0 && b >= 0);
  $('drawWarn').classList.add('hidden');
  if (names.length < 3) {
    $('drawWarn').textContent = 'You need at least three people for a proper Secret Santa.';
    $('drawWarn').classList.remove('hidden');
    return;
  }
  const assignment = drawNames(names, valid, undefined);
  if (!assignment) {
    $('drawWarn').textContent = 'Those no-match rules make a draw impossible — remove one pair and try again.';
    $('drawWarn').classList.remove('hidden');
    $('results').classList.add('hidden');
    return;
  }
  const eventName = $('eventInput').value.trim();
  const budget = $('budgetInput').value.trim();
  const list = $('linkList');
  list.replaceChildren();
  names.forEach((santa, i) => {
    const url = baseUrl() + '#r.' + encodeReveal({
      santa, gets: names[assignment[i]], event: eventName, budget,
    });
    const msg = '🎁 ' + santa + ', your Secret Santa draw' +
      (eventName ? ' for ' + eventName : '') + ' is ready! Open your private link (no peeking at others’): ' + url;
    list.append(el('li', {},
      el('span', { class: 'grow', text: santa }),
      el('button', { class: 'btn small', type: 'button',
        onclick: () => copyText(msg, 'Message for ' + santa + ' copied — paste it into their text thread') },
        'Copy their message')));
  });
  $('results').classList.remove('hidden');
  toast('Names drawn! Send each link privately.');
}

function showReveal(data) {
  $('organizer').classList.add('hidden');
  $('reveal').classList.remove('hidden');
  $('revealWho').textContent = data.santa + ', you drew a name…';
  $('revealEvent').textContent = [data.event, data.budget && ('Budget: ' + data.budget)]
    .filter(Boolean).join(' · ');
  $('revealBtn').addEventListener('click', () => {
    $('revealBtn').classList.add('hidden');
    $('revealName').textContent = '🎄 ' + data.gets + ' 🎄';
    $('revealName').classList.remove('hidden');
    $('revealNote').classList.remove('hidden');
  }, { once: true });
}

function init() {
  if (CONFIG.tipUrl) {
    const t = $('tipLink');
    t.href = CONFIG.tipUrl;
    t.classList.remove('hidden');
  }
  if (isRevealHash(location.hash)) {
    const data = decodeReveal(location.hash);
    if (data) { showReveal(data); return; }
  }
  $('names').addEventListener('input', () => {
    names = parseNames($('names').value);
    exclusions = exclusions.filter(([a, b]) => names.includes(a) && names.includes(b));
    pendingPick = null;
    $('results').classList.add('hidden');
    renderExclusions();
  });
  $('drawBtn').addEventListener('click', draw);
  renderExclusions();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
init();
