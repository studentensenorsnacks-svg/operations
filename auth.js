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
    // Bypass: login-pagina zelf, publieke QR-viewer, vettonnen-ophaling
    // (publiek deelbaar met de ophaler), leveranciers-portaal, en de
    // externe read-only dashboards (vetstatus + poets) die zonder login
    // gedeeld worden met externen. Die laden zelf geen auth.js, maar we
    // zetten ze hier expliciet zodat de uitzondering app-breed geldt.
    if (pathname.endsWith('/login.html') || pathname === '/login') return;
    if (pathname.endsWith('/qr.html')) return;
    if (pathname.endsWith('/vet-tonnen.html')) return;
    if (pathname.endsWith('/vet-tonnen-extern.html')) return;
    if (pathname.endsWith('/poets-extern.html')) return;
    if (pathname.endsWith('/personeel-aanmelden.html')) return;
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

    // Leg een uitlog-gebeurtenis vast in _userActivity voordat we afmelden,
    // zodat het audit-log echte logout-events toont. Faalt stilletjes en
    // wacht maximaal kort zodat uitloggen nooit blijft hangen.
    function signOutWithLog() {
      var done = false;
      function finish() { if (done) return; done = true; firebase.auth().signOut().then(redirectToLogin); }
      try {
        var user = firebase.auth().currentUser;
        if (user && typeof firebase.database === 'function') {
          var actRef = firebase.database().ref('_userActivity/' + user.uid);
          var now = Date.now();
          var ua = (navigator.userAgent || '').slice(0, 380);
          actRef.update({ lastLogout: now }).catch(function () {});
          actRef.child('loginHistory/' + now)
            .set({ type: 'logout', userAgent: ua })
            .then(finish).catch(finish);
          setTimeout(finish, 1500); // vangnet: nooit langer dan 1,5s wachten
          return;
        }
      } catch (e) { /* noop */ }
      finish();
    }

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
        signOutWithLog();
      };
    }

    function letThrough(user, claims) {
      var role = claims.role || null;

      // Mapping: tab-code → bijhorende HTML-pagina's. Houdt synchroon met
      // VALID_PAGES (functions) en de page-codes in users.html.
      var PAGE_FILES = {
        notities:       ['/notities.html', '/notitie.html'],
        checkin:        ['/checkin.html'],
        planning:       ['/planning.html', '/verhuur.html', '/served_verhuur.html'],
        laadlijsten:    ['/lijsten.html', '/checklists.html', '/checklist-detail.html', '/laadlijst-beheer.html', '/laadlijst-koppeling.html'],
        ops:            ['/ops.html'],
        personeel:      ['/personeel.html'],
        qrcodes:        ['/qr-codes.html'],
        poets:          ['/poets.html'],
        keuringen:      ['/keuringen.html', '/ocb.html', '/nummerplaten.html'],
        vet:            ['/vet.html', '/vet-tonnen.html'],
        bestellingen:   ['/bestelling.html', '/bestellingen-dashboard.html', '/bestel-catalogus.html', '/ophaalbon.html'],
        stroomaanvraag: ['/stroomaanvraag.html'],
        archief:        ['/archief.html'],
        eindstock:      ['/eindstock.html'],
        horeca:         ['/horeca-planning.html'],
        krisdc:         ['/kris-dc.html', '/kris-dc-monitor.html'],
        fiches:         ['/technische-fiches.html'],
        trucks:         []
      };
      var ALWAYS_OK = ['/login.html', '/qr.html'];

      // Bakker: harde redirect weg van elke pagina die niet expliciet
      // toegelaten is. Voorkomt dat een bakker bv. /dashboard.html of
      // /bestellingen-dashboard.html opent en de data ziet die de
      // regels nu serverseitig blokkeren.
      if (role === 'bakker') {
        var bakkerAllowed = [
          '/notities.html', '/notitie.html',
          '/checkin.html',
          '/ocb.html',
          '/qr-codes.html',
          '/portaal.html'
        ].concat(ALWAYS_OK);
        var pn = (location.pathname || '').toLowerCase();
        var bakkerOk = bakkerAllowed.some(function (p) { return pn === p || pn.endsWith(p); });
        if (!bakkerOk) {
          location.replace('/notities.html');
          return;
        }
      }

      // Custom rol: allowlist opbouwen uit claims.pages ('|x|y|z|').
      // Pages die niet meekomen zijn dicht; navigatie buiten allowlist
      // redirect naar de eerste toegestane pagina.
      var customPages = [];
      if (role === 'custom') {
        var raw = typeof claims.pages === 'string' ? claims.pages : '';
        if (raw && raw.charAt(0) === '|') {
          customPages = raw.replace(/^\|/, '').replace(/\|$/, '').split('|').filter(Boolean);
        }
        var customAllowed = ALWAYS_OK.slice();
        customAllowed.push('/portaal.html'); // de hub is altijd toegankelijk
        customPages.forEach(function (code) {
          var files = PAGE_FILES[code] || [];
          files.forEach(function (f) { customAllowed.push(f); });
        });
        var pn2 = (location.pathname || '').toLowerCase();
        var customOk = customAllowed.some(function (p) { return pn2 === p || pn2.endsWith(p); });
        if (!customOk) {
          // Geen toegestane pagina-match → terug naar het persoonlijke portaal.
          location.replace('/portaal.html');
          return;
        }
      }

      window.__auth = {
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName || '',
        role: role,
        isAdmin:   role === 'admin',
        canManage: role === 'admin' || role === 'manager',
        canWrite:  role === 'admin' || role === 'manager' || role === 'medewerker' || role === 'bakker' || role === 'custom',
        isBakker:  role === 'bakker',
        isCustom:  role === 'custom',
        pages:     customPages,
        isFinance: claims.finance === true,
        // AI-assistent: admins altijd, anderen via de losse 'ai'-claim
        // (toggle in users.html, net als finance).
        canUseAi:  role === 'admin' || claims.ai === true,
        // Agent-modus (de AI mag de app bedienen): admins altijd, anderen
        // via de losse 'agent'-claim. Apart recht bovenop canUseAi.
        canUseAgent: role === 'admin' || claims.agent === true,
        logout: function () { signOutWithLog(); },
      };
      if (!window.__auth.canWrite) {
        var s = document.createElement('style');
        s.textContent = '[data-role="write"]{display:none!important}';
        document.head.appendChild(s);
      }
      // Verberg finance-only items voor niet-finance gebruikers.
      if (!window.__auth.isFinance) {
        var sf = document.createElement('style');
        sf.textContent = '[data-finance="1"]{display:none!important}';
        document.head.appendChild(sf);
      }
      // Custom rol: verberg alle nav-links naar pagina's die NIET in de
      // pages-claim zitten. We doen dit door eerst alle bekende pagina-
      // links te verbergen, dan de toegestane weer zichtbaar te maken.
      if (window.__auth.isCustom) {
        var allFiles = [];
        Object.keys(PAGE_FILES).forEach(function (k) {
          (PAGE_FILES[k] || []).forEach(function (f) { allFiles.push(f); });
        });
        var hideSel = allFiles.concat([
          '/dashboard.html', '/audit.html', '/users.html',
        ]).map(function (f) {
          return 'a[href*="' + f.replace(/^\//, '') + '"]';
        }).join(',');
        var sc = document.createElement('style');
        sc.textContent = hideSel + '{display:none!important}';
        document.head.appendChild(sc);
        // Toegestane terug zichtbaar maken (overrided !important met
        // hogere specificiteit via attribute selector chain).
        var allowedFiles = [];
        customPages.forEach(function (code) {
          (PAGE_FILES[code] || []).forEach(function (f) { allowedFiles.push(f); });
        });
        if (allowedFiles.length) {
          var showSel = allowedFiles.map(function (f) {
            return 'html body a[href*="' + f.replace(/^\//, '') + '"]';
          }).join(',');
          var sc2 = document.createElement('style');
          sc2.textContent = showSel + '{display:revert!important}';
          document.head.appendChild(sc2);
        }
        // Externe links (eventpay, keuringen-saas) altijd dicht voor custom.
        var sc3 = document.createElement('style');
        sc3.textContent = 'a[href*="senorsnacks-eventpay"],a[href*="senorkeuringqr"]{display:none!important}';
        document.head.appendChild(sc3);
      }
      // Verberg voor bakker alle navigatie naar paden die ze niet mogen
      // openen — zodat ze niet kunnen klikken op iets dat hen toch
      // direct doorstuurt naar notities.html.
      if (window.__auth.isBakker) {
        var sb = document.createElement('style');
        sb.textContent = [
          'a[href*="dashboard.html"]',
          'a[href*="planning.html"]',
          'a[href*="verhuur.html"]',
          'a[href*="served_verhuur.html"]',
          'a[href*="poets.html"]',
          'a[href*="vet.html"]',
          'a[href*="vet-tonnen.html"]',
          'a[href*="ops.html"]',
          'a[href*="lijsten.html"]',
          'a[href*="checklists.html"]',
          'a[href*="checklist-detail.html"]',
          'a[href*="laadlijst-beheer.html"]',
          'a[href*="laadlijst-koppeling.html"]',
          'a[href*="archief.html"]',
          'a[href*="audit.html"]',
          'a[href*="users.html"]',
          'a[href*="bestelling.html"]',
          'a[href*="bestellingen-dashboard.html"]',
          'a[href*="bestel-catalogus.html"]',
          'a[href*="horeca-planning.html"]',
          'a[href*="stroomaanvraag.html"]',
          'a[href*="event-sheet.html"]',
          'a[href*="eindstock.html"]',
          'a[href*="senorsnacks-eventpay"]',
          'a[href*="senorkeuringqr"]',
          'a[href*="keuringen.html"]',
          '[data-bakker-hide]'
        ].join(',') + '{display:none!important}';
        document.head.appendChild(sb);
      }
      var hideEl = document.getElementById('__auth_hide');
      if (hideEl) hideEl.remove();
      // Centrale verwijder-logger: schrijft wie/wat/wanneer (+ verwijderde
      // inhoud) naar _deletions, zodat de audit-log toont wat er weg is en het
      // recupereerbaar blijft. Faalt stil — mag een verwijdering NOOIT blokkeren.
      window.logDeletion = window.logDeletion || function (type, label, detail) {
        try {
          if (typeof firebase === 'undefined' || typeof firebase.database !== 'function') return;
          var a = window.__auth || {};
          firebase.database().ref('_deletions').push({
            type:   String(type == null ? 'onbekend' : type).slice(0, 60),
            label:  String(label == null ? '' : label).slice(0, 300),
            ref:    (detail && detail.ref != null) ? String(detail.ref).slice(0, 200) : '',
            detail: detail ? JSON.stringify(detail).slice(0, 3900) : '',
            at:     firebase.database.ServerValue.TIMESTAMP,
            uid:    String(a.uid || '').slice(0, 200),
            email:  String(a.email || '').slice(0, 200),
            name:   String(a.displayName || a.email || '').slice(0, 200),
            page:   String(location.pathname || '').slice(0, 200)
          }).catch(function () { /* niet kritiek */ });
        } catch (e) { /* nooit blokkeren */ }
      };
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
      // AI-assistent: voor admins + gebruikers met de 'ai'-claim, en pas
      // hier ingeladen zodat anderen het script niet eens binnenhalen.
      // Verschijnt app-breed.
      if (window.__auth.canUseAi && !document.getElementById('__ai_chat_js')) {
        var aiScript = document.createElement('script');
        aiScript.id = '__ai_chat_js';
        aiScript.src = '/ai-chat.js?v=8';
        aiScript.defer = true;
        (document.body || document.documentElement).appendChild(aiScript);
      }
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
