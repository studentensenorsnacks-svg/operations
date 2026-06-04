// AI-chat widget voor de operations-app.
//
// Zwevend chat-paneel dat ENKEL voor admins wordt ingeladen (zie auth.js,
// dat dit script pas injecteert wanneer role === 'admin'). Praat met Claude
// via de bestaande /api/anthropic proxy — de API-key blijft serverside.
//
// Twee gebruiksdoelen:
//   • Snelle vragen / hulp.
//   • Diepere vragen over het systeem — Claude kan met read-only tools de
//     RTDB verkennen en uitlezen om datavragen te beantwoorden.
//
// Alles is ALLEEN-LEZEN. Er zijn bewust geen schrijf-/actie-tools: een LLM
// mag in dit operations-systeem niets muteren zonder mens-in-de-lus.
(function () {
  'use strict';
  if (window.__aiChatLoaded) return;
  window.__aiChatLoaded = true;

  var API = '/api/anthropic';
  var MODELS = {
    snel: 'claude-sonnet-4-6',   // standaard: snel & goedkoop
    diep: 'claude-opus-4-8',     // diepere/complexere vragen
  };
  var MAX_TOKENS = 2048;
  var TOOL_LOOP_MAX = 8;          // vangnet tegen oneindige tool-lussen
  var RESULT_CAP = 6000;          // max tekens per tool-resultaat richting Claude

  // ── Gesprekstoestand ────────────────────────────────────────────
  var messages = [];   // Anthropic messages-array (rollen user/assistant)
  var busy = false;
  var model = MODELS.snel;

  // ── Systeem-prompt: wie Claude is + wat de app is ───────────────
  function systemPrompt() {
    var u = window.__auth || {};
    return [
      'Je bent de ingebouwde AI-assistent van het Señor Snacks "Operations"-systeem,',
      'een interne web-app voor de foodtruck-operatie. Je praat met een ADMIN.',
      '',
      'Antwoord standaard in het Nederlands, kort en concreet. Geen overbodige uitleg.',
      '',
      'Wat de app doet (modules/pagina\'s):',
      '- Planning & verhuur: events en verhuringen inplannen (planning.html, verhuur.html).',
      '- Laadlijsten & checklists: wat er per foodtruck mee moet (lijsten.html, checklists.html,',
      '  checklist-detail.html, laadlijst-beheer.html). RTDB o.a. ft_laadlijsten_v1, ft_checklist_types_v1.',
      '- Ops/eventfiche (ops.html) en eindstock (eindstock.html).',
      '- Vet-tonnen (vet.html, vet-tonnen.html) en poets (poets.html) — met externe read-only dashboards.',
      '- Keuringen (ocb.html), bestellingen (bestelling.html, bestel-catalogus.html), QR-codes, notities.',
      '- Gebruikersbeheer (users.html) en audit (audit.html).',
      '',
      'Auth & rollen: Firebase Auth met custom-claim rollen: admin, manager, medewerker, bakker,',
      'en custom (eigen allowlist van toegestane pagina\'s). Daarnaast een finance-vlag. Data staat in',
      'Realtime Database (project operationssenorsnacks).',
      '',
      'Datavragen: je hebt read-only tools om de RTDB te verkennen (list_keys) en uit te lezen (read_rtdb).',
      'Gebruik die om concrete vragen over de echte data te beantwoorden. Ken je de exacte node-naam niet,',
      'begin dan met list_keys op "/" en werk naar beneden. Verzin nooit data — lees het op of zeg dat je',
      'het niet vindt. Je kunt NIETS wijzigen; bij wijzig-verzoeken leg je uit wat de admin zelf moet doen.',
      '',
      'Huidige context: gebruiker = ' + (u.email || 'onbekend') + ', pagina = ' + location.pathname + '.',
    ].join('\n');
  }

  // ── Tools (alleen-lezen, client-side via de admin-sessie) ───────
  var TOOLS = [
    {
      name: 'list_keys',
      description: 'Lijst de directe child-keys op een RTDB-pad (zonder de volledige waarden) ' +
        'plus per key het waarde-type. Gebruik dit om de databasestructuur te verkennen. ' +
        'Pad "/" geeft de top-level nodes.',
      input_schema: {
        type: 'object',
        properties: { path: { type: 'string', description: 'RTDB-pad, bv. "/" of "ft_laadlijsten_v1".' } },
        required: ['path'],
      },
    },
    {
      name: 'read_rtdb',
      description: 'Lees de volledige data op een RTDB-pad en geef het als JSON terug. ' +
        'Grote resultaten worden afgekapt; verfijn dan met een dieper pad. Alleen-lezen.',
      input_schema: {
        type: 'object',
        properties: { path: { type: 'string', description: 'RTDB-pad, bv. "ft_checklist_types_v1/abc123".' } },
        required: ['path'],
      },
    },
  ];

  function db() {
    if (!window.firebase || typeof firebase.database !== 'function') return null;
    try { return firebase.database(); } catch (e) { return null; }
  }
  function normPath(p) {
    p = String(p == null ? '' : p).trim();
    if (p === '' || p === '/') return '/';
    return p.replace(/^\/+/, '').replace(/\/+$/, '');
  }
  function cap(str) {
    if (str.length <= RESULT_CAP) return str;
    return str.slice(0, RESULT_CAP) + '\n…(afgekapt — lees een dieper/specifieker pad voor de rest)';
  }

  function runTool(name, input) {
    var d = db();
    if (!d) return Promise.resolve('FOUT: geen database beschikbaar op deze pagina.');
    var path = normPath(input && input.path);
    var ref = path === '/' ? d.ref() : d.ref(path);
    return ref.get().then(function (snap) {
      if (!snap.exists()) return 'Geen data op pad "' + path + '".';
      var val = snap.val();
      if (name === 'list_keys') {
        if (val === null || typeof val !== 'object') {
          return 'Pad "' + path + '" is een waarde (geen object): ' + JSON.stringify(val);
        }
        var keys = Object.keys(val).map(function (k) {
          var t = Array.isArray(val[k]) ? 'array[' + val[k].length + ']'
            : (val[k] !== null && typeof val[k] === 'object') ? 'object[' + Object.keys(val[k]).length + ']'
            : typeof val[k];
          return '- ' + k + ' (' + t + ')';
        });
        return keys.length + ' keys op "' + path + '":\n' + cap(keys.join('\n'));
      }
      // read_rtdb
      return cap(JSON.stringify(val, null, 2));
    }).catch(function (e) {
      return 'FOUT bij lezen "' + path + '": ' + (e && e.message ? e.message : String(e));
    });
  }

  // ── API-call ────────────────────────────────────────────────────
  function callApi() {
    return fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        max_tokens: MAX_TOKENS,
        system: systemPrompt(),
        tools: TOOLS,
        messages: messages,
      }),
    }).then(function (r) { return r.json(); });
  }

  // ── Conversatielus met tool-afhandeling ─────────────────────────
  function send(text) {
    if (busy) return;
    text = (text || '').trim();
    if (!text) return;
    busy = true;
    messages.push({ role: 'user', content: text });
    addBubble('user', text);
    setInput('');
    var thinking = addBubble('assistant', '…', true);

    var guard = 0;
    function step() {
      return callApi().then(function (data) {
        if (data && data.error) {
          thinking.remove();
          addBubble('error', (data.error.message || 'Er ging iets mis.'));
          busy = false;
          return;
        }
        var content = (data && data.content) || [];
        messages.push({ role: 'assistant', content: content });

        // Toon tekstblokken.
        var txt = content.filter(function (b) { return b.type === 'text'; })
          .map(function (b) { return b.text; }).join('\n').trim();
        if (txt) { thinking.remove(); addBubble('assistant', txt); thinking = addBubble('assistant', '…', true); }

        if (data.stop_reason === 'tool_use' && guard++ < TOOL_LOOP_MAX) {
          var calls = content.filter(function (b) { return b.type === 'tool_use'; });
          thinking.querySelector('.ai-txt').textContent = '🔎 ' + calls.map(function (c) {
            return c.name + '(' + ((c.input && c.input.path) || '') + ')';
          }).join(', ');
          return Promise.all(calls.map(function (c) {
            return runTool(c.name, c.input).then(function (out) {
              return { type: 'tool_result', tool_use_id: c.id, content: String(out) };
            });
          })).then(function (results) {
            messages.push({ role: 'user', content: results });
            return step();
          });
        }
        thinking.remove();
        busy = false;
      }).catch(function (e) {
        thinking.remove();
        addBubble('error', 'Netwerkfout: ' + (e && e.message ? e.message : String(e)));
        busy = false;
      });
    }
    step();
  }

  // ── UI ──────────────────────────────────────────────────────────
  var panel, log, input, btnSend, fab;

  function injectStyles() {
    var s = document.createElement('style');
    s.textContent = [
      '#ai-fab{position:fixed;right:18px;bottom:18px;z-index:2147483600;width:54px;height:54px;border-radius:50%;',
      'background:#e8662b;color:#fff;border:none;cursor:pointer;box-shadow:0 4px 14px rgba(232,102,43,.4);',
      'font-size:24px;display:flex;align-items:center;justify-content:center;transition:transform .12s,background .12s}',
      '#ai-fab:hover{background:#d05420;transform:scale(1.05)}',
      '#ai-panel{position:fixed;right:18px;bottom:84px;z-index:2147483600;width:380px;max-width:calc(100vw - 36px);',
      'height:560px;max-height:calc(100vh - 120px);background:#fdf8f0;border:1px solid rgba(120,60,20,.18);',
      'border-radius:14px;box-shadow:0 12px 40px rgba(60,30,10,.28);display:none;flex-direction:column;overflow:hidden;',
      'font-family:-apple-system,BlinkMacSystemFont,Inter,"Segoe UI",sans-serif;color:#3a2415}',
      '#ai-panel.open{display:flex}',
      '#ai-head{padding:12px 14px;background:#fff;border-bottom:1px solid rgba(120,60,20,.12);display:flex;',
      'align-items:center;gap:8px}',
      '#ai-head b{font-size:14px;flex:1}',
      '#ai-model{font-size:12px;border:1px solid rgba(120,60,20,.2);border-radius:8px;padding:4px 6px;background:#fdf8f0;color:#3a2415}',
      '#ai-close{background:none;border:none;font-size:20px;cursor:pointer;color:#7a5a40;line-height:1;padding:0 4px}',
      '#ai-log{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px}',
      '.ai-b{max-width:85%;padding:9px 12px;border-radius:12px;font-size:13.5px;line-height:1.5;white-space:pre-wrap;word-wrap:break-word}',
      '.ai-b.user{align-self:flex-end;background:#e8662b;color:#fff;border-bottom-right-radius:4px}',
      '.ai-b.assistant{align-self:flex-start;background:#fff;border:1px solid rgba(120,60,20,.12);border-bottom-left-radius:4px}',
      '.ai-b.error{align-self:flex-start;background:#fde2dd;color:#7a2818;border:1px solid #f0a896}',
      '.ai-b.tool{align-self:flex-start;background:#f3ece1;color:#7a5a40;font-family:monospace;font-size:12px}',
      '#ai-foot{padding:10px;border-top:1px solid rgba(120,60,20,.12);background:#fff;display:flex;gap:8px;align-items:flex-end}',
      '#ai-input{flex:1;resize:none;border:1px solid rgba(120,60,20,.2);border-radius:10px;padding:9px 11px;',
      'font-size:13.5px;font-family:inherit;color:#3a2415;outline:none;max-height:120px;line-height:1.4}',
      '#ai-input:focus{border-color:#e8662b;box-shadow:0 0 0 3px #fef0e2}',
      '#ai-send{background:#e8662b;color:#fff;border:none;border-radius:10px;padding:9px 14px;cursor:pointer;',
      'font-size:13px;font-weight:600;font-family:inherit}',
      '#ai-send:disabled{opacity:.5;cursor:default}',
    ].join('');
    (document.head || document.documentElement).appendChild(s);
  }

  function esc(t) {
    return String(t).replace(/[&<>]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]); });
  }

  function addBubble(kind, text, transient) {
    var cls = kind === 'user' ? 'user' : kind === 'error' ? 'error' : transient ? 'tool' : 'assistant';
    var div = document.createElement('div');
    div.className = 'ai-b ' + cls;
    div.innerHTML = '<span class="ai-txt">' + esc(text) + '</span>';
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
    return div;
  }
  function setInput(v) { input.value = v; input.style.height = 'auto'; }

  function build() {
    if (!document.body) { return setTimeout(build, 30); }
    injectStyles();

    fab = document.createElement('button');
    fab.id = 'ai-fab';
    fab.title = 'AI-assistent';
    fab.textContent = '✦';
    document.body.appendChild(fab);

    panel = document.createElement('div');
    panel.id = 'ai-panel';
    panel.innerHTML =
      '<div id="ai-head">' +
        '<b>✦ AI-assistent</b>' +
        '<select id="ai-model" title="Model"><option value="snel">Snel</option><option value="diep">Diep</option></select>' +
        '<button id="ai-close" title="Sluiten">×</button>' +
      '</div>' +
      '<div id="ai-log"></div>' +
      '<div id="ai-foot">' +
        '<textarea id="ai-input" rows="1" placeholder="Vraag iets…"></textarea>' +
        '<button id="ai-send">Stuur</button>' +
      '</div>';
    document.body.appendChild(panel);

    log = panel.querySelector('#ai-log');
    input = panel.querySelector('#ai-input');
    btnSend = panel.querySelector('#ai-send');

    addBubble('assistant', 'Hoi! Stel een vraag over het systeem of de data. Ik kan de database read-only doorzoeken.');

    fab.onclick = function () {
      panel.classList.toggle('open');
      if (panel.classList.contains('open')) setTimeout(function () { input.focus(); }, 50);
    };
    panel.querySelector('#ai-close').onclick = function () { panel.classList.remove('open'); };
    panel.querySelector('#ai-model').onchange = function () { model = MODELS[this.value] || MODELS.snel; };

    function submit() { var v = input.value; setInput(''); send(v); }
    btnSend.onclick = submit;
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
    });
    input.addEventListener('input', function () {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    });
  }

  build();
})();
