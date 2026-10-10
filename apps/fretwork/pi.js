/* Fretwork on Pi Network (lucid-winds plans/pi/PI-GAMES-PLAN-OCT08.md; the same lane as TUMBLE and Pixel Petri).
   On fretwork.lucidwinds.com (and its Testnet copy fretwork-test.lucidwinds.com) Fretwork is a Pi app: Pi sign in,
   guitar in standard tuning free with every drill and tool, and ONE unlock of 8 Pi for every other instrument and
   tuning, custom tunings included. His split, 10 Oct 2026: "guitar in standard tuning is free, and 8 Pi unlocks every
   instrument and tuning" (his to change: lockedFor below is the whole rule).
   On every other host (skywolfstudio.com, so the Play app) this file does nothing: no SDK, no sign in, no lock, no
   request; FW_PI.rail is 'web' and every question it answers is "not locked". `?rail=pi` turns the rail on for a look
   on localhost and for the gate (it adds the locks and the ask; there is no Pi Browser there to sign in with).
   Ownership lives on the Pi account (lucid-winds functions/piGames.js, games fretwork / fretwork-test) with a local
   hint so a bought Fretwork opens unlocked at once. Classic script, ES5, loaded before the page's own script. */
(function(){
  var GAME = 'fretwork', GAME_TEST = 'fretwork-test';      // the server's names for the Mainnet and Testnet apps
  var PRICE = 8, MEMO = 'Fretwork, every instrument and tuning';
  var PI_HOSTS = ['fretwork.lucidwinds.com', 'fretwork-test.lucidwinds.com'];
  var TEST_SUFFIX = '-test.lucidwinds.com';
  var SDK_URL = 'https://sdk.minepi.com/pi-sdk.js';
  var FN_BASE = 'https://us-central1-focus-grove-fffa8.cloudfunctions.net';
  var OWNED_KEY = 'fretwork_pi_owned', SANDBOX_KEY = 'fretwork_pi_sandbox';
  var SCOPES = ['username', 'payments'];
  // the Testnet app also asks for the wallet address: Pi pays its five testers App to User and refuses without it
  // (9 Oct, TUMBLE: missing_scope). The real app pays nobody, so it asks for nothing more than the listing needs.
  var SCOPES_TEST = ['username', 'payments', 'wallet_address'];
  var STR = {
    title: 'Every instrument',
    free: 'On Pi, Fretwork is free on guitar in standard tuning, with every drill and tool.',
    offer: 'One unlock opens every instrument and every tuning: bass, ukulele, banjo, mandolin, drop and open tunings, and your own custom tunings. 8 Pi, once, on your Pi account.',
    buy: 'Unlock for 8 Pi',
    later: 'Not now',
    checking: 'One moment, checking your Pi account.',
    outside: 'Open Fretwork in Pi Browser to unlock it.',
    signIn: 'Sign in with Pi',
    signInFirst: 'Sign in with Pi first.',
    thanks: 'Every instrument and tuning is yours.',
    cancelled: 'No Pi was taken.',
    trouble: 'Pi could not finish that. Try again in a moment.',
    badge: '8 Pi',
    by: 'By Sky Wolf Studio'
  };

  // ---------- the rules, pure (the gate checks these without a browser) ----------
  function railFor(host, search){
    if (/[?&]rail=pi(&|$)/.test(String(search || ''))) return 'pi';
    return PI_HOSTS.indexOf(String(host || '').toLowerCase()) >= 0 ? 'pi' : 'web';
  }
  function isTest(host){ host = String(host || '').toLowerCase(); return host.slice(-TEST_SUFFIX.length) === TEST_SUFFIX; }
  function sandboxFor(host, flag){ if (flag === '1') return true; if (flag === '0') return false; return isTest(host); }
  // THE SPLIT: guitar in standard tuning is free; every other instrument, tuning and custom tuning waits for the unlock
  function lockedFor(rail, owned, inst, tuning){
    if (rail !== 'pi' || owned) return false;
    return !(inst === 'guitar' && tuning === 'standard');
  }

  var host = '', search = '';
  try { host = location.hostname; search = location.search; } catch (e) { /* no location */ }
  var rail = railFor(host, search), game = isTest(host) ? GAME_TEST : GAME, scopes = isTest(host) ? SCOPES_TEST : SCOPES;
  function read(k){ try { return localStorage.getItem(k); } catch (e) { return null; } }
  function write(k, v){ try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }

  var P = {
    rail: rail, game: game, scopes: scopes, price: PRICE, str: STR,
    owned: rail === 'pi' && read(OWNED_KEY) === '1',
    user: null, sdk: false, checking: false,
    sandbox: rail === 'pi' && sandboxFor(host, read(SANDBOX_KEY)),
    active: rail === 'pi',
    onChange: null,          // the page sets this: called with the new owned state
    say: null,               // the page sets this: a short toast
    pure: { railFor: railFor, isTest: isTest, sandboxFor: sandboxFor, lockedFor: lockedFor, PI_HOSTS: PI_HOSTS, STR: STR, PRICE: PRICE, MEMO: MEMO }
  };
  P.locked = function(inst, tuning){ return lockedFor(rail, P.owned, inst, tuning); };
  function say(t){ if (typeof P.say === 'function') P.say(t); }

  // ---------- boot: the SDK, sign in, what this Pi account owns ----------
  P.boot = function(){
    if (!P.active) return;
    try { document.documentElement.classList.add('pi-rail'); } catch (e) { /* no DOM */ }
    P.checking = true;
    loadSdk(function(){
      var Pi = window.Pi;
      if (!Pi || typeof Pi.init !== 'function'){ P.checking = false; render(); return; }
      try { Pi.init({ version: '2.0', sandbox: P.sandbox }); P.sdk = true; } catch (e) { P.checking = false; render(); return; }
      P.signIn(function(){ P.checking = false; render(); });
    });
  };
  function loadSdk(done){
    if (window.Pi){ done(); return; }
    var fin = false;
    function go(){ if (!fin){ fin = true; done(); } }
    try { var s = document.createElement('script'); s.src = SDK_URL; s.async = true; s.onload = go; s.onerror = go; document.head.appendChild(s); } catch (e) { go(); }
    setTimeout(go, 8000);
  }
  P.signIn = function(cb){
    var Pi = window.Pi;
    cb = cb || function(){};
    if (!Pi || !P.sdk){ cb(null); return; }
    var p;
    try { p = Pi.authenticate(scopes, function(payment){ recover(payment); }); } catch (e) { P.user = null; cb(null); return; }
    p.then(function(auth){
      P.user = { uid: auth.user.uid, username: auth.user.username, token: auth.accessToken };
      P.refreshOwned(function(){ cb(P.user); });
    }, function(){ P.user = null; cb(null); });
  };
  P.refreshOwned = function(cb){
    cb = cb || function(){};
    if (!P.user){ cb(P.owned); return; }
    call('piGameStatus', { game: game, accessToken: P.user.token }, function(err, r){
      if (!err) setOwned(!!(r && r.owned && r.owned.indexOf('full') >= 0));   // a failed answer leaves the local hint
      cb(P.owned);
    });
  };
  function setOwned(v){
    var was = P.owned;
    P.owned = !!v;
    write(OWNED_KEY, v ? '1' : '0');
    render();
    if (was !== P.owned && typeof P.onChange === 'function') P.onChange(P.owned);
  }
  function recover(payment){
    var txid = payment && payment.transaction ? payment.transaction.txid : '';
    call('piGameComplete', { game: game, paymentId: payment.identifier, txid: txid }, function(err, r){
      if (!err && r && r.ok) granted();
    });
  }
  function call(name, body, cb){
    var done = false, xhr;
    function fin(err, r){ if (!done){ done = true; cb(err, r); } }
    try {
      xhr = new XMLHttpRequest();
      xhr.open('POST', FN_BASE + '/' + name);
      xhr.setRequestHeader('content-type', 'application/json');
      xhr.timeout = 15000;
      xhr.onload = function(){
        var j = {};
        try { j = JSON.parse(xhr.responseText || '{}'); } catch (e) { /* not JSON */ }
        if (xhr.status < 200 || xhr.status >= 300 || j.error) fin(new Error((j.error && j.error.message) || ('HTTP ' + xhr.status)));
        else fin(null, j.result || {});
      };
      xhr.onerror = function(){ fin(new Error('network')); };
      xhr.ontimeout = function(){ fin(new Error('timeout')); };
      xhr.send(JSON.stringify({ data: body }));
    } catch (e) { fin(e); }
  }

  // ---------- the ask: a dialog in Fretwork's own card style (the #piAsk rules in index.html) ----------
  var open = false, paying = false, el = null;
  function ensure(){
    if (el) return el;
    el = document.createElement('div');
    el.id = 'piAsk';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.addEventListener('click', function(ev){ if (ev.target === el) close(); });
    document.body.appendChild(el);
    return el;
  }
  function render(){
    if (!open) return;
    var box = ensure(), Pi = window.Pi;
    var middle = P.checking ? '<p>' + STR.checking + '</p>'
      : P.user ? '<div class="row"><button class="btn primary start" id="piBuy">' + STR.buy + '</button></div>'
        : (P.sdk && Pi) ? '<div class="row"><button class="btn primary start" id="piSign">' + STR.signIn + '</button></div>'
          : '<p>' + STR.outside + '</p>';
    box.innerHTML = '<div class="box card"><button class="x" id="piX" aria-label="Close">&times;</button><h2>' + STR.title + '</h2><p>' + STR.free + '</p><p>' + STR.offer + '</p>' + middle +
      '<div class="row"><button class="btn" id="piLater">' + STR.later + '</button></div></div>';
    box.classList.add('on');
    box.querySelector('#piLater').onclick = close;
    box.querySelector('#piX').onclick = close;
    var buy = box.querySelector('#piBuy'); if (buy) buy.onclick = function(){ P.buy(); };
    var sign = box.querySelector('#piSign');
    if (sign) sign.onclick = function(){ P.checking = true; render(); P.signIn(function(){ P.checking = false; render(); }); };
  }
  function close(){ open = false; if (el) el.classList.remove('on'); }
  P.ask = function(){ if (!P.active) return; open = true; render(); };
  P.isOpen = function(){ return open; };
  P.buy = function(){
    var Pi = window.Pi;
    if (!Pi || !P.sdk){ say(STR.outside); return false; }
    if (!P.user){ say(STR.signInFirst); return false; }
    if (paying) return false;
    paying = true;
    try {
      Pi.createPayment({ amount: PRICE, memo: MEMO, metadata: { game: game, sku: 'full' } }, {
        onReadyForServerApproval: function(paymentId){ call('piGameApprove', { game: game, paymentId: paymentId }, function(){}); },
        onReadyForServerCompletion: function(paymentId, txid){
          call('piGameComplete', { game: game, paymentId: paymentId, txid: txid }, function(err, r){
            paying = false;
            if (!err && r && r.ok) granted(); else say(STR.trouble);
          });
        },
        onCancel: function(){ paying = false; say(STR.cancelled); },
        onError: function(){ paying = false; say(STR.trouble); }
      });
    } catch (e) { paying = false; say(STR.trouble); return false; }
    return true;
  };
  function granted(){
    if (P.owned){ setOwned(true); return; }
    close();
    setOwned(true);
    say(STR.thanks);
  }

  window.FW_PI = P;
})();
