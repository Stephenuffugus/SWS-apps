// Unit + fuzz tests for the pure logic inside apps/bill-splitter/index.html
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const m = html.match(/\/\*__PURE_START__\*\/([\s\S]*?)\/\*__PURE_END__\*\//);
assert.ok(m, 'pure block markers found');
const pureSrc = m[1];

function makeCtx({ withCompression = true } = {}) {
  const sandbox = {
    console, btoa, atob, TextEncoder, TextDecoder, Blob, Response,
    crypto, Math, JSON, Intl, Number, String, Array, Object, Set, isFinite, parseFloat,
  };
  if (withCompression) {
    sandbox.CompressionStream = CompressionStream;
    sandbox.DecompressionStream = DecompressionStream;
  }
  const ctx = vm.createContext(sandbox);
  vm.runInContext(pureSrc, ctx);
  // const-declared modules are lexical, not globals, surface them for tests
  vm.runInContext('globalThis.Pay = Pay; globalThis.B64U = B64U;', ctx);
  return ctx;
}

const C = makeCtx();
let passed = 0;
function ok(name, fn) {
  try { fn(); passed++; }
  catch (e) { console.error('FAIL:', name, '\n ', e.message); process.exitCode = 1; }
}

/* ---------- parseAmount ---------- */
ok('parseAmount basics', () => {
  assert.equal(C.parseAmount('12.34'), 1234);
  assert.equal(C.parseAmount('$1,234.56'), 123456);
  assert.equal(C.parseAmount('12'), 1200);
  assert.equal(C.parseAmount('.5'), 50);
  assert.equal(C.parseAmount(' 7.1 '), 710);
  assert.equal(C.parseAmount(''), null);
  assert.equal(C.parseAmount('abc'), null);
  assert.equal(C.parseAmount('-5'), null);
  assert.equal(C.parseAmount('.'), null);
  assert.equal(C.parseAmount('1.2.3'), null);
  assert.equal(C.parseAmount('999999999'), null); // over cap
});
ok('parseAmount comma-decimal styles (review finding 1)', () => {
  assert.equal(C.parseAmount('12,50'), 1250);      // EU decimal comma
  assert.equal(C.parseAmount('12,5'), 1250);
  assert.equal(C.parseAmount('1,234'), 123400);    // thousands
  assert.equal(C.parseAmount('1,234,567'), 123456700);
  assert.equal(C.parseAmount('1,234.56'), 123456); // US full
  assert.equal(C.parseAmount('1.234,56'), 123456); // EU full
});
ok('parseDecimal for rates/percents', () => {
  assert.equal(C.parseDecimal('1,08'), 1.08);
  assert.equal(C.parseDecimal('20,5'), 20.5);
  assert.equal(C.parseDecimal('1.5'), 1.5);
  assert.equal(C.parseDecimal(''), null);
  assert.equal(C.parseDecimal('abc'), null);
  assert.equal(C.parseDecimal('0'), 0);
});

/* ---------- splitEven / allocateProportional ---------- */
ok('splitEven remainder', () => {
  assert.deepEqual(C.splitEven(1000, 3), [334, 333, 333]);
  assert.deepEqual(C.splitEven(0, 3), [0, 0, 0]);
  assert.equal(C.splitEven(5, 0).length, 0); // cross-realm [] fails deepEqual
});
ok('allocateProportional exact sums', () => {
  assert.deepEqual(C.allocateProportional(100, [1, 1, 1]).reduce((a, b) => a + b), 100);
  assert.deepEqual(C.allocateProportional(1001, [2, 1]), [667, 334]);
  assert.deepEqual(C.allocateProportional(300, [1250, 250]), [250, 50]);
  assert.deepEqual(C.allocateProportional(100, [0, 0]), [50, 50]); // zero weights -> even
  assert.deepEqual(C.allocateProportional(0, [5, 3]), [0, 0]);
});
ok('allocateProportional fuzz: sums always exact', () => {
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let t = 0; t < 500; t++) {
    const n = 1 + Math.floor(rnd() * 12);
    const weights = Array.from({ length: n }, () => Math.floor(rnd() * 10));
    const total = Math.floor(rnd() * 100000);
    const parts = C.allocateProportional(total, weights);
    assert.equal(parts.length, n);
    assert.equal(parts.reduce((a, b) => a + b, 0), total, `weights=${weights} total=${total}`);
    for (const p of parts) assert.ok(p >= 0);
  }
});

