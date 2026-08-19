/* Float, driven in a real browser.
 *
 * float.test.mjs covers the pure functions in jsdom. Everything here needs a
 * real engine, canvas layout, IndexedDB, Blobs, and every assertion below
 * exists because something actually broke:
 *
 *  - fit() keyed its scale off `pins.length === 1` rather than the extent, so
 *    a site with one pin and a kilometre of walked track drew the track
 *    straight off the top of the map. The track was never in the calculation.
 *  - fit() also ran before the canvas had layout, so it scaled against a
 *    guessed viewport.
 *  - the backup had to keep zones, site coordinates, zoneId and packed
 *    histograms across a wipe and restore, none of which existed when the
 *    format was written.
 *
 * Run from the repo root:  node apps/float/test/float.browser.mjs
 */
import { withApp } from '../../../design/harness.mjs';

let passed = 0, failed = 0;
const check = (name, cond, extra) => {
  if (cond) { passed++; console.log('  ok:', name); }
  else { failed++; console.error('  FAIL:', name, extra === undefined ? '' : JSON.stringify(extra)); }
};

await withApp('float', async ({ page, errors }) => {
  /* The harness has already navigated, so unlock and reload rather than trying
     to get in before the first load. */
  await page.evaluate(() => {
    try { localStorage.setItem('float.dev.unlocked', 'wolfden'); } catch (e) {}
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(900);

  check('boots past the gate', await page.evaluate(() => !document.querySelector('.gate')));
  check('first run shows the welcome', await page.evaluate(() => !!document.getElementById('welcome')));

  await page.evaluate(() => {
    const w = document.getElementById('welcome');
    if (w) w.remove();
    document.body.classList.remove('welcoming');
  });

  /* ── a walk, with the two kinds of bad fix a phone actually produces ── */
  const track = await page.evaluate(async () => {
    await settings.set('seenWelcome', true);
    const s = newSite('Cedar Creek Bar');
    await db.put('sites', s);
    const t = newTrip(s.id);
    app.state.activeTrip = t;

    let lat = 42.6870, lon = -89.0310;
    for (let i = 0; i < 60; i++) {
      if (i < 20 || i >= 30) { lat += 0.00018; lon += 0.00006; }  // 20-30: standing still
      const wild = i === 40;
      field.recordTrack({
        latitude: wild ? lat + 0.02 : lat,
        longitude: lon,
        accuracy: wild ? 180 : 8,
      });
    }
    await db.put('trips', t);

    for (let i = 0; i < 3; i++) {
      const f = newFind({ siteId: s.id, tripId: t.id, label: 'Agate ' + i, material: 'agate',
        lat: 42.6870 + i * 0.002, lon: -89.0310 + i * 0.0007 });
      f.strata = [[160, 140, 120, 1]];
      await db.put('finds', f);
    }

    const saved = await db.get('trips', t.id);
    return {
      kept: saved.track.length,
      spike: saved.track.some(p => p[0] > 42.70),
      stamped: saved.track.every(p => p.length === 3 && !Number.isNaN(Date.parse(p[2]))),
      tripId: t.id,
    };
  });

  check('a stationary phone does not fill the track', track.kept < 55, track.kept);
  check('the track is not empty either', track.kept > 20, track.kept);
  check('a 180m-accuracy fix is rejected, not drawn as a spike', track.spike === false);
  check('every track point carries a timestamp', track.stamped);

  /* ── the map fits everything it draws ── */
  await page.evaluate(() => { location.hash = '#/map'; });
  await page.waitForTimeout(1500);

  const fit = await page.evaluate(() => {
    const cv = mapview.cv;
    const pts = [
      ...mapview.pins.map(p => ({ lat: p.lat, lon: p.lon })),
      ...mapview.tracks.flat().map(([lat, lon]) => ({ lat, lon })),
    ];
    let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
    for (const p of pts) {
      const m = geo.merc(p.lat, p.lon);
      const s = mapview.toScreen(m.x, m.y);
      minx = Math.min(minx, s.sx); maxx = Math.max(maxx, s.sx);
      miny = Math.min(miny, s.sy); maxy = Math.max(maxy, s.sy);
    }
    return { w: cv.clientWidth, h: cv.clientHeight, minx, maxx, miny, maxy, tracks: mapview.tracks.length };
  });

  check('the map loaded the walk', fit.tracks === 1, fit.tracks);
  check('the canvas has real layout when fit runs', fit.w > 100 && fit.h > 100, fit);
  check('the whole walk is on screen horizontally', fit.minx >= 0 && fit.maxx <= fit.w, fit);
  check('the whole walk is on screen vertically, the regression',
    fit.miny >= 0 && fit.maxy <= fit.h, fit);

  /* ── a photo, then backup → wipe → restore ── */
  const round = await page.evaluate(async () => {
    const mkBlob = async (h) => {
      const c = document.createElement('canvas'); c.width = c.height = 200;
      const x = c.getContext('2d');
      x.fillStyle = `hsl(${h},50%,45%)`; x.fillRect(0, 0, 200, 200);
      x.fillStyle = `hsl(${(h + 60) % 360},60%,70%)`;
      x.beginPath(); x.arc(100, 100, 60, 0, 7); x.fill();
      return await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
    };

    const s = newSite('Quarry Road Cut');
    s.lat = 42.70115; s.lon = -89.05024; s.notes = 'Gate is locked after 6.';
    s.zones = [{ id: uid(), name: 'north wall' }, { id: uid(), name: 'tailings' }];
    await db.put('sites', s);

    const f = newFind({ siteId: s.id, zoneId: s.zones[0].id, label: 'Banded agate',
      material: 'agate', lat: 42.70115, lon: -89.05024, gpsAccuracy: 7 });
    f.favorite = true;
    const { photo, hist, strata } = await savePhoto(await mkBlob(30), f.id);
    f.photoIds = [photo.id]; f.hist = hist; f.strata = strata;
    await db.put('finds', f);

    const histBefore = f.hist;
    const json = JSON.stringify(await backup.serialize());
    for (const st of ['sites', 'trips', 'finds', 'photos']) await db.clear(st);
    const wiped = (await db.all('finds')).length;
    await backup.deserialize(JSON.parse(json), 'replace');

    const s2 = await db.get('sites', s.id);
    const f2 = (await db.all('finds')).find(x => x.label === 'Banded agate');
    const p2 = (await db.all('photos'))[0];
    return {
      wiped,
      coords: s2 && s2.lat === 42.70115 && s2.lon === -89.05024,
      notes: s2 && s2.notes === 'Gate is locked after 6.',
      zoneNames: (s2?.zones || []).map(z => z.name).join(','),
      zoneResolves: !!(f2 && s2 && s2.zones.some(z => z.id === f2.zoneId)),
      favorite: f2?.favorite === true,
      accuracy: f2?.gpsAccuracy === 7,
      histSim: f2?.hist ? histSimilarity(unpackHist(histBefore), unpackHist(f2.hist)) : -1,
      photoIsBlob: !!(p2 && p2.full instanceof Blob && p2.full.size > 0),
    };
  });

  check('the wipe actually emptied the store', round.wiped === 0, round.wiped);
  check('restore keeps site coordinates', round.coords);
  check('restore keeps site notes', round.notes);
  check('restore keeps zones', round.zoneNames === 'north wall,tailings', round.zoneNames);
  check("restore keeps a find's zone link", round.zoneResolves);
  check('restore keeps favorite and GPS accuracy', round.favorite && round.accuracy);
  check('restore keeps photos as real blobs', round.photoIsBlob);
  check('restored histograms still match themselves', round.histSim > 0.999, round.histSim);
  /* The harness collects pageerror, console.error and failed requests. A
     failed request matters more here than anywhere else in the portfolio:
     Float is supposed to make none at all. */
  const real = errors.filter(e => !/favicon/i.test(e));
  check('no page errors, console errors or failed requests', real.length === 0, real.slice(0, 4));
}, { width: 412, height: 900 });

console.log(`\n${passed} passing, ${failed} failing`);
if (failed) process.exit(1);
console.log('FLOAT BROWSER PASSED');
