/* ═══════════════════════════════════════════════════════════════════════════
   SWS STUDIO — shared UI runtime
   Sky Wolf Studios · SWS Strategic Media LLC

   Copied to apps/<slug>/sws-ui.js by design/apply.mjs. Do not edit the copies;
   edit this file and re-run `npm run design:apply`.

   Two things, both answers to findings that repeated across every audit:

     SWS.toast(msg, opts)   — status messages, optionally carrying an Undo
     SWS.undo(msg, fn)      — the shorthand, because undo is the common case
     SWS.saved(opts)        — "your work is safe", said out loud for once

   WHY UNDO AND NOT A CONFIRM DIALOG
   The audits found one-tap delete with no way back in app after app. The
   instinct is to add "Are you sure?", but that taxes the 99 deliberate taps to
   catch the one mistake, and at 3am it is just one more thing to dismiss
   without reading. Undo taxes nothing and is strictly more forgiving: it also
   catches the mistakes a confirm dialog waves through.

   WHY A SHARED FILE
   22 of the 23 apps already declare their own local `toast(msg, ms)`. Those
   are module-scoped and keep working untouched — this adds a global namespace
   beside them rather than replacing anything. Apps migrate at their own pace.
   ═══════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var SWS = (window.SWS = window.SWS || {});

  var node = null;
  var timer = null;
  var held = false;      // pointer or focus is inside — do not auto-dismiss
  var pending = null;    // the timeout we deferred while held

  /* Every app ships <div id="toast" role="status" aria-live="polite">, but not
     every app does, and a missing one should degrade to a working toast rather
     than to silence. */
  function ensure() {
    if (node && document.body.contains(node)) return node;

    node = document.getElementById('toast');
    if (!node) {
      node = document.createElement('div');
      node.id = 'toast';
      document.body.appendChild(node);
    }
    if (!node.getAttribute('role')) node.setAttribute('role', 'status');
    if (!node.getAttribute('aria-live')) node.setAttribute('aria-live', 'polite');

    /* A toast that vanishes on a timer is close to unusable for anyone reading
       slowly, using a screen reader, or driving the page from a keyboard — and
       an Undo button that vanishes is worse than none, because it promises a
       way back and then takes it away. So the clock stops whenever the pointer
       or the focus is inside, and restarts when it leaves. */
    node.addEventListener('pointerenter', hold);
    node.addEventListener('pointerleave', release);
    node.addEventListener('focusin', hold);
    node.addEventListener('focusout', release);

    return node;
  }

  function hold() {
    held = true;
    clearTimeout(timer);
  }

  function release() {
    held = false;
    if (pending) arm(pending);
  }

  function arm(ms) {
    pending = ms;
    clearTimeout(timer);
    if (!held) timer = setTimeout(hide, ms);
  }

  function hide() {
    clearTimeout(timer);
    pending = null;
    held = false;
    if (node) node.classList.remove('show', 'act');
  }

  /**
   * SWS.toast('Saved')
   * SWS.toast('Item deleted', { action: { label: 'Undo', onAction: restore } })
   *
   * opts.ms       how long to stay. Defaults to 4s, or 7s when there is an
   *               action — you have to notice it, read it, and reach it.
   * opts.assertive  for genuine errors only; interrupts a screen reader.
   */
  SWS.toast = function (msg, opts) {
    opts = opts || {};
    var t = ensure();
    var action = opts.action;

    t.setAttribute('aria-live', opts.assertive ? 'assertive' : 'polite');

    // replaceChildren, not innerHTML: `msg` is frequently a list item, a file
    // name or a person's name that the user typed.
    t.replaceChildren(document.createTextNode(msg));
    t.classList.toggle('act', !!action);

    if (action) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'undo';
      btn.textContent = action.label || 'Undo';
      btn.addEventListener('click', function () {
        hide();
        try {
          action.onAction();
        } catch (e) {
          if (window.console && console.error) console.error('undo failed', e);
        }
      });
      t.appendChild(btn);
    }

    t.classList.add('show');
    arm(opts.ms || (action ? 7000 : 4000));
    return t;
  };

  /** The common case, spelled the short way. */
  SWS.undo = function (msg, onUndo, opts) {
    opts = opts || {};
    opts.action = { label: opts.label || 'Undo', onAction: onUndo };
    return SWS.toast(msg, opts);
  };

  SWS.hideToast = hide;

  /* ── Reading the comfort panel from JavaScript ──────────────────────────
   *
   * CSS gets the comfort settings through the cascade. A <canvas> does not —
   * it is a bitmap, and it hears nothing about a root font-size change or a
   * theme switch. Neither does a requestAnimationFrame loop.
   *
   * The portfolio review found this in 12 of 14 apps: text set to Largest
   * scaled the body copy to 24px and left the canvas labels at 12, and a spin
   * animation ran its full four seconds with Motion set to Reduced. These three
   * helpers are the whole fix, so no app has to re-derive the precedence rules.
   */

  /** Root font size as a multiplier of the 16px default. Multiply canvas type by this. */
  SWS.uiScale = function () {
    var px = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    return px / 16;
  };

  /**
   * Whether to suppress motion, using the panel's precedence: an explicit
   * choice beats the OS, in BOTH directions, and the OS decides otherwise.
   * Getting this backwards is why an app can look like it honours the setting
   * and still spin for four seconds.
   */
  SWS.prefersLessMotion = function () {
    var attr = document.documentElement.getAttribute('data-motion');
    if (attr === 'less') return true;
    if (attr === 'full') return false;
    return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  };

  /**
   * Call `fn` whenever anything the user can change about the display changes —
   * a panel setting, or the OS flipping to dark while the app is open.
   *
   * Pass your repaint function. Returns an unsubscribe.
   */
  SWS.onComfortChange = function (fn) {
    var obs = new MutationObserver(fn);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-text', 'data-density', 'data-contrast', 'data-motion', 'data-reading', 'data-warmth'],
    });

    var mqs = [];
    if (window.matchMedia) {
      ['(prefers-color-scheme: dark)', '(prefers-reduced-motion: reduce)', '(prefers-contrast: more)']
        .forEach(function (q) {
          var mq = matchMedia(q);
          // addEventListener is not available on MediaQueryList in older WebKit.
          if (mq.addEventListener) mq.addEventListener('change', fn);
          else if (mq.addListener) mq.addListener(fn);
          mqs.push(mq);
        });
    }

    return function off() {
      obs.disconnect();
      mqs.forEach(function (mq) {
        if (mq.removeEventListener) mq.removeEventListener('change', fn);
        else if (mq.removeListener) mq.removeListener(fn);
      });
    };
  };

  /**
   * Say that the work is safe.
   *
   * The audits found that saving is fire-and-forget everywhere: the app only
   * speaks when saving FAILS, so the user's evidence that their list survived
   * is that nothing happened. That is not reassurance, and for a shared list
   * or a medication schedule it is the difference between trusting the tool
   * and re-checking it.
   *
   * Prefers a quiet in-place flag (an element with [data-saved-flag], or the
   * conventional #saved) over a toast, because a save confirmation should be
   * ambient — one that interrupts on every keystroke is its own problem.
   */
  SWS.saved = function (opts) {
    opts = opts || {};
    var text = opts.text || 'Saved';
    var flag = opts.el || document.querySelector('[data-saved-flag]') || document.getElementById('saved');

    if (flag) {
      flag.textContent = text;
      flag.classList.add('show');
      clearTimeout(flag._swsTimer);
      flag._swsTimer = setTimeout(function () { flag.classList.remove('show'); }, opts.ms || 1800);

      /* The flag is decoration for a sighted user who is watching the spot it
         appears in. A screen-reader user is not, so the same fact goes to the
         live region — but politely, and only when asked, so that a save on
         every keystroke does not become a stream of chatter. */
      if (opts.announce) SWS.toast(text, { ms: 1200 });
      return flag;
    }

    return SWS.toast(text, { ms: opts.ms || 1800 });
  };
})();