/* ---------- dinner ---------- */
function mkState(mode) { return C.newState(mode); }
function addPeople(s, names) {
  for (const nm of names) s.people.push({ id: 'p' + nm, name: nm, venmo: '', cashtag: '', paypal: '' });
}

ok('dinner even split with pct tip', () => {
  const s = mkState('dinner');
  addPeople(s, ['A', 'B']);
  s.dinner.billCents = 5000; s.dinner.taxCents = 450;
  s.dinner.tipMode = 'pct'; s.dinner.tipValue = 20;
  const r = C.dinnerCompute(s);
  assert.equal(r.tip, 1000);
  assert.equal(r.total, 6450);
  assert.deepEqual([r.shares.pA, r.shares.pB], [3225, 3225]);
});
ok('dinner odd cent: exact sum, one-cent spread, and it does not always land on the first person', () => {
  // Review finding: splitEven filled from index 0, so the first-added person
  // absorbed every remainder on every item -- 60c over 60 items at 3 people.
  let firstGotIt = 0;
  const ids = [];
  for (let k = 0; k < 40; k++) {
    const s = mkState('dinner');
    s.id = 'split' + k;
    addPeople(s, ['A', 'B', 'C']);
    s.dinner.billCents = 1000;
    const r = C.dinnerCompute(s);
    const parts = [r.shares.pA, r.shares.pB, r.shares.pC];
    assert.equal(parts.reduce((a, b) => a + b, 0), r.total, 'shares sum to the total exactly');
    assert.equal(Math.max(...parts) - Math.min(...parts), 1, 'spread is one cent');
    if (parts[0] === 334) firstGotIt++;
    ids.push(parts.indexOf(334));
  }
  assert.ok(firstGotIt < 40, 'the first person does not absorb every remainder');
  assert.ok(new Set(ids).size > 1, 'the odd cent rotates between people');
});

ok('rounding bias does not accumulate on one person over many items', () => {
  const s = mkState('dinner');
  s.id = 'bias-check';
  addPeople(s, ['A', 'B', 'C']);
  s.dinner.splitMode = 'items';
  for (let i = 0; i < 60; i++) s.dinner.items.push({ id: 'it' + i, label: '', cents: 1000, by: [] });
  const r = C.dinnerCompute(s);
  const parts = [r.shares.pA, r.shares.pB, r.shares.pC];
  assert.equal(parts.reduce((a, b) => a + b, 0), r.total);
  // measured before the fix: 60 cents. The remainder now rotates per item id.
  assert.ok(Math.max(...parts) - Math.min(...parts) <= 20,
    'spread over 60 shared items stays small, was 60c: ' + parts.join('/'));
});

/* ---------- zero-decimal currencies ---------- */
ok('moneyUnit / quantize follow the currency', () => {
  assert.equal(C.moneyUnit('USD'), 1);
  assert.equal(C.moneyUnit('JPY'), 100);
  assert.equal(C.moneyUnit('KRW'), 100);
  assert.equal(C.moneyUnit('ZZ'), 1);        // unknown code falls back to 2dp
  assert.equal(C.quantize(100050, 'JPY'), 100100);
  assert.equal(C.quantize(1234, 'USD'), 1234);
});

ok('JPY dinner: displayed shares add up to the displayed total', () => {
  const s = mkState('dinner');
  s.currency = 'JPY';
  addPeople(s, ['A', 'B', 'C']);
  s.dinner.billCents = 100000;               // 1000 yen
  const r = C.dinnerCompute(s);
  const parts = [r.shares.pA, r.shares.pB, r.shares.pC];
  for (const p of parts) assert.equal(p % 100, 0, 'every share is a whole yen: ' + p);
  assert.equal(parts.reduce((a, b) => a + b, 0), r.total);
  assert.equal(r.total, 100000);
});

