/* Comic Crew in a real browser.

   Every check here exists because the same class of bug shipped in this fleet
   before. A green node suite proves the code was written. It proves nothing
   about whether a child can see the control, hit it, or still have her drawing
   after she closes the tab.

   node test/smoke.browser.mjs
*/
import { writeFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withApp } from '../../../design/harness.mjs';

const fails = [];
let n = 0;
const ok = (c, m) => { n++; if (!c) fails.push(m); };
const eq = (a, b, m) => { n++; if (a !== b) fails.push(`${m}: got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)}`); };

/* world (1000 x 1400) to client px, using the same fit the app uses */
const mapPts = (page, pts) => page.evaluate((p) => {
  const r = document.getElementById('stage').getBoundingClientRect();
  const s = Math.min(r.width / 1000, r.height / 1400);
  const ox = r.left + (r.width - 1000 * s) / 2, oy = r.top + (r.height - 1400 * s) / 2;
  return p.map((q) => [ox + q[0] * s, oy + q[1] * s]);
}, pts);

async function stroke(page, worldPts, id = 1) {
  const pts = await mapPts(page, worldPts);
  await page.evaluate(({ pts, id }) => {
    const c = document.getElementById('stage');
    const ev = (t, x, y) => c.dispatchEvent(new PointerEvent(t, {
      pointerId: id, pointerType: 'touch', isPrimary: true, bubbles: true,
      clientX: x, clientY: y, pressure: 0.6 }));
    ev('pointerdown', pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ev('pointermove', pts[i][0], pts[i][1]);
    ev('pointerup', pts[pts.length - 1][0], pts[pts.length - 1][1]);
  }, { pts, id });
}
const seg = (a, b, k = 8) => Array.from({ length: k + 1 }, (_, i) =>
  [a[0] + (b[0] - a[0]) * i / k, a[1] + (b[1] - a[1]) * i / k]);
const ring = (cx, cy, r, k = 20) => Array.from({ length: k + 1 }, (_, i) =>
  [cx + Math.cos(i / k * 6.283) * r, cy + Math.sin(i / k * 6.283) * r]);


/* How much of the drawing area is actually showing paper. The shell is
   #191713 and the page is #F2F1EC, so counting light pixels answers "can the
   child see their drawing" without caring what is drawn on it. */
const cover = (page) => page.evaluate(() => {
  const c = document.getElementById('stage');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let light = 0, total = 0;
  for (let i = 0; i < d.length; i += 4 * 37) { total++; if (d[i] > 200) light++; }
  return total ? light / total : 0;
});

/* two fingers sliding together, which is how the app pans */
const panBy = (page, dx, dy) => page.evaluate(({ dx, dy }) => {
  const c = document.getElementById('stage');
  const r = c.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2, d = 50;
  const ev = (t, id, x, y) => c.dispatchEvent(new PointerEvent(t, {
    pointerId: id, pointerType: 'touch', isPrimary: id === 1, bubbles: true,
    clientX: x, clientY: y, pressure: 0.5 }));
  ev('pointerdown', 1, cx - d / 2, cy);
  ev('pointerdown', 2, cx + d / 2, cy);
  for (let i = 1; i <= 4; i++) {
    ev('pointermove', 1, cx - d / 2 + dx * i / 4, cy + dy * i / 4);
    ev('pointermove', 2, cx + d / 2 + dx * i / 4, cy + dy * i / 4);
  }
  ev('pointerup', 1, cx - d / 2 + dx, cy + dy);
  ev('pointerup', 2, cx + d / 2 + dx, cy + dy);
}, { dx, dy });

/* where the paper's left and right edges actually are on the middle row */
const edges = (page) => page.evaluate(() => {
  const c = document.getElementById('stage');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  const w = c.width, row = (c.height >> 1) * w * 4;
  let first = -1, last = -1;
  for (let x = 0; x < w; x++) if (d[row + x * 4] > 200) { if (first < 0) first = x; last = x; }
  return first < 0 ? { none: true, w } : { gapL: first, gapR: w - 1 - last, w };
});

/* Pinch right back down. Zoom compounds across gestures, so without an
   explicit reset a "gentle 1.25 pinch" later in a run is really whatever the
   previous gestures left times 1.25, and a check written for one zoom level
   quietly measures another. That is exactly how the first version of these
   checks passed against the bugs they were written for. */
const zoomReset = async (page) => { await pinchBy(page, 0.02); await page.waitForTimeout(80); };

/* two fingers spreading from the middle of the stage */
const pinchBy = (page, k) => page.evaluate((k) => {
  const c = document.getElementById('stage');
  const r = c.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2, d0 = 50;
  const ev = (t, id, x, y) => c.dispatchEvent(new PointerEvent(t, {
    pointerId: id, pointerType: 'touch', isPrimary: id === 1, bubbles: true,
    clientX: x, clientY: y, pressure: 0.5 }));
  ev('pointerdown', 1, cx - d0 / 2, cy);
  ev('pointerdown', 2, cx + d0 / 2, cy);
  const d1 = d0 * k;
  ev('pointermove', 1, cx - d1 / 2, cy);
  ev('pointermove', 2, cx + d1 / 2, cy);
  ev('pointerup', 1, cx - d1 / 2, cy);
  ev('pointerup', 2, cx + d1 / 2, cy);
}, k);

const bodyCount = (page) => page.evaluate(() =>
  window.__comiccrew.S.strokes.filter((s) => s.layer === 'body').length);

async function drawBody(page) {
  await stroke(page, ring(500, 220, 90));
  await stroke(page, seg([440, 370], [440, 730]));
  await stroke(page, seg([560, 370], [560, 730]));
  await stroke(page, seg([420, 395], [330, 700]));
  await stroke(page, seg([580, 395], [670, 700]));
  await stroke(page, seg([460, 740], [430, 1130]));
  await stroke(page, seg([540, 740], [570, 1130]));
}

await withApp('comic-crew', async ({ page, errors, overflow, offenders }) => {
  /* ── the shipped build and the worker must name the same cache, or a fix
     never reaches a phone that already installed the app ─────────────────── */
  const build = await page.evaluate(() => window.BUILD);
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  ok(!!build, 'the page declares a build tag');
  ok(sw.includes(`'${build}'`), `the worker caches the shipped build (page ${build})`);

  /* ── nothing is fetched from off this origin. The offline promise is the
     product, not a nicety. ─────────────────────────────────────────────────── */
  const external = await page.evaluate(() =>
    [...document.querySelectorAll('link[href],script[src],img[src]')]
      .map((e) => e.getAttribute('href') || e.getAttribute('src'))
      .filter((u) => /^https?:|^\/\//.test(u)));
  eq(external.length, 0, `no off origin assets (found ${JSON.stringify(external)})`);

  /* ── at second zero, the app must say what to do ─────────────────────────── */
  const firstHint = await page.textContent('#hint');
  ok(/blue/i.test(firstHint || ''), `the first instruction names the blue figure (got "${firstHint}")`);

  /* ── everything a finger aims at is at least 44 px, in every state ───────
     privacy.html states this in writing, so it is a claim the app has to keep.
     Checking only the first screen missed three links inside the grown ups
     sheet that were eighteen pixels tall. */
  const tooSmall = () => page.evaluate(() => {
    const out = [];
    document.querySelectorAll('button, a[href], input.field, textarea.field').forEach((el) => {
      if (el.offsetParent === null) return;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      if (r.height < 44 || r.width < 44)
        out.push(`${el.id || el.textContent.trim().slice(0, 20)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    });
    return out;
  });
  eq((await tooSmall()).length, 0, `every control on the first screen is 44px (${JSON.stringify(await tooSmall())})`);

  /* ── drawing works, and a second finger is a palm, not a stroke ──────────── */
  await drawBody(page);
  const drew = await bodyCount(page);
  eq(drew, 7, 'seven strokes drew seven strokes');

  const before = await bodyCount(page);
  const pts = await mapPts(page, seg([200, 900], [300, 950]));
  const palm = await mapPts(page, [[350, 1200]]);
  await page.evaluate(({ pts, palm }) => {
    const c = document.getElementById('stage');
    const ev = (t, x, y, id) => c.dispatchEvent(new PointerEvent(t, {
      pointerId: id, pointerType: 'touch', isPrimary: id === 1, bubbles: true,
      clientX: x, clientY: y, pressure: 0.6 }));
    ev('pointerdown', pts[0][0], pts[0][1], 1);
    ev('pointermove', pts[2][0], pts[2][1], 1);
    ev('pointerdown', palm[0][0], palm[0][1], 2);      // the heel of the hand
    ev('pointermove', pts[4][0], pts[4][1], 1);
    ev('pointerup', pts[4][0], pts[4][1], 1);
    ev('pointerup', palm[0][0], palm[0][1], 2);
  }, { pts, palm });
  eq(await bodyCount(page), before, 'a resting palm leaves no stray mark');

  /* and every point is still bound, which is what used to throw on export */
  const unbound = await page.evaluate(() =>
    window.__comiccrew.S.strokes.filter((s) => !s.bind || s.bind.some((b) => !b || !b.length)).length);
  eq(unbound, 0, 'no stroke is left unbound after a palm');

  /* ── the head must be rigid on the path the app actually takes ───────────
     The node bench binds a whole finished figure in one go and so never sees
     this: a child draws the body first and the head last, and the head's reach
     is only known once the head exists. An earlier version measured that reach
     only inside bindAll, which the drawing path never calls, so isHead was dead
     code in the shipping app and the head was rigid in the test and not in the
     product. */
  await stroke(page, seg([420, 390], [580, 390]));       // a shoulder line
  await stroke(page, ring(500, 220, 90));                // the head, drawn last
  const headState = await page.evaluate(() => {
    const A = window.__comiccrew, S = A.S;
    const head = S.strokes[S.strokes.length - 1];
    return { rigid: A.isHead(head), bones: head.bind[0].length,
             onHeadBone: head.bind[0][0][0] === A.HEAD_BONE };
  });
  ok(headState.rigid, 'the head is rigid even though it was drawn last');
  eq(headState.bones, 1, 'the head rides exactly one bone');
  ok(headState.onHeadBone, 'and that bone is the head');

  /* a tall pigtail pushes the head's reach out past the shoulders. Ownership,
     not the reach, is what must stop shoulder ink being welded to the head. */
  await stroke(page, seg([470, 130], [440, -40]));
  await stroke(page, seg([530, 130], [560, -40]));
  const afterHair = await page.evaluate(() => {
    const A = window.__comiccrew, S = A.S, R = A.S.rest;
    /* both ends, because the left arm also starts at (420, 395) and matching
       on the start alone quietly measured the arm instead */
    const shoulder = S.strokes.find((st) => st.pts.length > 3 &&
      Math.abs(st.pts[0][1] - 390) < 12 && Math.abs(st.pts[0][0] - 420) < 12 &&
      st.pts[st.pts.length - 1][0] > 500 &&
      Math.abs(st.pts[st.pts.length - 1][1] - 390) < 25);
    if (!shoulder) return { found: false };
    const far = Math.max(...shoulder.pts.map((p) =>
      Math.hypot(p[0] - R.head[0], p[1] - R.head[1]) - p[2]));
    return { found: true, reach: Math.round(A.getHeadR()), far: Math.round(far),
             allInsideReach: far <= A.getHeadR(),
             shoulderIsHead: A.isHead(shoulder) };
  });
  ok(afterHair.found, 'the shoulder line is still there to test');
  /* the premise: the reach really has grown past the shoulder line, so the
     radius test ALONE would now swallow it. Without this the next check would
     pass for the wrong reason, which it did on the first attempt. */
  ok(afterHair.allInsideReach,
    `the pigtail pushes the reach past the shoulder line (reach ${afterHair.reach}, shoulder ${afterHair.far})`);
  eq(afterHair.shoulderIsHead, false,
    'and ownership, not the reach, is what keeps the shoulder out of the head');

  /* the sheets too, where the small ones were hiding */
  await page.click('#btnGrown');
  await page.waitForTimeout(280);
  eq((await tooSmall()).length, 0, `every control in the grown ups sheet is 44px (${JSON.stringify(await tooSmall())})`);
  await page.evaluate(() => document.getElementById('grownClose').click());
  await page.waitForTimeout(150);
  await page.click('#btnWords');
  await page.waitForTimeout(280);
  eq((await tooSmall()).length, 0, `every control in the words sheet is 44px (${JSON.stringify(await tooSmall())})`);
  await page.evaluate(() => document.getElementById('wordDone').click());
  await page.waitForTimeout(200);

  /* ── the traps a curious child walks into ───────────────────────────────── */
  {
    /* ink that lands off the paper can never be seen or kept: black on the dark
       shell measures 1.06 to 1, and it is cropped out of the printed page */
    const n0 = await bodyCount(page);
    await page.evaluate(() => {
      const c = document.getElementById('stage'), r = c.getBoundingClientRect();
      const ev = (t, x, y) => c.dispatchEvent(new PointerEvent(t, { pointerId: 5,
        pointerType: 'touch', isPrimary: true, bubbles: true, clientX: x, clientY: y, pressure: 0.6 }));
      ev('pointerdown', r.left + 4, r.top + 120);
      ev('pointermove', r.left + 10, r.top + 180);
      ev('pointerup', r.left + 10, r.top + 180);
    });
    await page.waitForTimeout(180);
    eq(await bodyCount(page), n0, 'a line drawn off the paper is not quietly kept');
    ok(/paper/i.test(await page.textContent('#hint') || ''), 'and the child is told why');

    /* every point of every stroke is inside the page, so nothing is cropped */
    const outside = await page.evaluate(() => window.__comiccrew.S.strokes
      .filter((st) => st.layer !== 'kit')
      .reduce((n, st) => n + st.pts.filter((p) =>
        p[0] < -0.5 || p[0] > 1000.5 || p[1] < -0.5 || p[1] > 1400.5).length, 0));
    eq(outside, 0, 'no drawn point sits outside the page');
  }
  {
    /* tapping Clothes first, then drawing the whole character there, used to
       lock Dress up and Move for good with a hint that never said why */
    await page.click('#mDraw');
    await page.waitForTimeout(150);
    const before = await page.evaluate(() => window.__comiccrew.S.target.layer);
    await page.evaluate(() => [...document.querySelectorAll('.chip')]
      .find((b) => b.textContent === 'Clothes 1').click());
    await page.waitForTimeout(150);
    const after = await page.evaluate(() => window.__comiccrew.S.target.layer);
    ok(after === 'outfit' || before === 'outfit',
      'with a body drawn, the clothes layer is available as normal');
  }

  /* ── grabbing a joint has to forgive a fingertip too ─────────────────────── */
  {
    await page.click('#mPose');
    await page.waitForTimeout(200);
    await page.evaluate(() => [...document.querySelectorAll('.chip')]
      .find((b) => b.textContent === 'Straighten up').click());
    await page.waitForTimeout(200);
    const before = await page.evaluate(() => JSON.stringify(window.__comiccrew.S.panels[window.__comiccrew.S.current].pose));

    /* a stray brush past a joint must move nothing at all */
    const wrist = await mapPts(page, [[326, 700]]);
    await page.evaluate((w) => {
      const c = document.getElementById('stage');
      const ev = (t, x, y) => c.dispatchEvent(new PointerEvent(t, { pointerId: 6,
        pointerType: 'touch', isPrimary: true, bubbles: true, clientX: x, clientY: y, pressure: 0.6 }));
      ev('pointerdown', w[0], w[1]); ev('pointermove', w[0] + 2, w[1] + 1); ev('pointerup', w[0] + 2, w[1] + 1);
    }, wrist[0]);
    await page.waitForTimeout(200);
    eq(await page.evaluate(() => JSON.stringify(window.__comiccrew.S.panels[window.__comiccrew.S.current].pose)),
      before, 'brushing past a joint does not move the figure');

    /* and a real drag that starts 25 screen pixels off the wrist still grabs it */
    await page.evaluate((w) => {
      const c = document.getElementById('stage');
      const ev = (t, x, y) => c.dispatchEvent(new PointerEvent(t, { pointerId: 6,
        pointerType: 'touch', isPrimary: true, bubbles: true, clientX: x, clientY: y, pressure: 0.6 }));
      ev('pointerdown', w[0] + 25, w[1]);
      for (let i = 1; i <= 6; i++) ev('pointermove', w[0] + 25 - i * 9, w[1] - i * 11);
      ev('pointerup', w[0] - 29, w[1] - 66);
    }, wrist[0]);
    await page.waitForTimeout(220);
    ok(await page.evaluate(() => JSON.stringify(window.__comiccrew.S.panels[window.__comiccrew.S.current].pose)) !== before,
      'a drag starting a fingertip away from the wrist still moves the arm');
  }

  /* ── rubbing out has to forgive a fingertip ──────────────────────────────
     The hit test used to demand a tap inside the filled outline, which on a
     phone is about three screen pixels wide. Measured, a child had to be
     accurate to two pixels; anywhere else told her to try again. */
  {
    await page.click('#mDraw');            /* Rub out lives on the drawing screen */
    await page.waitForTimeout(200);
    const before = await bodyCount(page);
    await page.evaluate(() => [...document.querySelectorAll('.chip')]
      .find((b) => b.textContent === 'Rub out').click());
    await page.waitForTimeout(120);
    /* aim ten screen pixels beside the shoulder line, which is a miss by any
       fingertip standard and well outside the ink */
    const near = await mapPts(page, [[500, 390]]);
    await page.evaluate((pt) => {
      const c = document.getElementById('stage');
      c.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 7, pointerType: 'touch',
        isPrimary: true, bubbles: true, clientX: pt[0], clientY: pt[1] + 10, pressure: 0.6 }));
      c.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7, pointerType: 'touch',
        isPrimary: true, bubbles: true, clientX: pt[0], clientY: pt[1] + 10, pressure: 0 }));
    }, near[0]);
    await page.waitForTimeout(200);
    const after = await bodyCount(page);
    eq(after, before - 1, 'a tap ten pixels beside a line still rubs it out');
    const said = await page.textContent('#hint');
    ok(/rubbed out/i.test(said || ''), `and says so ("${said}")`);
    /* and Undo brings it back, because that is the whole safety net */
    await page.click('#btnUndo');
    await page.waitForTimeout(220);
    eq(await bodyCount(page), before, 'and Undo puts it back');
    await page.evaluate(() => [...document.querySelectorAll('.chip')]
      .find((b) => b.textContent === 'Rub out').click());
    await page.waitForTimeout(120);
  }

  /* ── the costume follows the character into a new panel ──────────────────── */
  await page.click('#mDress');
  await page.waitForTimeout(220);
  await page.evaluate(() => [...document.querySelectorAll('.card')]
    .find((c) => c.textContent.includes('Hero')).click());
  await page.waitForTimeout(120);
  await page.evaluate(() => document.querySelectorAll('.panel')[1].click());
  await page.waitForTimeout(120);
  const wornInTwo = await page.evaluate(() => {
    const p = window.__comiccrew.S.panels[1];
    return p ? p.wear.kit : -99;
  });
  eq(wornInTwo, 0, 'panel two is still wearing the costume panel one had on');
  await page.evaluate(() => document.querySelectorAll('.panel')[3].click());
  await page.waitForTimeout(120);
  const wornInFour = await page.evaluate(() => {
    const p = window.__comiccrew.S.panels[3];
    return p ? p.wear.kit : -99;
  });
  eq(wornInFour, 0, 'so is panel four, two panels further on');
  await page.evaluate(() => document.querySelectorAll('.panel')[1].click());
  await page.waitForTimeout(80);

  /* ── words end up in the panel and in the page ───────────────────────────── */
  await page.click('#mPose');
  await page.waitForTimeout(120);
  await page.click('#btnWords');
  await page.waitForTimeout(200);
  await page.fill('#wordText', 'Look what I can do!');
  await page.click('#wordDone');
  await page.waitForTimeout(150);
  eq(await page.evaluate(() => window.__comiccrew.S.panels[1].words.length), 1, 'the balloon is stored on the panel');

  /* the bubble must be sized for the font it is drawn in, not the default */
  const bw = await page.evaluate(() => {
    const b = window.__comiccrew.S.panels[1].words[0];
    const c = document.getElementById('stage').getContext('2d');
    return window.__comiccrew.balloonBox(c, b).w;
  });
  ok(bw > 200, `the bubble is sized for its own lettering (got ${Math.round(bw)})`);

  /* ── the page comes out with ink on it ───────────────────────────────────── */
  await page.click('#btnPage');
  await page.waitForTimeout(400);
  const ink = await page.evaluate(() => {
    const c = document.getElementById('pagePreview');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let k = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] < 100) k++;
    return { w: c.width, h: c.height, ink: k };
  });
  eq(ink.w, 1600, 'the page is a real page size');
  ok(ink.ink > 20000, `the page has ink on it (${ink.ink} dark pixels)`);
  await page.click('#pageClose');

  /* ── closing the tab must not destroy forty minutes of work ──────────────── */
  const wanted = await page.evaluate(() => ({
    body: window.__comiccrew.S.strokes.filter((s) => s.layer === 'body').length,
    panels: window.__comiccrew.S.panels.filter(Boolean).length,
    words: window.__comiccrew.S.panels[1].words.length,
    kit: window.__comiccrew.S.panels[1].wear.kit,
  }));
  await page.reload({ waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
  /* read defensively: if persistence is broken the panel is simply gone, and a
     thrown TypeError here would abort the run instead of reporting the defect */
  const got = await page.evaluate(() => {
    const S = window.__comiccrew.S, p = S.panels[1];
    return {
      body: S.strokes.filter((s) => s.layer === 'body').length,
      panels: S.panels.filter(Boolean).length,
      words: p ? p.words.length : -1,
      kit: p ? p.wear.kit : -99,
    };
  });
  eq(JSON.stringify(got), JSON.stringify(wanted), 'everything survives a reload');

  /* ── a wrong file must change nothing ────────────────────────────────────── */
  const dir = mkdtempSync(join(tmpdir(), 'comic-crew-'));
  const junk = join(dir, 'holiday.json');
  writeFileSync(junk, JSON.stringify({ hello: 'this is not a character' }));
  await page.click('#btnGrown');
  await page.waitForTimeout(150);
  await page.setInputFiles('#file', junk);
  await page.waitForTimeout(300);
  const afterJunk = await page.evaluate(() => {
    const S = window.__comiccrew.S;
    return {
      joints: S.rest ? Object.keys(S.rest).length : -1,
      body: S.strokes.filter((s) => s.layer === 'body').length,
      hint: document.getElementById('hint').textContent,
    };
  });
  eq(afterJunk.joints, 15, 'a wrong file leaves the skeleton whole');
  eq(afterJunk.body, wanted.body, 'a wrong file leaves the drawing alone');
  ok(/not a character/i.test(afterJunk.hint), `the child is told what happened (got "${afterJunk.hint}")`);

  /* the app must still work afterwards, not sit there dead */
  await page.evaluate(() => document.getElementById('grownClose').click());
  await page.waitForTimeout(120);
  await page.click('#mPose');
  await page.waitForTimeout(150);
  await page.evaluate(() => [...document.querySelectorAll('.chip')]
    .find((b) => b.textContent === 'Waving').click());
  await page.waitForTimeout(150);
  ok(await page.evaluate(() => {
    const p = window.__comiccrew.S.panels[window.__comiccrew.S.current];
    /* a bone whose similarity is no longer the identity has actually moved */
    return !!p && !!p.pose && !!p.pose.b &&
      Object.values(p.pose.b).some((d) => Math.abs(d[1]) > 0.01 || Math.abs(d[0] - 1) > 0.01);
  }), 'the app still poses after a wrong file');

  /* ── zooming must never leave the child looking at nothing ───────────────
     Two separate ways it did. A big spread panned past the zoom cap and slid
     the view into the blank margin. And a pan made for one stage size was never
     re-clamped when a mode change resized the stage, so the page could end up
     entirely outside the canvas: black drawing area, character still visible in
     every thumbnail, no control that says put it back. Nothing in the suite
     touched zoom at all, which is why both shipped green. */
  await page.click('#mDraw');
  await page.waitForTimeout(220);
  await zoomReset(page);
  const flat = await cover(page);
  ok(flat > 0.35, `paper is on screen before any zoom (${flat.toFixed(2)})`);

  /* one enthusiastic spread, far past the app's own cap */
  await pinchBy(page, 20);
  await page.waitForTimeout(150);
  const zoomed = await cover(page);
  ok(zoomed > 0.6, `an enthusiastic pinch still shows the page (${zoomed.toFixed(2)})`);

  /* zoom in AND pan toward a corner, which is what a child does while drawing
     the legs, then change modes, which resizes the stage under the pan */
  await zoomReset(page);
  await pinchBy(page, 3);
  await page.waitForTimeout(120);
  await panBy(page, 0, -300);
  await page.waitForTimeout(120);
  const beforeMode = await cover(page);
  ok(beforeMode > 0.5, `the page is on screen after zooming and panning (${beforeMode.toFixed(2)})`);
  await page.click('#mDress');
  await page.waitForTimeout(360);
  const afterMode = await cover(page);
  ok(afterMode > 0.35, `the page is still there after changing modes zoomed in (${afterMode.toFixed(2)})`);
  await page.click('#mPose');
  await page.waitForTimeout(360);
  const afterMode2 = await cover(page);
  ok(afterMode2 > 0.35, `and after changing modes again (${afterMode2.toFixed(2)})`);

  /* a small zoom, where the page is still narrower than the box. That branch
     centres it, and zeroing the offset instead jams it against one edge. */
  await page.click('#mDraw');
  await page.waitForTimeout(220);
  await zoomReset(page);
  await pinchBy(page, 1.25);
  await page.waitForTimeout(150);
  const gentle = await edges(page);
  ok(!gentle.none, 'a gentle pinch leaves the page on screen at all');
  ok(Math.abs(gentle.gapL - gentle.gapR) <= 6,
    `a gentle pinch leaves the page centred, not jammed to one side (${JSON.stringify(gentle)})`);
  await zoomReset(page);

  /* ── nothing sticking out sideways, and no console errors at all ─────────── */
  const ov = await overflow();
  ok(ov <= 2, `no sideways scroll (${ov}px, offenders ${JSON.stringify(await offenders()).slice(0, 200)})`);
  eq(errors.length, 0, `no page or console errors (${JSON.stringify(errors).slice(0, 400)})`);
}, { width: 414, height: 900 });

/* ── the smallest phone anyone still uses ────────────────────────────────── */
await withApp('comic-crew', async ({ page, errors, overflow }) => {
  await drawBody(page);
  await page.click('#mDress');
  await page.waitForTimeout(250);
  const ov = await overflow();
  ok(ov <= 2, `no sideways scroll at 320px (${ov}px)`);
  const cards = await page.evaluate(() =>
    [...document.querySelectorAll('.card')].filter((c) => {
      const r = c.getBoundingClientRect();
      return r.right <= window.innerWidth + 1 && r.width >= 60;
    }).length);
  ok(cards >= 4, `costumes are reachable at 320px (${cards} cards fully on screen)`);

  /* THE thing this viewport is here to prove, and the one it did not check:
     that there is somewhere to draw. The rails, the costume grid and the
     filmstrip are all content sized, and on a small phone they ate the paper
     down to eleven pixels while overflow and card widths stayed green. */
  await page.click('#mDraw');
  await page.waitForTimeout(220);
  const paper = await page.evaluate(() => {
    const r = document.getElementById('stage').getBoundingClientRect();
    const s = Math.min(r.width / 1000, r.height / 1400);
    return { h: Math.round(r.height), pw: Math.round(1000 * s), ph: Math.round(1400 * s) };
  });
  ok(paper.h >= 180, `there is room to draw at 320px (stage ${paper.h}px tall)`);

  /* the filmstrip is how a child moves between panels, so it must be on screen
     in every mode, not scrolled off the bottom under the controls */
  for (const m of ['#mDraw', '#mDress', '#mPose']) {
    await page.click(m);
    await page.waitForTimeout(280);
    const seen = await page.evaluate(() => {
      const p = document.querySelectorAll('.panel')[0];
      if (!p) return null;
      const r = p.getBoundingClientRect();
      return { on: r.bottom <= window.innerHeight + 1 && r.top >= 0 && r.height > 20,
               h: Math.round(r.height) };
    });
    ok(seen && seen.on, `the panels are on screen in ${m.slice(2)} at 320px (${JSON.stringify(seen)})`);
  }
  await page.click('#mDraw');
  await page.waitForTimeout(200);
  ok(paper.pw >= 120 && paper.ph >= 160,
    `the paper is big enough to draw a person on (${paper.pw}x${paper.ph})`);
  eq(errors.length, 0, `no errors at 320px (${JSON.stringify(errors).slice(0, 300)})`);
}, { width: 320, height: 568 });

/* ── offline is the product, so prove it rather than assume it ───────────── */
await withApp('comic-crew', async ({ page, errors }) => {
  const ready = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return 'unsupported';
    const reg = await navigator.serviceWorker.ready;
    return reg && reg.active ? 'active' : 'no active worker';
  });
  ok(ready === 'active', `the service worker installs and activates (got ${ready})`);

  /* pull the plug and reload. A child drawing in the back of a car has no
     bars, and this is the whole reason the fonts are carried locally. */
  await page.context().setOffline(true);
  await page.reload({ waitUntil: 'load', timeout: 20000 });
  const offline = await page.evaluate(() => ({
    booted: !!window.__comiccrew,
    modes: document.querySelectorAll('.modes button').length,
    display: !!document.getElementById('stage'),
    font: document.fonts ? document.fonts.check('16px "Shantell Sans"') : null,
  }));
  ok(offline.booted, 'the app boots with the network unplugged');
  eq(offline.modes, 3, 'the controls are there offline');
  ok(offline.font !== false, `the lettering face is available offline (check said ${offline.font})`);

  /* the privacy page is the one link on the first screen, so it must work too */
  const priv = await page.evaluate(async () => {
    const r = await fetch('privacy.html');
    return { status: r.status, len: (await r.text()).length };
  });
  ok(priv.status === 200 && priv.len > 2000, `the privacy page is cached offline (${JSON.stringify(priv)})`);
  await page.context().setOffline(false);

  eq(errors.length, 0, `no errors offline (${JSON.stringify(errors).slice(0, 300)})`);
}, { width: 414, height: 900 });

/* ── never lose a child's work ───────────────────────────────────────────
   Losing what you made is the strongest complaint in this whole category, and
   the browser causes it without any bug in the app. These four are the ways the
   app could have caused it as well. */

/* 1. an idle tab must not lay its stale copy over another tab's hour of work */
await withApp('comic-crew', async ({ page, errors }) => {
  await drawBody(page);
  await page.waitForTimeout(800);
  const mine = await page.evaluate(() => localStorage.getItem('comic-crew.character'));
  ok(mine && mine.length > 100, 'this tab saved its own drawing');

  /* another tab saves something newer, then this one is closed */
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('comic-crew.character'));
    d.name = 'From the other tab';
    localStorage.setItem('comic-crew.character', JSON.stringify(d));
  });
  await page.evaluate(() => { window.dispatchEvent(new Event('pagehide')); });
  await page.waitForTimeout(150);
  const after = await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('comic-crew.character'));
    return d.name;
  });
  eq(after, 'From the other tab', 'closing a tab that changed nothing does not overwrite newer work');
  eq(errors.length, 0, `no errors (${JSON.stringify(errors).slice(0, 200)})`);
}, { width: 414, height: 900 });

/* 2. a browser that refuses to store must say so, not fail silently */
await withApp('comic-crew', async ({ page, errors }) => {
  await page.addInitScript(() => {
    const real = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (String(k).indexOf('comic-crew') === 0) throw new Error('QuotaExceededError');
      return real.call(this, k, v);
    };
  });
  await page.reload({ waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const hiddenAtFirst = await page.evaluate(() => document.getElementById('saveWarn').hidden);
  eq(hiddenAtFirst, true, 'the storage warning stays out of the way until it is true');

  await drawBody(page);
  await page.waitForTimeout(900);
  const warn = await page.evaluate(() => {
    const el = document.getElementById('saveWarn');
    const r = el.getBoundingClientRect();
    return { hidden: el.hidden, h: Math.round(r.height),
             text: el.textContent.replace(/\s+/g, ' ').trim().slice(0, 60),
             btn: !!document.getElementById('saveWarnGo') };
  });
  eq(warn.hidden, false, 'a browser that will not store says so');
  ok(warn.h >= 40, `and the warning is actually visible (${warn.h}px tall)`);
  ok(/will not keep/i.test(warn.text), `in words a parent can act on ("${warn.text}")`);
  ok(warn.btn, 'with a way to save the work to a file instead');
  eq(errors.length, 0, `no errors while storage is broken (${JSON.stringify(errors).slice(0, 200)})`);
}, { width: 414, height: 900 });

/* 3. a record this build cannot read is not the same thing as no record */
await withApp('comic-crew', async ({ page, errors }) => {
  await page.addInitScript(() => {
    localStorage.setItem('comic-crew.character', '{"format":"comic-crew/9","this":"is from a newer build"');
  });
  await page.reload({ waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await drawBody(page);                     // the first stroke used to destroy it
  await page.waitForTimeout(900);
  const kept = await page.evaluate(() => ({
    aside: localStorage.getItem('comic-crew.character.unreadable'),
    live: localStorage.getItem('comic-crew.character'),
  }));
  ok(kept.aside && kept.aside.indexOf('newer build') >= 0,
    'a record that cannot be read is moved aside, not thrown away');
  ok(kept.live && kept.live.indexOf('comic-crew/4') >= 0, 'and the child can still work');
  eq(errors.length, 0, `no errors (${JSON.stringify(errors).slice(0, 200)})`);
}, { width: 414, height: 900 });

/* 4. closing the tab with a finger still on the glass must not lose the stroke.
   A skipped debounce is only delayed, because the next pen lift reschedules it.
   pagehide has no next time, so a guard that refuses to write mid stroke there
   throws away everything drawn since the last tick. */
await withApp('comic-crew', async ({ page, errors }) => {
  await drawBody(page);
  await page.waitForTimeout(800);
  const before = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('comic-crew.character')).strokes.length);

  /* on the paper, because ink outside it is rejected on purpose */
  const live = await mapPts(page, seg([250, 500], [700, 900], 9));
  await page.evaluate((pts) => {
    const c = document.getElementById('stage');
    const ev = (t, x, y) => c.dispatchEvent(new PointerEvent(t, { pointerId: 9,
      pointerType: 'touch', isPrimary: true, bubbles: true, clientX: x, clientY: y, pressure: 0.6 }));
    ev('pointerdown', pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ev('pointermove', pts[i][0], pts[i][1]);
    /* the tab goes away with the finger still down */
    window.dispatchEvent(new Event('pagehide'));
  }, live);
  await page.waitForTimeout(250);
  const after = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('comic-crew.character')).strokes.length);
  ok(after > before,
    `a stroke in progress survives the tab closing (${before} strokes -> ${after})`);
  eq(errors.length, 0, `no errors (${JSON.stringify(errors).slice(0, 200)})`);
}, { width: 414, height: 900 });

/* ── Undo has to mean something every single time it is tapped ───────────
   A child stops believing in a button that sometimes does nothing, and by then
   she has tapped it twice and lost real work. */
await withApp('comic-crew', async ({ page, errors }) => {
  const undoDepth = () => page.evaluate(() =>
    document.getElementById('btnUndo').disabled);
  await drawBody(page);
  await page.waitForTimeout(300);

  /* a palm the app rejected on purpose must leave nothing behind */
  const beforePalm = await page.evaluate(() =>
    JSON.stringify(window.__comiccrew.doc()));
  const pts = await mapPts(page, seg([200, 900], [300, 950]));
  const palm = await mapPts(page, [[350, 1200]]);
  await page.evaluate(({ pts, palm }) => {
    const c = document.getElementById('stage');
    const ev = (t, x, y, id) => c.dispatchEvent(new PointerEvent(t, {
      pointerId: id, pointerType: 'touch', isPrimary: id === 1, bubbles: true,
      clientX: x, clientY: y, pressure: 0.6 }));
    ev('pointerdown', pts[0][0], pts[0][1], 1);
    ev('pointermove', pts[2][0], pts[2][1], 1);
    ev('pointerdown', palm[0][0], palm[0][1], 2);
    ev('pointerup', pts[2][0], pts[2][1], 1);
    ev('pointerup', palm[0][0], palm[0][1], 2);
  }, { pts, palm });
  await page.waitForTimeout(200);
  await page.click('#btnUndo');
  await page.waitForTimeout(250);
  const afterPalmUndo = await page.evaluate(() => JSON.stringify(window.__comiccrew.doc()));
  ok(afterPalmUndo !== beforePalm,
    'one Undo after a rejected palm changes something, rather than spending itself on nothing');

  /* a tap on a joint that never moved must not fill the stack either */
  await page.click('#mPose');
  await page.waitForTimeout(200);
  const beforeTap = await page.evaluate(() => JSON.stringify(window.__comiccrew.doc()));
  const hip = await mapPts(page, [[500, 725]]);
  await page.evaluate((h) => {
    const c = document.getElementById('stage');
    const ev = (t) => c.dispatchEvent(new PointerEvent(t, { pointerId: 4, pointerType: 'touch',
      isPrimary: true, bubbles: true, clientX: h[0], clientY: h[1], pressure: 0.6 }));
    ev('pointerdown'); ev('pointerup');
  }, hip[0]);
  await page.waitForTimeout(200);
  await page.click('#btnUndo');
  await page.waitForTimeout(250);
  const afterTapUndo = await page.evaluate(() => JSON.stringify(window.__comiccrew.doc()));
  ok(afterTapUndo !== beforeTap,
    'and after touching a joint without moving it');

  /* deleting a speech bubble is undoable */
  await page.click('#btnWords');
  await page.waitForTimeout(220);
  await page.fill('#wordText', 'Say something');
  await page.click('#wordDone');
  await page.waitForTimeout(200);
  eq(await page.evaluate(() => window.__comiccrew.S.panels[window.__comiccrew.S.current].words.length), 1,
    'the balloon is there to delete');
  await page.evaluate(() => {
    const A = window.__comiccrew;
    const p = A.S.panels[A.S.current];
    const c = document.getElementById('stage'), r = c.getBoundingClientRect();
    const s = Math.min(r.width / 1000, r.height / 1400);
    const b = p.words[0];
    c.dispatchEvent(new MouseEvent('dblclick', { bubbles: true,
      clientX: r.left + (r.width - 1000 * s) / 2 + b.x * s,
      clientY: r.top + (r.height - 1400 * s) / 2 + b.y * s }));
  });
  await page.waitForTimeout(250);
  await page.click('#wordDelete');
  await page.waitForTimeout(250);
  eq(await page.evaluate(() => window.__comiccrew.S.panels[window.__comiccrew.S.current].words.length), 0,
    'and it goes');
  await page.click('#btnUndo');
  await page.waitForTimeout(300);
  eq(await page.evaluate(() => window.__comiccrew.S.panels[window.__comiccrew.S.current].words.length), 1,
    'and Undo brings the balloon back');

  eq(errors.length, 0, `no errors (${JSON.stringify(errors).slice(0, 250)})`);
}, { width: 414, height: 900 });

/* ── starting again survives the tab closing ─────────────────────────────
   Undo covers a mistake made a second ago. It does not survive the tab, and
   "New character" is one tap from the button beside Undo. */
await withApp('comic-crew', async ({ page, errors }) => {
  await drawBody(page);
  await page.waitForTimeout(800);
  const had = await bodyCount(page);
  await page.click('#btnGrown');
  await page.waitForTimeout(150);
  await page.click('#btnNew');
  await page.waitForTimeout(500);
  eq(await bodyCount(page), 0, 'New character clears the page');

  /* the tab goes away, taking the undo stack with it */
  await page.reload({ waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  eq(await bodyCount(page), 0, 'and it is still clear after a reload');
  await page.click('#btnGrown');
  await page.waitForTimeout(200);
  const offered = await page.evaluate(() => !document.getElementById('btnPrev').hidden);
  ok(offered, 'the last character is still offered after the tab has been closed');
  if (offered) {
    /* only click it if it is really there, so a missing button reports as the
       assertion above rather than as a click timing out on a hidden element */
    await page.click('#btnPrev');
    await page.waitForTimeout(500);
    eq(await bodyCount(page), had, 'and bringing it back returns the whole drawing');
  } else {
    ok(false, 'and bringing it back returns the whole drawing (never got the chance)');
  }
  eq(errors.length, 0, `no errors (${JSON.stringify(errors).slice(0, 250)})`);
}, { width: 414, height: 900 });

/* ── a phone turned sideways, where the paper used to be zero pixels tall ─ */
await withApp('comic-crew', async ({ page, errors, overflow }) => {
  await drawBody(page);
  await page.click('#mDraw');
  await page.waitForTimeout(250);
  const land = await page.evaluate(() => {
    const r = document.getElementById('stage').getBoundingClientRect();
    const s = Math.min(r.width / 1000, r.height / 1400);
    return { w: Math.round(r.width), h: Math.round(r.height), pw: Math.round(1000 * s) };
  });
  ok(land.h >= 150, `there is room to draw with the phone sideways (stage ${land.w}x${land.h})`);
  ok(land.pw >= 110, `and the paper is usable (${land.pw}px wide)`);
  for (const m of ['#mDraw', '#mDress', '#mPose']) {
    await page.click(m);
    await page.waitForTimeout(280);
    const seen = await page.evaluate(() => {
      const p = document.querySelectorAll('.panel')[0];
      if (!p) return null;
      const r = p.getBoundingClientRect();
      return { on: r.bottom <= window.innerHeight + 1 && r.top >= 0 && r.height > 20,
               h: Math.round(r.height) };
    });
    ok(seen && seen.on, `the panels are on screen in ${m.slice(2)} sideways (${JSON.stringify(seen)})`);
  }
  await page.click('#mDraw');
  await page.waitForTimeout(200);
  const seen = await cover(page);
  ok(seen > 0.2, `the paper is actually on screen sideways (${seen.toFixed(2)})`);
  const ov = await overflow();
  ok(ov <= 2, `no sideways scroll in landscape (${ov}px)`);
  eq(errors.length, 0, `no errors in landscape (${JSON.stringify(errors).slice(0, 300)})`);
}, { width: 844, height: 390 });

if (fails.length) {
  console.error(`smoke.browser: ${fails.length} of ${n} checks failed`);
  fails.forEach((f) => console.error('  ' + f));
  process.exit(1);
}
console.log(`smoke.browser: ${n} checks passed`);
