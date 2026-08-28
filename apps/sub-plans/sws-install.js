/* Sky Wolf Studio install affordance.

   EXTERNAL, and it has to stay that way. Sub Plans is the one app in the
   fleet with a strict Content Security Policy (firebase.json, source
   "/sub-plans{,/**}", script-src 'self' with no unsafe-inline), which is
   deliberate. The fleet ships this snippet inline, so on this app alone the
   browser refused to run it and a teacher could not add Sub Plans to her
   home screen. The hub even drew an install arrow for it, because that arrow
   is rendered wherever the app HTML contains swsInstall, so the studio was
   advertising an install that silently did nothing. Found 2026-08-28 by the
   app's own csp.browser.mjs test, which had been failing at baseline and
   telling the truth the whole time.

   If this ever goes back inline here, the button dies again. Nothing else in
   the fleet needs to change: every other app either has no CSP or allows
   inline (specials-planner does, for Google sign in).
*/
/* Sky Wolf Studio install affordance, injected studio-wide 2026-08-18.
   Chrome hands over a real install prompt; iOS gets directions; nothing
   shows once the app is already installed. */
(function(){
  if (matchMedia('(display-mode: standalone)').matches) return;
  var evt = null;
  function place(){
    var a = document.getElementById('swsInstall');
    if (a) return a;
    a = document.createElement('button');
    a.id = 'swsInstall'; a.type = 'button'; a.textContent = '⤓ Install this app';
    a.style.cssText = 'font:inherit;font-size:12px;color:inherit;opacity:.75;background:none;border:1px solid currentColor;border-radius:10px;padding:6px 12px;margin-top:10px;cursor:pointer;display:inline-block';
    var host = document.querySelector('footer.colophon, .colophon, .footnote, footer');
    if (host){ host.appendChild(document.createElement('br')); host.appendChild(a); }
    else { a.style.cssText += ';position:fixed;right:12px;bottom:76px;z-index:60'; document.body.appendChild(a); }
    /* arrived from the hub's per-app install button: the affordance stops
       hiding in the footer and greets them as a banner */
    if (/[?&]sws-install/.test(location.search)){
      a.style.cssText += ';position:fixed;left:50%;right:auto;top:calc(10px + env(safe-area-inset-top));bottom:auto;transform:translateX(-50%);z-index:99;opacity:1;font-size:15px;font-weight:600;padding:12px 22px;border-radius:999px;background:#1f6f54;color:#fff;border:0;box-shadow:0 8px 26px rgba(0,0,0,.45)';
    }
    return a;
  }
  addEventListener('beforeinstallprompt', function(e){
    e.preventDefault(); evt = e;
    place().onclick = function(){ if (evt) evt.prompt(); };
  });
  if (/iPhone|iPad/.test(navigator.userAgent) && !navigator.standalone){
    place().onclick = function(){ alert('To install: tap the Share button, then "Add to Home Screen".'); };
  }
})();
