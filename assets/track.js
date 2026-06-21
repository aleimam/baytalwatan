/* ============================================================================
   Lightweight visitor tracking — posts session info to /api/track.
   The server stamps IP + user-agent + logged-in user; this sends timing,
   page, referrer, screen, language and timezone. Runs for every visitor
   (including at the login gate). No third-party trackers, no fingerprinting.
   ========================================================================== */
(function () {
  function rid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
  var sid = null;
  try { sid = sessionStorage.getItem('bw_sid'); if (!sid) { sid = rid(); sessionStorage.setItem('bw_sid', sid); } }
  catch (e) { sid = rid(); }
  var start = Date.now();
  var views = 1;

  function payload() {
    var tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
    return {
      sid: sid,
      path: location.pathname + (location.hash || ''),
      ref: document.referrer || '',
      dur: Math.round((Date.now() - start) / 1000),
      views: views,
      scr: (screen.width || 0) + 'x' + (screen.height || 0),
      lang: navigator.language || '',
      tz: tz
    };
  }
  function send(useBeacon) {
    try {
      var data = JSON.stringify(payload());
      if (useBeacon && navigator.sendBeacon) {
        navigator.sendBeacon('api/track', new Blob([data], { type: 'application/json' }));
      } else {
        fetch('api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: data, keepalive: true, credentials: 'same-origin' }).catch(function () {});
      }
    } catch (e) {}
  }

  send(false);                                       // first hit
  setInterval(function () { send(false); }, 30000);  // heartbeat → time-on-site
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') send(true); });
  window.addEventListener('pagehide', function () { send(true); });
  window.addEventListener('hashchange', function () { views++; });
})();
