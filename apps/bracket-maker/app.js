// Bracket Maker — tap winners through a seeded single-elimination bracket.
import {
  parseEntrants, roundCount, nextPow2, contender, winnerOf, setPick,
  champion, encodeBracket, decodeBracket,
} from './helpers.js';

const CONFIG = { tipUrl: '' };

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

const KEY = 'bracket-maker';
let state = { names: [], picks: {}, title: '' };

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  try { history.replaceState(null, '', state.names.length ? '#' + encodeBracket(state) : location.pathname); }
  catch (e) {}
}
function load() {
  const fromHash = decodeBracket(location.hash);
  if (fromHash && fromHash.names.length) { state = fromHash; return; }
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && Array.isArray(d.names)) state = { names: d.names, picks: d.picks || {}, title: d.title || '' };
  } catch (e) {}
}

const ROUND_NAMES = { 1: 'Final', 2: 'Semifinals', 4: 'Quarterfinals' };

function renderBracket() {
  const box = $('bracket');
  box.replaceChildren();
  const n = state.names.length;
  $('champ').textContent = '';
  if (n < 2) return;
  const rounds = roundCount(n);
  const size = nextPow2(n);
  for (let r = 0; r < rounds; r++) {
    const matches = size / Math.pow(2, r + 1);
    const col = el('div', { class: 'round' },
      el('div', { class: 'roundhead', text: ROUND_NAMES[matches] || 'Round ' + (r + 1) }));
    for (let m = 0; m < matches; m++) {
      const a = contender(state, r, m, 0);
      const b = contender(state, r, m, 1);
      if (r === 0 && a === null && b === null) continue;
      const w = winnerOf(state, r, m);
      const side = (idx) => {
        if (idx === null) {
          const isBye = r === 0;
          return el('button', { type: 'button', class: isBye ? 'bye' : 'tbd', disabled: '' },
            isBye ? 'bye' : 'winner of earlier game');
        }
        return el('button', {
          type: 'button', class: w === idx ? 'winner' : '',
          onclick: () => {
            if (a === null || b === null) return;
            state = setPick(state, r, m, idx);
            save(); renderBracket();
          },
        }, state.names[idx]);
      };
      col.append(el('div', { class: 'match' }, side(a), side(b)));
    }
    box.append(col);
  }
  const c = champion(state);
  if (c !== null) $('champ').textContent = '🏆 ' + state.names[c];
}

function wire() {
  $('titleInput').addEventListener('input', (ev) => { state.title = ev.target.value.slice(0, 60); save(); });
  $('entrants').addEventListener('input', (ev) => {
    const names = parseEntrants(ev.target.value);
    if (JSON.stringify(names) !== JSON.stringify(state.names)) {
      state = { names, picks: {}, title: state.title };
      save();
    }
    renderBracket();
  });
  $('shareBtn').addEventListener('click', () => {
    if (state.names.length < 2) { toast('Add the entrants first'); return; }
    save();
    copyText(location.href, 'Link copied — results and all');
  });
  $('printBtn').addEventListener('click', () => {
    if (state.names.length < 2) { toast('Add the entrants first'); return; }
    window.print();
  });
  $('resetBtn').addEventListener('click', () => {
    if (Object.keys(state.picks).length === 0) { toast('No results to clear'); return; }
    if (!confirm('Clear all results and start the bracket fresh?')) return;
    state = { ...state, picks: {} };
    save(); renderBracket();
  });
}

function init() {
  wire();
  if (CONFIG.tipUrl) {
    const t = $('tipLink');
    t.href = CONFIG.tipUrl;
    t.classList.remove('hidden');
  }
  load();
  $('titleInput').value = state.title || '';
  $('entrants').value = state.names.join('\n');
  renderBracket();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
init();
