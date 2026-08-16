/* ═══════════════════════════════════════════════════════════════════════════
   SWS STUDIO — the shared backup runtime

   Every app in this portfolio keeps its data on the device and nowhere else.
   That is the promise, and the cost of it is that the backup problem belongs
   to the user: clear the browser, lose the phone, or let the OS reclaim space,
   and a season of work is gone with no copy anywhere. Six apps had an export
   button. The rest had nothing.

   This is one implementation of that button, so it behaves identically
   everywhere instead of being reinvented per app.

     SWS.backup.wire({ keys, name, version })

   `keys` are the localStorage keys the app owns. Nothing else is read — this
   deliberately cannot scoop up another app's data or the shared comfort
   settings, even though they live on the same origin.

   ── What it will not do ────────────────────────────────────────────────────

   It does not upload. There is no server here and adding one would flip the
   sentence printed at the bottom of every app from true to false, turn the
   Play Data Safety answer from "no data collected" into a disclosure, and
   require an account to restore. A file in the user's own Downloads folder is
   a better backup anyway: it works with no network, it can be copied to a
   drive or emailed to yourself, and it still opens in ten years when this
   site is gone.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var SWS = global.SWS = global.SWS || {};
  var backup = SWS.backup = SWS.backup || {};

  function say(msg) {
    if (SWS.toast) SWS.toast(msg);
    else if (global.toast) global.toast(msg);
  }

  /** Read the app's own keys out of localStorage into a plain object. */
  backup.collect = function (keys) {
    var data = {};
    for (var i = 0; i < keys.length; i++) {
      var v = null;
      try { v = localStorage.getItem(keys[i]); } catch (e) { v = null; }
      if (v !== null) data[keys[i]] = v;
    }
    return data;
  };

  /**
   * The file format, shared by every app. `app` is checked on import so a
   * Grocery List backup cannot be restored into Pill Schedule — silently
   * loading the wrong file would look like data loss.
   */
  backup.serialize = function (cfg) {
    return {
      sws: 1,
      app: cfg.app,
      name: cfg.name || cfg.app,
      version: cfg.version || 1,
      exportedAt: new Date().toISOString(),
      data: backup.collect(cfg.keys)
    };
  };

  backup.download = function (cfg) {
    var payload = backup.serialize(cfg);
    if (!Object.keys(payload.data).length) {
      say('Nothing saved yet — make something first');
      return false;
    }
    var blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = cfg.app + '-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    /* Revoke late: Safari has been known to cancel the download if the URL
       dies too soon after the click. */
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 8000);
    say('Backup saved to your downloads');
    return true;
  };

  /**
   * Restore. Always replaces the app's keys wholesale rather than merging:
   * these payloads are opaque strings owned by each app, and a half-merged
   * state is worse than either version. The user is asked first, because this
   * is the one destructive action in the set and Undo cannot reach across a
   * reload.
   */
  backup.restore = function (cfg, file, done) {
    var reader = new FileReader();
    reader.onerror = function () { say('Could not read that file'); };
    reader.onload = function () {
      var obj;
      try { obj = JSON.parse(reader.result); }
      catch (e) { say('That file is not a backup'); return; }

      if (!obj || obj.sws !== 1 || !obj.data) { say('That file is not a Sky Wolf backup'); return; }
      if (obj.app !== cfg.app) {
        say('That is a ' + (obj.name || obj.app) + ' backup, not ' + (cfg.name || cfg.app));
        return;
      }
      var keys = Object.keys(obj.data);
      if (!keys.length) { say('That backup is empty'); return; }

      var when = obj.exportedAt ? new Date(obj.exportedAt).toLocaleDateString() : 'an unknown date';
      if (!global.confirm('Restore the backup from ' + when
        + '?\n\nThis replaces everything currently in ' + (cfg.name || cfg.app) + ' on this device.')) return;

      try {
        for (var i = 0; i < keys.length; i++) {
          if (cfg.keys.indexOf(keys[i]) === -1) continue;   // never write a key this app does not own
          localStorage.setItem(keys[i], obj.data[keys[i]]);
        }
      } catch (e) {
        say('This browser refused to save — it may be out of room');
        return;
      }
      say('Restored');
      if (typeof done === 'function') done();
      else setTimeout(function () { global.location.reload(); }, 600);
    };
    reader.readAsText(file);
  };

  /**
   * Build the two controls and hand them back. The app decides where they go,
   * because "the bottom of the page" is a different element in every one.
   *
   *   var ui = SWS.backup.wire({ app: 'pill-schedule', name: 'Pill Schedule',
   *                              keys: ['pill-schedule'] });
   *   someCard.append(ui.el);
   */
  backup.wire = function (cfg) {
    var wrap = document.createElement('div');
    wrap.className = 'row backup-row';

    var save = document.createElement('button');
    save.type = 'button';
    save.className = 'btn';
    save.textContent = 'Save a backup file';
    save.addEventListener('click', function () { backup.download(cfg); });

    var open = document.createElement('button');
    open.type = 'button';
    open.className = 'btn';
    open.textContent = 'Restore from a file…';

    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.hidden = true;
    input.addEventListener('change', function (ev) {
      var f = ev.target.files && ev.target.files[0];
      if (f) backup.restore(cfg, f, cfg.onRestore);
      ev.target.value = '';
    });
    open.addEventListener('click', function () { input.click(); });

    wrap.appendChild(save);
    wrap.appendChild(open);
    wrap.appendChild(input);
    return { el: wrap, save: save, open: open, input: input };
  };
}(typeof window !== 'undefined' ? window : globalThis));