ok('JPY trip: balances and transfers reconcile in whole yen', () => {
  const s = mkState('trip');
  s.currency = 'JPY';
  addPeople(s, ['A', 'B', 'C']);
  s.trip.expenses = [{ id: 'e1', label: 'izakaya', cents: 100000, currency: 'JPY', rate: 1,
    baseCents: 100000, paidBy: 'pA', split: [] }];
  const r = C.tripCompute(s);
  for (const p of s.people) assert.equal(Math.abs(r.net[p.id]) % 100, 0, 'whole yen balance');
  assert.equal(s.people.reduce((a, p) => a + r.net[p.id], 0), 0);
  const transfers = C.settleUp(r.net);
  const after = {};
  for (const p of s.people) after[p.id] = r.net[p.id];
  for (const t of transfers) { after[t.from] += t.cents; after[t.to] -= t.cents; }
  for (const p of s.people) assert.equal(after[p.id], 0, 'transfers clear every balance exactly');
});

/* ---------- repayments ---------- */
ok('a recorded repayment stops the app asking for it again', () => {
  const s = mkState('trip');
  addPeople(s, ['A', 'B']);
  s.trip.expenses = [{ id: 'e1', label: 'hotel', cents: 10000, currency: 'USD', rate: 1,
    baseCents: 10000, paidBy: 'pA', split: [] }];
  let r = C.tripCompute(s);
  assert.equal(r.net.pB, -5000, 'B owes 50.00');
  s.trip.payments = [{ id: 'y1', from: 'pB', to: 'pA', cents: 5000, note: '' }];
  r = C.tripCompute(s);
  assert.equal(r.net.pB, 0, 'B is square after paying');
  assert.equal(r.net.pA, 0);
  assert.equal(r.repaid, 5000);
  assert.equal(C.settleUp(r.net).length, 0, 'nothing left to settle');
});

ok('sanitizeState round-trips repayments and drops broken ones', () => {
  const s = C.sanitizeState({
    mode: 'trip',
    people: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }],
    trip: { expenses: [], payments: [
      { id: 'p1', from: 'a', to: 'b', cents: 500 },
      { id: 'p2', from: 'a', to: 'a', cents: 500 },     // self-payment
      { id: 'p3', from: 'a', to: 'ghost', cents: 500 }, // unknown person
      { id: 'p4', from: 'a', to: 'b', cents: -5 },      // negative
    ] },
  });
  assert.equal(s.trip.payments.length, 1);
  assert.equal(s.trip.payments[0].cents, 500);
});

ok('directDebts shows who you actually owe, netted per pair', () => {
  const s = mkState('trip');
  addPeople(s, ['A', 'B', 'C']);
  s.trip.expenses = [
    { id: 'e1', label: '', cents: 3000, currency: 'USD', rate: 1, baseCents: 3000, paidBy: 'pA',
      split: [{ pid: 'pA', weight: 1 }, { pid: 'pB', weight: 1 }] },
    { id: 'e2', label: '', cents: 1000, currency: 'USD', rate: 1, baseCents: 1000, paidBy: 'pB',
      split: [{ pid: 'pA', weight: 1 }, { pid: 'pB', weight: 1 }] },
  ];
  const r = C.tripCompute(s);
  const direct = C.directDebts(r.pairwise);
  assert.equal(direct.length, 1, 'A<->B nets to a single debt');
  assert.equal(direct[0].from, 'pB');
  assert.equal(direct[0].to, 'pA');
  assert.equal(direct[0].cents, 1000);   // B owes 1500, A owes B 500
  assert.ok(!direct.some(d => d.from === 'pC' || d.to === 'pC'), 'C was in nothing and owes nobody');
});
ok('dinner items mode with proportional tax+tip', () => {
  const s = mkState('dinner');
  addPeople(s, ['A', 'B']);
  s.dinner.splitMode = 'items';
  s.dinner.items = [
    { id: 'i1', label: 'steak', cents: 1000, by: ['pA'] },
    { id: 'i2', label: 'app', cents: 500, by: [] },     // empty -> everyone
  ];
  s.dinner.taxCents = 150;
  s.dinner.tipMode = 'flat'; s.dinner.tipValue = 150;
  const r = C.dinnerCompute(s);
  assert.equal(r.subtotal, 1500);
  assert.equal(r.total, 1800);
  assert.deepEqual([r.shares.pA, r.shares.pB], [1500, 300]);
});
ok('dinner items sum always equals total (fuzz)', () => {
  let seed = 777;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let t = 0; t < 300; t++) {
    const s = mkState('dinner');
    const n = 1 + Math.floor(rnd() * 8);
    addPeople(s, Array.from({ length: n }, (_, i) => 'P' + i));
    s.dinner.splitMode = 'items';
    const items = Math.floor(rnd() * 10);
    for (let i = 0; i < items; i++) {
      const by = s.people.filter(() => rnd() < 0.5).map(p => p.id);
      s.dinner.items.push({ id: 'i' + i, label: '', cents: Math.floor(rnd() * 5000), by });
    }
    s.dinner.taxCents = Math.floor(rnd() * 1000);
    s.dinner.tipMode = rnd() < 0.5 ? 'pct' : 'flat';
    s.dinner.tipValue = s.dinner.tipMode === 'pct' ? Math.floor(rnd() * 30) : Math.floor(rnd() * 2000);
    const r = C.dinnerCompute(s);
    const sum = s.people.reduce((a, p) => a + r.shares[p.id], 0);
    assert.equal(sum, r.total, `t=${t}`);
  }
});

