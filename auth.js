// Auth-gate voor de operations-app.
//
// Werkt in twee modi op basis van de hostname:
//   V1 (live, legacy): hostname zonder "-login"/"-v2" -> code-014 prompt
//   V2 (nieuwe URL):   hostname bevat "-login" of "-v2" -> Firebase Auth login + rollen
//
// Zodra iedereen een echte login heeft, kan de V1-tak weg en wordt
// V2 de standaard.
(function () {
  var pathname = (location.pathname || '').toLowerCase();
  var hostname = (location.hostname || '').toLowerCase();
  var hash = location.hash || '';

  // Login-modus staat overal aan. De V1 (code 014) tak blijft hieronder
  // staan voor referentie maar wordt niet meer gestart.
  startV2();
  return;
  /* eslint-disable no-unreachable */
  var isV2 = hostname.indexOf('-login') !== -1 || hostname.indexOf('-v2') !== -1;
  if (isV2) { startV2(); } else { startV1(); }
  /* eslint-enable no-unreachable */

  // ─────────────────────────────────────────────────────────────
  // V1 — legacy: code 014 in localStorage
  // ─────────────────────────────────────────────────────────────
  function startV1() {
    var KEY = 'senorsnacks_auth_v1';
    var CODE = '014';

    if (hash.indexOf('#portal/') === 0) return;
    try { if (localStorage.getItem(KEY) === CODE) return; } catch (e) {}

    var hide = document.createElement('style');
    hide.id = '__auth_hide';
    hide.textContent = 'body>*:not(#__auth_overlay){visibility:hidden!important}';
    (document.head || document.documentElement).appendChild(hide);

    function build() {
      if (document.getElementById('__auth_overlay')) return;
      if (!document.body) { return setTimeout(build, 10); }
      var ov = document.createElement('div');
      ov.id = '__auth_overlay';
      ov.style.cssText = [
        'position:fixed', 'inset:0', 'z-index:2147483647',
        'background:#fdf8f0', 'display:flex', 'align-items:center',
        'justify-content:center', 'padding:1rem',
        'font-family:-apple-system,BlinkMacSystemFont,Inter,"Segoe UI",sans-serif',
        'color:#3a2415'
      ].join(';');
      ov.innerHTML =
        '<div style="text-align:center;max-width:340px;width:100%">' +
          '<img src="/senorsnacks-logo.png" alt="Senor Snacks" style="width:110px;height:auto;margin:0 auto 1.25rem;display:block"/>' +
          '<h1 style="margin:0 0 6px;font-size:22px;font-weight:700;letter-spacing:-.01em">Operations</h1>' +
          '<p style="margin:0 0 1.5rem;color:#7a5a40;font-size:14px;line-height:1.5">Voer de toegangscode in om verder te gaan.</p>' +
          '<input id="__auth_input" type="password" inputmode="numeric" autocomplete="off" autocapitalize="off" placeholder="• • •" ' +
            'style="width:100%;padding:14px;font-size:20px;text-align:center;border:1px solid rgba(120,60,20,.22);border-radius:10px;background:#fff;color:#3a2415;outline:none;letter-spacing:.4em;font-family:monospace;box-sizing:border-box;transition:border-color .15s,background .15s,box-shadow .15s"/>' +
          '<button id="__auth_btn" style="margin-top:12px;width:100%;padding:13px;font-size:14px;font-weight:600;background:#e8662b;color:#fff;border:none;border-radius:10px;cursor:pointer;font-family:inherit;box-shadow:0 1px 3px rgba(232,102,43,.3);transition:background .12s">Open</button>' +
          '<div id="__auth_err" style="margin-top:10px;font-size:12px;color:#7a2818;min-height:16px;font-weight:500"></div>' +
          '<div style="margin-top:1.5rem;font-size:11px;color:#b89878">Je toestel onthoudt de toegang.</div>' +
        '</div>';
      document.body.appendChild(ov);

      var inp = document.getElementById('__auth_input');
      var btn = document.getElementById('__auth_btn');
      var err = document.getElementById('__auth_err');
      setTimeout(function () { try { inp.focus(); } catch (e) {} }, 50);

      function unlock() {
        try { localStorage.setItem(KEY, CODE); } catch (e) {}
        ov.remove();
        var s = document.getElementById('__auth_hide'); if (s) s.remove();
      }
      function reject() {
        err.textContent = 'Onjuiste code';
        inp.value = '';
        inp.style.borderColor = '#f0a896';
        inp.style.background = '#fde2dd';
        inp.style.boxShadow = '0 0 0 3px rgba(240,168,150,.3)';
        setTimeout(function () {
          inp.style.borderColor = 'rgba(120,60,20,.22)';
          inp.style.background = '#fff';
          inp.style.boxShadow = 'none';
          err.textContent = '';
          try { inp.focus(); } catch (e) {}
        }, 1200);
      }
      function check() {
        var v = (inp.value || '').trim();
        if (v === CODE) unlock(); else reject();
      }
      btn.onclick = check;
      btn.onmouseover = function () { btn.style.background = '#d05420'; };
      btn.onmouseout = function () { btn.style.background = '#e8662b'; };
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') check(); });
      inp.addEventListener('focus', function () {
        inp.style.borderColor = '#e8662b';
        inp.style.boxShadow = '0 0 0 3px #fef0e2';
      });
      inp.addEventListener('blur', function () {
        if (inp.style.background !== 'rgb(253, 226, 221)') {
          inp.style.borderColor = 'rgba(120,60,20,.22)';
          inp.style.boxShadow = 'none';
        }
      });
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', build);
    } else {
      build();
    }
  }

  // ─────────────────────────────────────────────────────────────
  // V2 — nieuwe URL: Firebase Auth + custom-claim rollen
  // ─────────────────────────────────────────────────────────────
  function startV2() {
    // Bypass: login-pagina zelf, publieke QR-viewer, leveranciers-portaal.
    if (pathname.endsWith('/login.html') || pathname === '/login') return;
    if (pathname.endsWith('/qr.html')) return;
    if (hash.indexOf('#portal/') === 0) return;

    var hide = document.createElement('style');
    hide.id = '__auth_hide';
    hide.textContent = 'body>*:not(#__auth_overlay){visibility:hidden!important}';
    (document.head || document.documentElement).appendChild(hide);

    var nextUrl = encodeURIComponent(location.pathname + location.search + location.hash);

    function esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]);
      });
    }
    function redirectToLogin() { location.replace('/login.html?next=' + nextUrl); }

    function showWaiting(user) {
      if (!document.body) { return setTimeout(function () { showWaiting(user); }, 10); }
      var existing = document.getElementById('__auth_overlay');
      if (existing) existing.remove();
      var ov = document.createElement('div');
      ov.id = '__auth_overlay';
      ov.style.cssText = [
        'position:fixed', 'inset:0', 'z-index:2147483647',
        'background:#fdf8f0', 'display:flex', 'align-items:center',
        'justify-content:center', 'padding:1rem',
        'font-family:-apple-system,BlinkMacSystemFont,Inter,"Segoe UI",sans-serif',
        'color:#3a2415'
      ].join(';');
      ov.innerHTML =
        '<div style="text-align:center;max-width:380px;width:100%">' +
          '<img src="/senorsnacks-logo.png" alt="Senor Snacks" style="width:90px;height:auto;margin:0 auto 1rem;display:block"/>' +
          '<h1 style="margin:0 0 6px;font-size:20px;font-weight:700">Wachten op toegang</h1>' +
          '<p style="margin:0 0 1.2rem;color:#7a5a40;font-size:13px;line-height:1.5">' +
            'Je bent ingelogd als <b>' + esc(user.email || '') + '</b>, maar er is nog geen rol toegekend.<br>' +
            'Vraag een admin om je toegang te geven.' +
          '</p>' +
          '<button id="__auth_refresh" style="width:100%;padding:11px;font-size:13px;font-weight:600;background:#e8662b;color:#fff;border:none;border-radius:8px;cursor:pointer;margin-bottom:8px;font-family:inherit">Opnieuw checken</button>' +
          '<button id="__auth_logout" style="width:100%;padding:10px;font-size:13px;background:transparent;color:#7a5a40;border:1px solid rgba(120,60,20,.22);border-radius:8px;cursor:pointer;font-family:inherit">Uitloggen</button>' +
        '</div>';
      document.body.appendChild(ov);
      document.getElementById('__auth_refresh').onclick = function () {
        var btn = this;
        btn.disabled = true; btn.textContent = 'Bezig…';
        firebase.auth().currentUser.getIdToken(true).then(function () { location.reload(); });
      };
      document.getElementById('__auth_logout').onclick = function () {
        firebase.auth().signOut().then(redirectToLogin);
      };
    }

    function letThrough(user, claims) {
      var role = claims.role || null;
      window.__auth = {
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName || '',
        role: role,
        isAdmin:   role === 'admin',
        canManage: role === 'admin' || role === 'manager',
        canWrite:  role === 'admin' || role === 'manager' || role === 'medewerker',
        logout: function () { firebase.auth().signOut().then(redirectToLogin); },
      };
      if (!window.__auth.canWrite) {
        var s = document.createElement('style');
        s.textContent = '[data-role="write"]{display:none!important}';
        document.head.appendChild(s);
      }
      var hideEl = document.getElementById('__auth_hide');
      if (hideEl) hideEl.remove();
      // Activity-heartbeat: rapporteer aanwezigheid voor admin-dashboard.
      // Stilletjes falen als RTDB niet beschikbaar is op deze pagina.
      try {
        if (typeof firebase.database === 'function') {
          var actRef = firebase.database().ref('_userActivity/' + user.uid);
          actRef.update({
            lastSeen: firebase.database.ServerValue.TIMESTAMP,
            email: user.email || '',
            displayName: user.displayName || '',
          }).catch(function () { /* niet kritiek */ });
          setInterval(function () {
            actRef.update({ lastSeen: firebase.database.ServerValue.TIMESTAMP })
              .catch(function () {});
          }, 90 * 1000);
        }
      } catch (e) { /* noop */ }
      try {
        window.dispatchEvent(new CustomEvent('auth-ready', { detail: window.__auth }));
      } catch (e) { /* oudere browsers */ }
    }

    function onUser(user) {
      // Anonieme users (van eventueel V1-bootstrap) zien we als 'niet ingelogd'.
      if (!user || user.isAnonymous) { redirectToLogin(); return; }
      user.getIdTokenResult(false).then(function (tokenResult) {
        var claims = (tokenResult && tokenResult.claims) || {};
        if (!claims.role) { showWaiting(user); return; }
        letThrough(user, claims);
      }).catch(function () { redirectToLogin(); });
    }

    function start() {
      if (window.firebase
          && typeof firebase.auth === 'function'
          && firebase.apps && firebase.apps.length) {
        try { firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL); } catch (e) {}
        firebase.auth().onAuthStateChanged(onUser);
      } else {
        setTimeout(start, 50);
      }
    }
    start();
  }
})();
