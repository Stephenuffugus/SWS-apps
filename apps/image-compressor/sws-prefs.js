/* ═══════════════════════════════════════════════════════════════════════════
   SWS STUDIO, comfort preferences
   Sky Wolf Studio · SWS Strategic Media LLC

   Copied to apps/<slug>/sws-prefs.js by design/apply.mjs. Do not edit the
   copies; edit this file and re-run `npm run design:apply`.

   Loaded as a CLASSIC, BLOCKING script in <head>. Both of those matter:

   - classic, not a module, because a module is deferred, and a deferred theme
     switch is a white flash in a dark room at 3am. This file's whole first job
     is to get the attributes onto <html> before the first paint.
   - external, not inline, because the strictest app here ships
     `script-src 'self'` and an inline block would be refused outright. It is
     precached by each app's service worker, so the cost is one request on the
     very first visit and nothing after that, offline included.

   Storage is ONE key for the whole origin. Every app lives on the same host,
   so a choice made in Baby Log is already in force the first time Grocery List
   opens. That is deliberate: someone who needs larger text needs it in all 23
   apps, and asking them to set it 23 times would be its own accessibility bug.
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var KEY = 'sws.prefs';
  var root = document.documentElement;

  /* Each group: the attribute it writes, its default, and the options.
     `def` is the value that means "leave it alone", when a group is at its
     default the attribute is REMOVED rather than written, so the plain media
     queries in the stylesheet stay in charge and the DOM stays honest about
     what has actually been overridden. */
  var GROUPS = [
    {
      key: 'theme', attr: 'data-theme', def: 'system',
      legend: 'Appearance',
      hint: 'Auto follows whatever your phone or computer is set to.',
      options: [
        { v: 'system', label: 'Auto' },
        { v: 'light', label: 'Light' },
        { v: 'dark', label: 'Dark' },
      ],
    },
    {
      key: 'text', attr: 'data-text', def: 'm',
      legend: 'Text size',
      options: [
        { v: 's', label: 'Small' },
        { v: 'm', label: 'Default' },
        { v: 'l', label: 'Large' },
        { v: 'xl', label: 'Larger' },
        { v: 'xxl', label: 'Largest' },
      ],
    },
    {
      key: 'density', attr: 'data-density', def: 'cosy',
      legend: 'Spacing',
      options: [
        { v: 'compact', label: 'Compact' },
        { v: 'cosy', label: 'Default' },
        { v: 'roomy', label: 'Roomy' },
      ],
    },
    {
      key: 'reading', attr: 'data-reading', def: 'normal',
      legend: 'Reading',
      hint: 'Easier uses plainer type with wider letter and line spacing.',
      options: [
        { v: 'normal', label: 'Default' },
        { v: 'easy', label: 'Easier' },
      ],
    },
    {
      key: 'warmth', attr: 'data-warmth', def: '0',
      legend: 'Warm tint',
      hint: 'Takes the blue down for night use.',
      options: [
        { v: '0', label: 'Off' },
        { v: '1', label: 'Low' },
        { v: '2', label: 'Medium' },
        { v: '3', label: 'High' },
      ],
    },
    {
      key: 'contrast', attr: 'data-contrast', def: 'auto',
      legend: 'Contrast',
      options: [
        { v: 'auto', label: 'Auto' },
        { v: 'normal', label: 'Standard' },
        { v: 'more', label: 'High' },
      ],
    },
    {
      key: 'motion', attr: 'data-motion', def: 'auto',
      legend: 'Motion',
      options: [
        { v: 'auto', label: 'Auto' },
        { v: 'full', label: 'Full' },
        { v: 'less', label: 'Reduced' },
      ],
    },
  ];

  var VALID = {};
  var DEFAULTS = {};
  GROUPS.forEach(function (g) {
    DEFAULTS[g.key] = g.def;
    VALID[g.key] = g.options.map(function (o) { return o.v; });
  });

  /* ── State ──────────────────────────────────────────────────────────────
     localStorage throws rather than returning null in a few real situations, Safari private browsing, storage disabled by policy, an origin the user
     has blocked. None of those should cost someone the ability to turn the
     text up for this session, so every access is guarded and the in-memory
     copy is the source of truth. */

  var state = {};

  function read() {
    var stored = null;
    try {
      stored = JSON.parse(localStorage.getItem(KEY) || '{}');
    } catch (e) {
      stored = null;
    }
    if (!stored || typeof stored !== 'object') stored = {};

    GROUPS.forEach(function (g) {
      var v = stored[g.key];
      // Anything unrecognised falls back to the default. Prefs written by a
      // newer version of this file must never leave an app in a broken state.
      state[g.key] = VALID[g.key].indexOf(v) === -1 ? g.def : v;
    });
  }

  function write() {
    try {
      var out = {};
      GROUPS.forEach(function (g) {
        if (state[g.key] !== g.def) out[g.key] = state[g.key];
      });
      if (Object.keys(out).length) localStorage.setItem(KEY, JSON.stringify(out));
      else localStorage.removeItem(KEY);
    } catch (e) { /* session-only is an acceptable degradation */ }
  }

  function apply() {
    GROUPS.forEach(function (g) {
      if (state[g.key] === g.def) root.removeAttribute(g.attr);
      else root.setAttribute(g.attr, state[g.key]);
    });
  }

  /* Run immediately, before <body> exists. This is the anti-flash pass. */
  read();
  apply();

  /* ── Browser chrome ─────────────────────────────────────────────────────
     The address bar colour comes from <meta name="theme-color">, which the
     build writes as a light/dark pair keyed to prefers-color-scheme. A manual
     override has to repaint it too, or the phone's chrome stays light around a
     dark app. Handled by disabling the media-scoped pair and driving a single
     unscoped meta from the resolved canvas colour. */

  var themeMeta = null;

  function paintChrome() {
    if (!document.head) return;

    // Matches the build's light/dark pair in both states: untouched they carry
    // a real media query, suppressed they carry media="not all". The single
    // unscoped meta this function adds has no media attribute, so it is never
    // caught by its own selector.
    var pair = document.head.querySelectorAll('meta[name="theme-color"][media]');
    var i;

    if (state.theme === 'system') {
      // Only the media query was ever changed, so putting it back restores
      // exactly what the build wrote, nothing has to be reconstructed.
      for (i = 0; i < pair.length; i++) restoreMedia(pair[i]);
      if (themeMeta) { themeMeta.remove(); themeMeta = null; }
      return;
    }

    for (i = 0; i < pair.length; i++) suppressMedia(pair[i]);

    if (!themeMeta) {
      themeMeta = document.createElement('meta');
      themeMeta.setAttribute('name', 'theme-color');
      document.head.appendChild(themeMeta);
    }
    var canvas = getComputedStyle(root).getPropertyValue('--canvas').trim();
    if (canvas) themeMeta.setAttribute('content', canvas);
  }

  // A media query that can never match is how you switch a meta off without
  // losing what it said.
  function suppressMedia(m) {
    if (m.hasAttribute('data-sws-media')) return;
    m.setAttribute('data-sws-media', m.getAttribute('media') || '');
    m.setAttribute('media', 'not all');
  }

  function restoreMedia(m) {
    if (!m.hasAttribute('data-sws-media')) return;
    m.setAttribute('media', m.getAttribute('data-sws-media'));
    m.removeAttribute('data-sws-media');
  }

  /* ── Cross-tab and cross-app sync ───────────────────────────────────────
     Two of these apps open in two tabs is normal, a grocery list on the phone
     and a recipe on the laptop, a sitter sheet beside a calendar. The storage
     event fires in every OTHER tab on the origin, so a change made in one is
     live in the rest without a reload. */
  window.addEventListener('storage', function (e) {
    if (e.key !== KEY && e.key !== null) return;
    read();
    apply();
    paintChrome();
    syncInputs();
  });

  /* ── The panel ──────────────────────────────────────────────────────────
     Built here rather than written into 23 index.html files. One definition,
     no drift, and if this script fails to load there is no dead button
     sitting in the header promising something that will not open. */

  var dialog = null;
  var inputs = {};

  function el(tag, props, kids) {
    var n = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        if (k === 'text') n.textContent = props[k];
        else if (k === 'html') n.innerHTML = props[k];
        else if (k === 'class') n.className = props[k];
        else n.setAttribute(k, props[k]);
      });
    }
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }

  function buildDialog() {
    var body = el('div', { class: 'sws-body' });

    body.appendChild(el('div', { class: 'sws-sample' }, [
      el('p', { text: 'The quick brown fox jumps over the lazy dog.' }),
      el('p', { class: 'sub', text: 'Secondary text looks like this, hints, timestamps and captions.' }),
    ]));

    GROUPS.forEach(function (g) {
      var opts = el('div', { class: 'opt' });

      g.options.forEach(function (o) {
        var input = el('input', {
          type: 'radio',
          name: 'sws-' + g.key,
          value: o.v,
        });
        if (state[g.key] === o.v) input.checked = true;

        input.addEventListener('change', function () {
          if (!input.checked) return;
          state[g.key] = o.v;
          apply();
          write();
          paintChrome();
        });

        (inputs[g.key] = inputs[g.key] || {})[o.v] = input;
        opts.appendChild(el('label', {}, [input, document.createTextNode(o.label)]));
      });

      var legend = el('legend', { text: g.legend });
      if (g.hint) legend.appendChild(el('span', { class: 'lite', text: g.hint }));

      body.appendChild(el('fieldset', {}, [legend, opts]));
    });

    var close = el('button', {
      type: 'button',
      class: 'btn icon ghost',
      'aria-label': 'Close display settings',
    });
    close.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" aria-hidden="true" focusable="false" width="20" height="20">' +
      '<path d="M6 6l12 12M18 6L6 18"/></svg>';
    close.addEventListener('click', function () { dialog.close(); });

    var reset = el('button', { type: 'button', class: 'btn small', text: 'Reset' });
    reset.addEventListener('click', function () {
      GROUPS.forEach(function (g) { state[g.key] = g.def; });
      apply();
      write();
      paintChrome();
      syncInputs();
    });

    var done = el('button', { type: 'button', class: 'btn primary small', text: 'Done' });
    done.addEventListener('click', function () { dialog.close(); });

    dialog = el('dialog', { id: 'swsPrefs', 'aria-labelledby': 'swsPrefsTitle' }, [
      el('div', { class: 'sws-head' }, [
        el('h2', { id: 'swsPrefsTitle', text: 'Display & comfort' }),
        close,
      ]),
      body,
      el('div', { class: 'sws-foot' }, [
        el('p', {
          class: 'sws-note grow',
          text: 'Saved on this device. Every app here follows it.',
        }),
        reset,
        done,
      ]),
    ]);

    // Clicking the backdrop closes. The dialog element itself is the click
    // target when the backdrop is hit, so comparing against it is enough, // no coordinate maths, and it cannot misfire on a child.
    dialog.addEventListener('click', function (e) {
      if (e.target === dialog) dialog.close();
    });

    document.body.appendChild(dialog);
  }

  function syncInputs() {
    GROUPS.forEach(function (g) {
      var group = inputs[g.key];
      if (!group) return;
      Object.keys(group).forEach(function (v) { group[v].checked = (v === state[g.key]); });
    });
  }

  /* Where the button goes.
   *
   * Not every app has the same header. Bill Splitter wraps its contents in a
   * .brandrow, so the tip link is a GRANDchild of header.app and inserting
   * against the header throws NotFoundError. Specials Planner predates the
   * studio chrome entirely and has no header.app at all. Both are real, both
   * shipped, so this resolves a parent and a sibling together rather than
   * assuming the two are related.
   */
  function mountPoint() {
    // Preferred: immediately left of the tip jar, whatever contains it.
    var tip = document.querySelector('.tipbtn');
    if (tip && tip.parentNode) return { parent: tip.parentNode, before: tip };

    var appHeader = document.querySelector('header.app');
    if (appHeader) return { parent: appHeader, before: null };

    /* Apps with their own header shape, land in the TITLE ROW, beside the
       name, not merely somewhere inside the header.
     *
     * Tried one at a time rather than as one comma-separated selector:
     * querySelector returns the first match in DOCUMENT order, not in the
     * order the selectors are written, so a single list picked the outer
     * `header .wrap` over the inner `.head-row` and left the button stranded
     * on a line of its own under the title. */
    var SPOTS = ['header .head-row', 'header .brandrow', 'header .titlerow', 'header .wrap', 'header'];
    for (var i = 0; i < SPOTS.length; i++) {
      var spot = document.querySelector(SPOTS[i]);
      if (spot) return { parent: spot, before: null };
    }

    // No header to attach to. Better to have no button than to invent chrome
    // in the middle of someone's layout.
    return null;
  }

  function buildButton() {
    var at = mountPoint();
    if (!at) return;

    var btn = el('button', {
      type: 'button',
      id: 'swsPrefsBtn',
      class: 'noprint',
      'aria-label': 'Display and comfort settings',
      title: 'Display & comfort',
    });
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" aria-hidden="true" focusable="false">' +
      '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/>' +
      '<circle cx="16" cy="7" r="2.2"/><circle cx="10" cy="17" r="2.2"/></svg>';

    btn.addEventListener('click', function () {
      if (!dialog) buildDialog();
      syncInputs();
      dialog.showModal();
    });

    // Left of the tip jar when there is one. The tip jar stays the rightmost
    // thing in every app, it is the one piece of chrome whose position people
    // learn, and a settings button is not a reason to move it.
    at.parent.insertBefore(btn, at.before);
  }

  /* One app throwing during init must not become 23 apps with a console error,
     and must never take the host app's own scripts down with it. */
  function init() {
    try {
      buildButton();
      paintChrome();
    } catch (e) {
      if (window.console && console.warn) console.warn('sws-prefs: ' + e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