/* ---------- trip + settle ---------- */
ok('trip balances + settle example', () => {
  const s = mkState('trip');
  addPeople(s, ['A', 'B', 'C']);
  s.trip.expenses = [
    { id: 'e1', label: 'hotel', cents: 3000, currency: 'USD', rate: 1, baseCents: 3000, paidBy: 'pA', split: [] },
    { id: 'e2', label: 'gas', cents: 1500, currency: 'USD', rate: 1, baseCents: 1500, paidBy: 'pB',
      split: [{ pid: 'pA', weight: 1 }, { pid: 'pB', weight: 1 }] },
  ];
  const r = C.tripCompute(s);
  assert.equal(r.net.pA, 1250);
  assert.equal(r.net.pB, -250);
  assert.equal(r.net.pC, -1000);
  const transfers = C.settleUp(r.net);
  assert.equal(transfers.length, 2);
  const settled = { ...r.net };
  for (const t of transfers) { settled[t.from] += t.cents; settled[t.to] -= t.cents; }
  for (const k of Object.keys(settled)) assert.equal(settled[k], 0);
});
ok('settleUp fuzz invariants', () => {
  let seed = 424242;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let t = 0; t < 300; t++) {
    const s = mkState('trip');
    const n = 2 + Math.floor(rnd() * 8);
    addPeople(s, Array.from({ length: n }, (_, i) => 'P' + i));
    const ex = 1 + Math.floor(rnd() * 12);
    for (let i = 0; i < ex; i++) {
      const payer = s.people[Math.floor(rnd() * n)].id;
      const subset = s.people.filter(() => rnd() < 0.6);
      const split = subset.map(p => ({ pid: p.id, weight: 1 + Math.floor(rnd() * 4) }));
      const c = 1 + Math.floor(rnd() * 20000);
      s.trip.expenses.push({ id: 'e' + i, label: '', cents: c, currency: 'USD', rate: 1, baseCents: c, paidBy: payer, split });
    }
    const r = C.tripCompute(s);
    // per-expense allocation is exact, so nets sum to zero
    const netSum = s.people.reduce((a, p) => a + r.net[p.id], 0);
    assert.equal(netSum, 0, `t=${t} nets must sum to 0`);
    const transfers = C.settleUp(r.net);
    assert.ok(transfers.length <= n - 1, `t=${t} at most n-1 transfers`);
    const settled = { ...r.net };
    for (const tr of transfers) {
      assert.ok(tr.cents > 0);
      settled[tr.from] += tr.cents; settled[tr.to] -= tr.cents;
    }
    for (const p of s.people) assert.equal(settled[p.id], 0, `t=${t} everyone settles to zero`);
  }
});

