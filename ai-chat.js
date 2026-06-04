// AI-chat + agent voor de operations-app.
//
// Zwevend chat-paneel dat ENKEL geladen wordt voor wie het mag (admin of de
// 'ai'-claim — zie auth.js). Praat met Claude/Mistral via de bestaande
// /api/anthropic en /api/mistral proxies (API-keys blijven serverside).
//
// Mogelijkheden:
//   • Vragen stellen over het systeem en de data (read-only RTDB-tools).
//   • AGENT: de assistent kan handelingen voorstellen — klikken, velden
//     invullen, navigeren — die PAS na jouw goedkeuring (per actie) worden
//     uitgevoerd. Het gesprek wordt bewaard over paginawissels heen, zodat
//     de agent door de hele (multi-page) app kan werken.
//
// Veiligheid: geen enkele actie draait zonder expliciete klik op
// "Goedkeuren". Schrijfacties lopen via de gewone UI (en dus via de
// bestaande validatie + database-rules), niet via directe DB-writes.
(function () {
  'use strict';
  if (window.__aiChatLoaded) return;
  window.__aiChatLoaded = true;

  var MODELS = {
    sonnet:  { id: 'claude-sonnet-4-6',         api: '/api/anthropic' }, // standaard: slim
    haiku:   { id: 'claude-haiku-4-5-20251001', api: '/api/anthropic' }, // snel & goedkoop
    mistral: { id: 'mistral-large-latest',      api: '/api/mistral' },
  };
  var MAX_TOKENS = 2048;
  var TOOL_LOOP_MAX = 25;     // agent mag meerdere stappen zetten
  var RESULT_CAP = 6000;      // max tekens per data-tool-resultaat
  var STATE_KEY = 'ai_chat_state_v1';

  // ── Toestand ────────────────────────────────────────────────────
  var messages = [];          // Anthropic messages-array
  var busy = false;
  var modelKey = 'sonnet';
  var model = MODELS[modelKey];
  var pending = null;         // {id, desc}: actie die mogelijk een reload uitlokt
  var resumeAfterLoad = false;
  var agentMode = false;      // false = enkel vragen/lezen; true = mag handelen

  // ── Persistentie over paginawissels ─────────────────────────────
  function persist() {
    try {
      sessionStorage.setItem(STATE_KEY, JSON.stringify({
        messages: messages, modelKey: modelKey, open: isOpen(),
        pending: pending, resume: resumeAfterLoad, agent: agentMode,
      }));
    } catch (e) { /* quota/serialisatie — niet kritiek */ }
  }
  function clearPersist() { try { sessionStorage.removeItem(STATE_KEY); } catch (e) {} }

  // ── Systeem-prompt ──────────────────────────────────────────────
  function systemPrompt() {
    var u = window.__auth || {};
    var snap = buildSnapshot();
    var parts = [
      'Je bent de ingebouwde AI-assistent van het Señor Snacks "Operations"-systeem,',
      'een interne web-app voor de foodtruck-operatie.',
      '',
      'Antwoord in het Nederlands, kort en concreet.',
      '',
      'MODULES (pagina\'s): planning/verhuur (planning.html, verhuur.html); laadlijsten & checklists',
      '(lijsten.html, checklists.html, checklist-detail.html, laadlijst-beheer.html); ops/eventfiche',
      '(ops.html); eindstock (eindstock.html); vet (vet.html, vet-tonnen.html) & poets (poets.html);',
      'keuringen (ocb.html); bestellingen (bestelling.html, bestel-catalogus.html); QR-codes; notities;',
      'gebruikersbeheer (users.html); audit (audit.html).',
      '',
      'ROLLEN: admin, manager, medewerker, bakker, custom (eigen pagina-allowlist). Vlaggen: finance, ai.',
      '',
      '== DATA LEZEN (read-only) ==',
      'Tools read_rtdb en list_keys lezen de Realtime Database. LET OP: de root "/" is afgeschermd —',
      'lees daar NOOIT; begin bij een specifieke node. Belangrijkste nodes: ft_planning_v1 (events),',
      'ft_ops_v1/ft_ops_v2, ft_laadlijst_v1/ft_laadlijsten_v1/ft_horeca_laadlijst_v1/ft_fiches_v1,',
      'ft_eindstock_v1, ft_priority_v1+ft_poets_history (poets), vet_tonnen, ft_bestellingen_v1,',
      'ft_bestel_catalogus_v1, ocb_keuringen, ft_qrcodes_v1, ft_notities_v1, ft_archief_v1, ft_trucks_v1.',
      'Krijg je "geen data"/fout, dan mag deze gebruiker die node niet zien. Verzin nooit data.',
      '',
    ];
    if (agentMode) {
      parts.push(
        '== AGENT-MODUS AAN: HANDELINGEN ==',
        'Je kunt de app bedienen met de tools click, fill en navigate. Elke handeling moet de gebruiker',
        'eerst GOEDKEUREN; voer nooit iets uit zonder dat. Werkwijze:',
        '- Verwijs naar elementen met het [nummer] uit het live-overzicht onderaan deze prompt.',
        '- Eén stap per keer. Na elke handeling krijg je een verse weergave van het scherm — bekijk die',
        '  voor je de volgende stap kiest.',
        '- click [n]: klikt knop/tab/link [n]. fill [n] "waarde": vult veld [n]. navigate "/x.html": opent',
        '  een andere pagina (het gesprek loopt gewoon door op de nieuwe pagina).',
        '- Voor je begint met een taak: vat in één zin samen wat je gaat doen. Wees extra voorzichtig met',
        '  verwijder-/verstuur-acties en zeg expliciet wat het gevolg is.',
        '- Kan de gebruiker iets sneller zelf? Leg het dan gewoon uit i.p.v. te handelen.',
        ''
      );
    } else {
      parts.push(
        '== VRAGEN-MODUS (alleen-lezen) ==',
        'Je beantwoordt vragen en mag data LEZEN, maar je kunt NIETS bedienen of bewerken: er zijn geen',
        'klik-/invul-/navigeer-tools in deze modus. Wil de gebruiker dat je iets DOET in de app, zeg dan',
        'dat ze rechtsboven in de chat de "Agent"-modus moeten aanzetten. Je mag wel in tekst uitleggen',
        'waar een knop/tab staat (gebruik de labels uit het scherm-overzicht hieronder).',
        ''
      );
    }
    parts.push(
      'Context: gebruiker = ' + (u.email || 'onbekend') + ' (rol: ' + (u.role || '?') + '), ' +
        'pagina = ' + location.pathname + ' — "' + (document.title || '') + '".',
      '',
      snap.text
    );
    return parts.join('\n');
  }

  // ── Snapshot: tag interactieve elementen met refs + tekstweergave ─
  function buildSnapshot() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-ai-ref]'), function (el) {
      el.removeAttribute('data-ai-ref'); el.removeAttribute('data-ai-label');
    });
    function visible(el) { return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length)); }
    function clip(s, n) { s = (s == null ? '' : String(s)).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '…' : s; }

    var sel = 'button, a[href], input:not([type=hidden]), select, textarea, [role="button"], .nav-item, [onclick]';
    var els = document.querySelectorAll(sel);
    var lines = [], ref = 0, seen = [];
    Array.prototype.forEach.call(els, function (el) {
      if (!visible(el) || seen.indexOf(el) !== -1 || ref >= 120) return;
      seen.push(el);
      var tag = el.tagName.toLowerCase(), role, label = '', extra = '';
      if (tag === 'input') {
        var ty = (el.type || 'text').toLowerCase();
        role = 'invoer(' + ty + ')';
        label = (el.labels && el.labels[0] ? el.labels[0].textContent : '') || el.placeholder || el.name || el.getAttribute('aria-label') || '';
        if (ty === 'checkbox' || ty === 'radio') extra = el.checked ? ' [aan]' : ' [uit]';
        else if (el.value) extra = ' = "' + clip(el.value, 30) + '"';
      } else if (tag === 'select') {
        role = 'keuze'; label = el.name || el.getAttribute('aria-label') || '';
        var o = el.options[el.selectedIndex]; if (o) extra = ' = "' + clip(o.textContent, 30) + '"';
      } else if (tag === 'textarea') {
        role = 'tekstvak'; label = el.placeholder || el.name || el.getAttribute('aria-label') || '';
        if (el.value) extra = ' = "' + clip(el.value, 30) + '"';
      } else if (tag === 'a') {
        role = 'link'; label = clip(el.textContent, 50);
        var href = el.getAttribute('href') || '';
        if (/\.html/.test(href)) extra = ' -> ' + href;
      } else {
        var isTab = /(^|\s)nav-item(\s|$)/.test(el.className);
        role = isTab ? 'tab' : 'knop';
        label = clip(el.textContent, 50) || el.getAttribute('aria-label') || el.title || '';
        var m = (el.getAttribute('onclick') || '').match(/showPage\(['"]([^'"]+)['"]\)/);
        if (m) extra += ' [showPage:' + m[1] + ']';
        if (/(^|\s)active(\s|$)/.test(el.className)) extra += ' (ACTIEF)';
      }
      label = label || '(geen label)';
      el.setAttribute('data-ai-ref', String(ref));
      el.setAttribute('data-ai-label', role + ' "' + clip(label, 40) + '"');
      lines.push('[' + ref + '] ' + role + ' "' + clip(label, 50) + '"' + extra);
      ref++;
    });
    var txt = '== Interactieve elementen op dit scherm (gebruik het [nummer] in click/fill) ==\n' +
      (lines.length ? lines.join('\n') : '(geen interactieve elementen gevonden)');
    if (txt.length > 6500) txt = txt.slice(0, 6500) + '\n…(ingekort)';
    return { text: txt, count: ref };
  }

  function refEl(ref) { return document.querySelector('[data-ai-ref="' + ref + '"]'); }
  function refLabel(el) { return (el && el.getAttribute('data-ai-label')) || 'element'; }

  // ── Tools ────────────────────────────────────────────────────────
  var READ_TOOLS = [
    {
      name: 'read_rtdb',
      description: 'Lees de data op een RTDB-pad als JSON (alleen-lezen). Grote resultaten worden afgekapt.',
      input_schema: { type: 'object', properties: { path: { type: 'string', description: 'bv. "ft_planning_v1/2026".' } }, required: ['path'] },
    },
    {
      name: 'list_keys',
      description: 'Lijst de child-keys + types op een RTDB-pad (alleen-lezen). Niet op "/" (afgeschermd).',
      input_schema: { type: 'object', properties: { path: { type: 'string', description: 'bv. "ft_laadlijsten_v1".' } }, required: ['path'] },
    },
  ];
  var ACTION_TOOLS = [
    {
      name: 'click',
      description: 'Klik op een element (knop, tab, link) via het [nummer] uit het scherm-overzicht. ' +
        'Vereist goedkeuring van de gebruiker. Kan een paginawissel veroorzaken.',
      input_schema: { type: 'object', properties: { ref: { type: 'integer', description: 'Het nummer van het element.' } }, required: ['ref'] },
    },
    {
      name: 'fill',
      description: 'Vul een invoerveld/keuzelijst/tekstvak in via het [nummer]. value is de tekst, ' +
        'de optie-tekst (bij keuze), of "aan"/"uit" (bij vinkje). Vereist goedkeuring.',
      input_schema: { type: 'object', properties: { ref: { type: 'integer' }, value: { type: 'string' } }, required: ['ref', 'value'] },
    },
    {
      name: 'navigate',
      description: 'Open een andere pagina via de URL (bv. "/planning.html"). Vereist goedkeuring. ' +
        'Het gesprek loopt automatisch door op de nieuwe pagina.',
      input_schema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
    },
  ];
  function activeTools() { return agentMode ? READ_TOOLS.concat(ACTION_TOOLS) : READ_TOOLS; }

  function db() {
    if (!window.firebase || typeof firebase.database !== 'function') return null;
    try { return firebase.database(); } catch (e) { return null; }
  }
  function normPath(p) {
    p = String(p == null ? '' : p).trim();
    if (p === '' || p === '/') return '/';
    return p.replace(/^\/+/, '').replace(/\/+$/, '');
  }
  function cap(str) { return str.length <= RESULT_CAP ? str : str.slice(0, RESULT_CAP) + '\n…(afgekapt — lees een specifieker pad)'; }
  function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // ── Data-tools (read-only) ──────────────────────────────────────
  function readData(name, input) {
    var d = db();
    if (!d) return Promise.resolve('FOUT: geen database beschikbaar op deze pagina.');
    var path = normPath(input && input.path);
    if (path === '/') return Promise.resolve('De root "/" is afgeschermd. Lees een specifieke node.');
    return d.ref(path).get().then(function (snap) {
      if (!snap.exists()) return 'Geen data op pad "' + path + '".';
      var val = snap.val();
      if (name === 'list_keys') {
        if (val === null || typeof val !== 'object') return 'Pad "' + path + '" is een waarde: ' + JSON.stringify(val);
        var keys = Object.keys(val).map(function (k) {
          var t = Array.isArray(val[k]) ? 'array[' + val[k].length + ']'
            : (val[k] !== null && typeof val[k] === 'object') ? 'object[' + Object.keys(val[k]).length + ']'
            : typeof val[k];
          return '- ' + k + ' (' + t + ')';
        });
        return keys.length + ' keys op "' + path + '":\n' + cap(keys.join('\n'));
      }
      return cap(JSON.stringify(val, null, 2));
    }).catch(function (e) { return 'FOUT bij lezen "' + path + '": ' + (e && e.message ? e.message : String(e)); });
  }

  // ── Acties (met goedkeuring) ────────────────────────────────────
  function doFill(el, value) {
    var tag = el.tagName.toLowerCase(), ty = (el.type || '').toLowerCase();
    if (tag === 'select') {
      var matched = false;
      Array.prototype.forEach.call(el.options, function (o) {
        if (matched) return;
        var t = o.textContent.trim();
        if (o.value === value || t === value || t.toLowerCase() === String(value).toLowerCase()) { el.value = o.value; matched = true; }
      });
      if (!matched) el.value = value;
    } else if (ty === 'checkbox' || ty === 'radio') {
      el.checked = /^(aan|true|1|ja|yes|on)$/i.test(String(value));
    } else {
      el.value = value;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function runTool(name, input, toolUseId) {
    if (name === 'read_rtdb' || name === 'list_keys') return readData(name, input);

    if (name === 'navigate') {
      var url = String((input && input.url) || '').trim();
      if (!url) return Promise.resolve('FOUT: geen url.');
      return requestApproval('Navigeren naar: ' + url).then(function (ok) {
        // De eigenlijke navigatie gebeurt pas nadat alle tool_results van
        // deze beurt zijn weggeschreven (zie runLoop), zodat de messages
        // consistent blijven over de paginawissel heen.
        return ok ? { __nav: url } : 'Door gebruiker geweigerd.';
      });
    }

    if (name === 'click' || name === 'fill') {
      var el = refEl(input && input.ref);
      if (!el) return Promise.resolve('Element [' + (input && input.ref) + '] niet (meer) gevonden. Bekijk de verse weergave en kies een geldig nummer.');
      var lbl = refLabel(el);
      var desc = name === 'click' ? ('Klik op ' + lbl) : ('Vul ' + lbl + ' in met: "' + (input && input.value) + '"');
      return requestApproval(desc).then(function (ok) {
        if (!ok) return 'Door gebruiker geweigerd.';
        if (name === 'fill') {
          try { doFill(el, String(input.value)); } catch (e) { return 'FOUT bij invullen: ' + e.message; }
          return 'Ingevuld: ' + lbl + ' = "' + input.value + '".';
        }
        // click — kan een reload uitlokken; markeer pending vóór de klik.
        pending = { id: toolUseId, desc: desc }; persist();
        try { el.click(); } catch (e) { pending = null; return 'FOUT bij klikken: ' + e.message; }
        return delay(220).then(function () {
          // Nog steeds hier => geen volledige navigatie opgetreden.
          pending = null; persist();
          return 'Geklikt op ' + lbl + '.';
        });
      });
    }
    return Promise.resolve('Onbekende tool: ' + name);
  }

  // ── API-call ────────────────────────────────────────────────────
  function callApi() {
    return fetch(model.api, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: model.id, max_tokens: MAX_TOKENS, system: systemPrompt(), tools: activeTools(), messages: messages }),
    }).then(function (r) { return r.json(); });
  }

  // ── Hoofdlus (tool-afhandeling, sequentieel zodat goedkeuringen
  //     één voor één verschijnen) ───────────────────────────────────
  function runLoop() {
    busy = true; updateBusy();
    var thinking = addBubble('assistant', '…', true);
    var guard = 0;

    function step() {
      return callApi().then(function (data) {
        if (data && data.error) {
          if (thinking) { thinking.remove(); thinking = null; }
          addBubble('error', (data.error.message || 'Er ging iets mis.'));
          busy = false; updateBusy(); persist();
          return;
        }
        var content = (data && data.content) || [];
        messages.push({ role: 'assistant', content: content });
        persist();

        var txt = content.filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('\n').trim();
        if (thinking) { thinking.remove(); thinking = null; }
        if (txt) addBubble('assistant', txt);

        if (data.stop_reason === 'tool_use' && guard++ < TOOL_LOOP_MAX) {
          var calls = content.filter(function (b) { return b.type === 'tool_use'; });
          var results = [], navTarget = null;
          // sequentieel afhandelen zodat goedkeuringen één voor één komen
          var chain = Promise.resolve();
          calls.forEach(function (c) {
            chain = chain.then(function () {
              thinking = addBubble('assistant', toolLabel(c), true);
              return runTool(c.name, c.input, c.id).then(function (out) {
                if (thinking) { thinking.remove(); thinking = null; }
                if (out && out.__nav) {
                  navTarget = out.__nav;
                  results.push({ type: 'tool_result', tool_use_id: c.id, content: 'Navigatie naar ' + out.__nav + ' gestart.' });
                } else {
                  results.push({ type: 'tool_result', tool_use_id: c.id, content: String(out) });
                }
              });
            });
          });
          return chain.then(function () {
            messages.push({ role: 'user', content: results });
            persist();
            if (navTarget) { resumeAfterLoad = true; persist(); location.href = navTarget; return; }
            thinking = addBubble('assistant', '…', true);
            return step();
          });
        }
        busy = false; updateBusy(); persist();
      }).catch(function (e) {
        if (thinking) { thinking.remove(); thinking = null; }
        addBubble('error', 'Netwerkfout: ' + (e && e.message ? e.message : String(e)));
        busy = false; updateBusy(); persist();
      });
    }
    return step();
  }

  function toolLabel(c) {
    if (c.name === 'click') return '🖱️ klik [' + (c.input && c.input.ref) + ']';
    if (c.name === 'fill') return '⌨️ invullen [' + (c.input && c.input.ref) + ']';
    if (c.name === 'navigate') return '➜ ' + (c.input && c.input.url);
    return '🔎 ' + c.name + '(' + ((c.input && c.input.path) || '') + ')';
  }

  function send(text) {
    if (busy) return;
    text = (text || '').trim();
    if (!text) return;
    messages.push({ role: 'user', content: text });
    addBubble('user', text);
    setInput('');
    persist();
    runLoop();
  }

  // ── UI ──────────────────────────────────────────────────────────
  var panel, log, input, btnSend, modeBtn;

  function updateModeBtn() {
    if (!modeBtn) return;
    modeBtn.textContent = agentMode ? '🛠️ Agent' : '💬 Vragen';
    modeBtn.className = agentMode ? 'agent' : '';
  }

  function injectStyles() {
    var s = document.createElement('style');
    s.textContent = [
      '#ai-fab{position:fixed;right:18px;bottom:18px;z-index:2147483600;width:54px;height:54px;border-radius:50%;',
      'background:#e8662b;color:#fff;border:none;cursor:pointer;box-shadow:0 4px 14px rgba(232,102,43,.4);',
      'font-size:24px;display:flex;align-items:center;justify-content:center;transition:transform .12s,background .12s}',
      '#ai-fab:hover{background:#d05420;transform:scale(1.05)}',
      '#ai-panel{position:fixed;right:18px;bottom:84px;z-index:2147483600;width:390px;max-width:calc(100vw - 36px);',
      'height:580px;max-height:calc(100vh - 120px);background:#fdf8f0;border:1px solid rgba(120,60,20,.18);',
      'border-radius:14px;box-shadow:0 12px 40px rgba(60,30,10,.28);display:none;flex-direction:column;overflow:hidden;',
      'font-family:-apple-system,BlinkMacSystemFont,Inter,"Segoe UI",sans-serif;color:#3a2415}',
      '#ai-panel.open{display:flex}',
      '#ai-head{padding:12px 14px;background:#fff;border-bottom:1px solid rgba(120,60,20,.12);display:flex;align-items:center;gap:8px}',
      '#ai-head b{font-size:14px;flex:1}',
      '#ai-model{font-size:12px;border:1px solid rgba(120,60,20,.2);border-radius:8px;padding:4px 6px;background:#fdf8f0;color:#3a2415}',
      '#ai-mode{font-size:12px;font-weight:600;border:1px solid rgba(120,60,20,.2);border-radius:8px;padding:4px 7px;background:#fdf8f0;color:#7a5a40;cursor:pointer;white-space:nowrap;font-family:inherit}',
      '#ai-mode.agent{background:#e8662b;color:#fff;border-color:#e8662b}',
      '#ai-clear,#ai-close{background:none;border:none;cursor:pointer;color:#7a5a40;line-height:1;padding:0 4px}',
      '#ai-clear{font-size:13px}#ai-close{font-size:20px}',
      '#ai-log{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px}',
      '.ai-b{max-width:85%;padding:9px 12px;border-radius:12px;font-size:13.5px;line-height:1.5;white-space:pre-wrap;word-wrap:break-word}',
      '.ai-b.user{align-self:flex-end;background:#e8662b;color:#fff;border-bottom-right-radius:4px}',
      '.ai-b.assistant{align-self:flex-start;background:#fff;border:1px solid rgba(120,60,20,.12);border-bottom-left-radius:4px}',
      '.ai-b.error{align-self:flex-start;background:#fde2dd;color:#7a2818;border:1px solid #f0a896}',
      '.ai-b.tool{align-self:flex-start;background:#f3ece1;color:#7a5a40;font-family:monospace;font-size:12px}',
      '.ai-approve{align-self:stretch;background:#fff;border:1px solid #f0c19a;border-radius:12px;padding:11px 12px;font-size:13px}',
      '.ai-approve .desc{font-weight:600;color:#9a4410;margin-bottom:9px;white-space:pre-wrap}',
      '.ai-approve .btns{display:flex;gap:8px}',
      '.ai-approve button{flex:1;padding:8px;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit}',
      '.ai-approve .ok{background:#3b6d11;color:#fff}.ai-approve .ok:hover{background:#326010}',
      '.ai-approve .no{background:#f3ece1;color:#7a2818}.ai-approve .no:hover{background:#fde2dd}',
      '.ai-approve .done{font-weight:600}.ai-approve .done.ok{color:#3b6d11}.ai-approve .done.no{color:#a32d2d}',
      '#ai-foot{padding:10px;border-top:1px solid rgba(120,60,20,.12);background:#fff;display:flex;gap:8px;align-items:flex-end}',
      '#ai-input{flex:1;resize:none;border:1px solid rgba(120,60,20,.2);border-radius:10px;padding:9px 11px;font-size:13.5px;font-family:inherit;color:#3a2415;outline:none;max-height:120px;line-height:1.4}',
      '#ai-input:focus{border-color:#e8662b;box-shadow:0 0 0 3px #fef0e2}',
      '#ai-send{background:#e8662b;color:#fff;border:none;border-radius:10px;padding:9px 14px;cursor:pointer;font-size:13px;font-weight:600;font-family:inherit}',
      '#ai-send:disabled{opacity:.5;cursor:default}',
    ].join('');
    (document.head || document.documentElement).appendChild(s);
  }

  function esc(t) { return String(t).replace(/[&<>]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]); }); }

  function addBubble(kind, text, transient) {
    var cls = kind === 'user' ? 'user' : kind === 'error' ? 'error' : transient ? 'tool' : 'assistant';
    var div = document.createElement('div');
    div.className = 'ai-b ' + cls;
    div.innerHTML = '<span class="ai-txt">' + esc(text) + '</span>';
    log.appendChild(div); log.scrollTop = log.scrollHeight;
    return div;
  }

  // Goedkeur-kaartje; resolved met true/false zodra de gebruiker kiest.
  function requestApproval(desc) {
    return new Promise(function (resolve) {
      if (!isOpen()) openPanel();
      var card = document.createElement('div');
      card.className = 'ai-approve';
      card.innerHTML = '<div class="desc">' + esc(desc) + '</div>' +
        '<div class="btns"><button class="ok">Goedkeuren</button><button class="no">Weiger</button></div>';
      log.appendChild(card); log.scrollTop = log.scrollHeight;
      function finish(ok) {
        card.querySelector('.btns').innerHTML = '<span class="done ' + (ok ? 'ok' : 'no') + '">' + (ok ? '✓ goedgekeurd' : '✗ geweigerd') + '</span>';
        resolve(ok);
      }
      card.querySelector('.ok').onclick = function () { finish(true); };
      card.querySelector('.no').onclick = function () { finish(false); };
    });
  }

  function setInput(v) { input.value = v; input.style.height = 'auto'; }
  function updateBusy() { if (btnSend) btnSend.disabled = busy; }
  function isOpen() { return panel && panel.classList.contains('open'); }
  function openPanel() { panel.classList.add('open'); }

  // Herstel een eerder gesprek (bv. na een paginawissel door de agent).
  function renderHistory() {
    messages.forEach(function (m) {
      if (typeof m.content === 'string') { addBubble(m.role, m.content); return; }
      if (!Array.isArray(m.content)) return;
      if (m.role === 'assistant') {
        var txt = m.content.filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('\n').trim();
        if (txt) addBubble('assistant', txt);
        m.content.filter(function (b) { return b.type === 'tool_use'; }).forEach(function (b) { addBubble('assistant', toolLabel(b), true); });
      }
      // tool_result-berichten (role user, array) tonen we niet apart.
    });
  }

  function build() {
    if (!document.body) { return setTimeout(build, 30); }
    injectStyles();

    var fab = document.createElement('button');
    fab.id = 'ai-fab'; fab.title = 'AI-assistent'; fab.textContent = '✦';
    document.body.appendChild(fab);

    panel = document.createElement('div');
    panel.id = 'ai-panel';
    panel.innerHTML =
      '<div id="ai-head">' +
        '<b>✦ AI</b>' +
        '<button id="ai-mode" title="Wissel tussen alleen vragen en agent (bewerken)">💬 Vragen</button>' +
        '<select id="ai-model" title="Model"><option value="sonnet">Slim</option><option value="haiku">Snel</option><option value="mistral">Mistral</option></select>' +
        '<button id="ai-clear" title="Nieuw gesprek">⟲</button>' +
        '<button id="ai-close" title="Sluiten">×</button>' +
      '</div>' +
      '<div id="ai-log"></div>' +
      '<div id="ai-foot">' +
        '<textarea id="ai-input" rows="1" placeholder="Vraag iets, of geef een opdracht…"></textarea>' +
        '<button id="ai-send">Stuur</button>' +
      '</div>';
    document.body.appendChild(panel);

    log = panel.querySelector('#ai-log');
    input = panel.querySelector('#ai-input');
    btnSend = panel.querySelector('#ai-send');
    modeBtn = panel.querySelector('#ai-mode');
    var modelSel = panel.querySelector('#ai-model');

    // Eerdere sessie herstellen?
    var restored = null;
    try { restored = JSON.parse(sessionStorage.getItem(STATE_KEY) || 'null'); } catch (e) { restored = null; }

    if (restored && Array.isArray(restored.messages) && restored.messages.length) {
      messages = restored.messages;
      modelKey = MODELS[restored.modelKey] ? restored.modelKey : 'sonnet';
      model = MODELS[modelKey]; modelSel.value = modelKey;
      agentMode = !!restored.agent;
      renderHistory();
      pending = restored.pending || null;
      resumeAfterLoad = !!restored.resume;
      if (restored.open || pending || resumeAfterLoad) openPanel();
      // Een klik/navigatie heeft een reload veroorzaakt: rond die tool af.
      if (pending) {
        messages.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: pending.id, content: 'Uitgevoerd; pagina is nu ' + location.pathname + ' ("' + (document.title || '') + '").' }] });
        pending = null; resumeAfterLoad = true;
      }
    } else {
      addBubble('assistant', 'Hoi! In de "Vragen"-modus beantwoord ik vragen over het systeem en de data. Wil je dat ik dingen voor je DOE in de app, zet dan rechtsboven "Agent" aan — elke handeling vraag ik je dan eerst goed te keuren.');
    }
    updateModeBtn();

    fab.onclick = function () { panel.classList.toggle('open'); if (isOpen()) setTimeout(function () { input.focus(); }, 50); };
    panel.querySelector('#ai-close').onclick = function () { panel.classList.remove('open'); persist(); };
    panel.querySelector('#ai-clear').onclick = function () {
      if (busy) return;
      messages = []; pending = null; resumeAfterLoad = false; clearPersist();
      log.innerHTML = '';
      addBubble('assistant', 'Nieuw gesprek. Waarmee kan ik helpen?');
    };
    modelSel.onchange = function () { modelKey = this.value; model = MODELS[modelKey] || MODELS.sonnet; persist(); };
    modeBtn.onclick = function () {
      if (busy) return;
      agentMode = !agentMode;
      updateModeBtn(); persist();
      addBubble('assistant', agentMode
        ? '🛠️ Agent-modus aan. Ik kan nu handelingen voorstellen (klikken, invullen, navigeren) — elke stap vraag ik je goed te keuren.'
        : '💬 Vragen-modus. Ik beantwoord enkel vragen en lees data; ik bedien de app niet.');
    };

    function submit() { var v = input.value; setInput(''); send(v); }
    btnSend.onclick = submit;
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } });
    input.addEventListener('input', function () { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 120) + 'px'; });

    updateBusy();
    // Agent hervatten na een paginawissel.
    if (resumeAfterLoad) { resumeAfterLoad = false; persist(); openPanel(); runLoop(); }
  }

  build();
})();