/* ---------- codec round-trips ---------- */
await (async () => {
  const s = mkState('trip');
  addPeople(s, ['Alice', 'Bob', 'Carol']);
  s.name = 'Tahoe trip';
  s.people[0].venmo = 'alice-v';
  s.trip.expenses = [
    { id: 'e1', label: 'cabin', cents: 45000, currency: 'USD', rate: 1, baseCents: 45000, paidBy: 'pAlice', split: [] },
    { id: 'e2', label: 'dinner', cents: 9000, currency: 'EUR', rate: 1.08, baseCents: 9720, paidBy: 'pBob',
      split: [{ pid: 'pAlice', weight: 2 }, { pid: 'pBob', weight: 1 }] },
  ];

  try {
    const enc = await C.encodeShare(s);
    assert.ok(enc.startsWith('1.'), 'compressed path used: ' + enc.slice(0, 4));
    const dec = await C.decodeShare('#' + enc);
    assert.ok(dec, 'decodes');
    assert.equal(dec.name, 'Tahoe trip');
    assert.equal(dec.people.length, 3);
    assert.equal(dec.people[0].venmo, 'alice-v');
    assert.equal(dec.trip.expenses.length, 2);
    assert.equal(dec.trip.expenses[1].baseCents, 9720);
    assert.equal(dec.trip.expenses[1].split[0].weight, 2);
    console.log('  link length for 3-person 2-expense trip:', enc.length + 1, 'chars');
    passed++;
  } catch (e) { console.error('FAIL: codec compressed round-trip\n ', e.message); process.exitCode = 1; }

  // fallback path (no CompressionStream in context)
  try {
    const C0 = makeCtx({ withCompression: false });
    const s0 = C0.newState('dinner');
    s0.people.push({ id: 'x1', name: 'Zoë ✨', venmo: '', cashtag: '', paypal: '' });
    s0.dinner.billCents = 4200;
    const enc0 = await C0.encodeShare(s0);
    assert.ok(enc0.startsWith('0.'), 'uncompressed prefix');
    const dec0 = await C0.decodeShare(enc0);
    assert.equal(dec0.people[0].name, 'Zoë ✨', 'unicode survives');
    assert.equal(dec0.dinner.billCents, 4200);
    // cross-decode: compressed context can decode uncompressed links
    const decX = await C.decodeShare(enc0);
    assert.equal(decX.dinner.billCents, 4200);
    passed++;
  } catch (e) { console.error('FAIL: codec fallback round-trip\n ', e.message); process.exitCode = 1; }

  // garbage in -> null, never throws
  try {
    for (const bad of ['', '#', '#zzz', '#9.abc', '#1.!!!', '#0.', '#1.' + 'A'.repeat(5)]) {
      const r = await C.decodeShare(bad);
      assert.equal(r, null, 'bad input "' + bad + '" -> null');
    }
    passed++;
  } catch (e) { console.error('FAIL: codec garbage handling\n ', e.message); process.exitCode = 1; }
})();

/* ---------- sanitizeState ---------- */
ok('sanitizeState hardening', () => {
  assert.equal(C.sanitizeState(null), null);
  assert.equal(C.sanitizeState('str'), null);
  assert.equal(C.sanitizeState([1, 2]), null);
  const dirty = {
    mode: 'trip', name: 'x'.repeat(500), currency: 'usd$',
    people: Array.from({ length: 99 }, (_, i) => ({ id: 'p' + i, name: 'N' + i })),
    dinner: { splitMode: 'weird', billCents: -50, tipMode: 'pct', tipValue: 99999, paidBy: 'nope' },
    trip: { expenses: [
      { id: 'e1', label: 'ok', cents: 100, baseCents: 100, paidBy: 'p1', split: [{ pid: 'ghost', weight: 3 }, { pid: 'p2', weight: -1 }] },
      { id: 'e2', label: 'orphan', cents: 100, baseCents: 100, paidBy: 'ghost', split: [] },
    ] },
    __proto__hack: 'ignored',
  };
  const s = C.sanitizeState(dirty);
  assert.equal(s.people.length, 50, 'people capped');
  assert.equal(s.name.length, 80, 'name capped');
  assert.equal(s.currency, 'USD', 'currency cleaned');
  assert.equal(s.dinner.splitMode, 'even');
  assert.equal(s.dinner.billCents, 0, 'negative cents zeroed');
  assert.equal(s.dinner.tipValue, 0, 'tip pct over cap zeroed');
  assert.equal(s.dinner.paidBy, null, 'unknown payer nulled');
  assert.equal(s.trip.expenses.length, 1, 'orphan-payer expense dropped');
  assert.equal(s.trip.expenses[0].split.length, 0, 'ghost + non-positive-weight split entries dropped');
});
ok('sanitizeState preserves timestamps (review finding 4)', () => {
  const s = C.sanitizeState({ people: [], updatedAt: 1791234567890 });
  assert.equal(s.updatedAt, 1791234567890);
});
ok('hostile __proto__ person id is regenerated, refs translated (review finding 2)', () => {
  const s = C.sanitizeState({
    mode: 'trip',
    people: [{ id: '__proto__', name: 'Mallory' }, { id: 'pB', name: 'Bob' }],
    dinner: { paidBy: '__proto__', items: [{ id: 'i1', cents: 100, by: ['__proto__', 'pB', 'pB'] }] },
    trip: { expenses: [{ id: 'e1', cents: 2000, baseCents: 2000, paidBy: 'pB',
      split: [{ pid: '__proto__', weight: 1 }, { pid: 'pB', weight: 1 }] }] },
  });
  const mallory = s.people.find(p => p.name === 'Mallory');
  assert.ok(mallory && mallory.id !== '__proto__', 'id regenerated');
  assert.equal(s.dinner.paidBy, mallory.id, 'dinner payer translated');
  assert.deepEqual([...s.dinner.items[0].by].sort(), [mallory.id, 'pB'].sort(), 'item.by translated + deduped');
  assert.equal(s.dinner.items[0].by.length, 2, 'duplicate pB removed');
  const r = C.tripCompute(s);
  assert.equal(r.net[mallory.id], -1000, 'Mallory owes her half');
  assert.equal(r.net.pB, 1000);
  const transfers = C.settleUp(r.net);
  assert.equal(transfers.length, 1);
  assert.equal(transfers[0].cents, 1000, 'no money vanishes');
  const summary = C.buildSummary(s);
  assert.ok(!summary.includes('NaN'), 'no NaN in summary');
});
ok('sanitizeState duplicate person ids collapse', () => {
  const s = C.sanitizeState({ people: [{ id: 'a', name: 'One' }, { id: 'a', name: 'Two' }] });
  assert.equal(s.people.length, 1);
});

/* ---------- summary ---------- */
ok('buildSummary dinner + trip', () => {
  const s = mkState('dinner');
  addPeople(s, ['Ann', 'Ben']);
  s.dinner.billCents = 5000; s.dinner.paidBy = 'pAnn';
  const txt = C.buildSummary(s);
  assert.ok(txt.includes('Ann'), 'names present');
  assert.ok(txt.includes('pay Ann'), 'payer hint present');
  assert.ok(txt.includes('exactly the bill'), 'dinner reconciliation line present');
  const t = mkState('trip');
  addPeople(t, ['Ann', 'Ben']);
  t.trip.expenses = [{ id: 'e', label: '', cents: 1000, currency: 'USD', rate: 1, baseCents: 1000, paidBy: 'pAnn', split: [] }];
  const txt2 = C.buildSummary(t);
  assert.ok(txt2.includes('To settle up (fewest payments):'), 'settle section');
  assert.ok(txt2.includes('balances net to zero exactly'), 'reconciliation line present');
  assert.ok(txt2.includes('Ben → Ann'), 'transfer line');
});

/* ---------- Pay module ---------- */
ok('Pay.targets builds safe links', () => {
  const p = { name: 'A', venmo: '@ann', cashtag: '$ann', paypal: 'ann' };
  const t = C.Pay.targets(p, 1234, 'Dinner & drinks');
  assert.equal(t.length, 3);
  assert.ok(t[0].href.startsWith('https://venmo.com/ann?txn=pay&amount=12.34'), t[0].href);
  assert.ok(!t[0].href.includes('&note=Dinner & '), 'note is url-encoded');
  assert.equal(t[1].href, 'https://cash.app/$ann/12.34');
  assert.equal(t[2].href, 'https://paypal.me/ann/12.34');
  assert.equal(C.Pay.targets({ name: 'X', venmo: '', cashtag: '', paypal: '' }, 100).length, 0);
});

console.log(`\n${passed} test groups passed${process.exitCode ? ' (with failures above)' : ''}`);
