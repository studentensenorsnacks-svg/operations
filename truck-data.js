/**
 * truck-data.js — CENTRALE bron van waarheid voor de foodtruck-vloot.
 *
 * DIT is de plek om een foodtruck toe te voegen/wijzigen: voeg één object toe
 * aan de TRUCKS-lijst hieronder (naam, categorie, poets-vlag, keuring). De
 * check-in-, planning-, poets- en functions-lijsten leiden zich hier allemaal
 * uit af, dus je hoeft het nog op MAAR ÉÉN plaats te doen.
 *
 * Na bewerken: kopie naar functions/ syncen met  node tools/sync-truck-data.js
 * (de keuring-DATUMS zelf blijven in keuringen.html / RTDB, dat is live-data).
 *
 * Werkt in de browser (window.TruckData) én in Node (module.exports).
 * Oorspronkelijk gebootstrapt uit de oude lijsten via tools/build-truck-data.js.
 */
(function (global) {
  'use strict';

  // Categorie-presentatie (labels/kleuren) per view. Lidmaatschap komt uit
  // het 'category'-veld van elke truck, niet uit losse lijsten.
  var CATEGORIES = [
    { key: 'frituur',     checkinLabel: '🍟 Frituurwagens',         checkinType: 'frituur',   planningLabel: '🍟 Frituurwagens', color: '#b45309', bg: '#fef3c7' },
    { key: 'hamburger',   checkinLabel: '🍔 Hamburgerwagens',       checkinType: 'hamburger', planningLabel: '🍔 Hamburger',     color: '#e8001d', bg: '#fde8e8' },
    { key: 'pizza_pasta', checkinLabel: '🍕 Pizza & Pasta',         checkinType: 'overig',    planningLabel: '🍕 Pizza & Pasta', color: '#c2410c', bg: '#ffedd5' },
    { key: 'sweet_ijs',   checkinLabel: '🍦 Sweet & Ijs',           checkinType: 'overig',    planningLabel: '🍦 Sweet & Ijs',   color: '#7c3aed', bg: '#ede9fe' },
    { key: 'tap',         checkinLabel: '🍺 Tap & Dranken',         checkinType: 'overig',    planningLabel: '🍺 Tap & Dranken', color: '#1d4ed8', bg: '#dbeafe' },
    { key: 'rijdend',     checkinLabel: '🚛 Rijdend',               checkinType: 'rijdend',   planningLabel: '🚛 Rijdend',       color: '#374151', bg: '#f3f4f6' },
    { key: 'support',     checkinLabel: '📦 Containers & Support',  checkinType: 'overig',    planningLabel: '📦 Support',       color: '#374151', bg: '#f3f4f6' }
  ];

  var TRUCKS = [
  {"id":"ft001","name":"Bicky Burger Wagen 201","plate":"QIT-623","type":"Wagen - Bicky Burger","category":"frituur","inCheckin":true,"poets":true,"keuringElek":true,"keuringGas":true},
  {"id":"ft002","name":"Brascheria 1","plate":"","type":"Voertuig - Algemeen / te bepalen","category":"rijdend","inCheckin":true,"poets":true,"keuringElek":true,"keuringGas":false},
  {"id":"ft003","name":"Bureau container 71","plate":"","type":"Container - Bureau / support","category":"support","inCheckin":true,"poets":true,"keuringElek":true,"keuringGas":false},
  {"id":"ft004","name":"Bureau container 72","plate":"","type":"Container - Bureau / support","category":"support","inCheckin":true,"poets":true,"keuringElek":true,"keuringGas":false},
  {"id":"ft005","name":"Fiat 404","plate":"2-FAC-730","type":"Voertuig - Algemeen / te bepalen","category":"rijdend","inCheckin":true,"poets":true,"keuringElek":true,"keuringGas":true},
  {"id":"ft006","name":"Food Wagen (Snackmuur) 305","plate":"QFV-161","type":"Wagen - Algemeen / te bepalen","category":"frituur","inCheckin":true,"poets":true,"keuringElek":true,"keuringGas":true},
  {"id":"ft007","name":"Food container (4 Pot) C206","plate":"","type":"Container - Algemeen / te bepalen","category":"support","inCheckin":true,"poets":true,"keuringElek":true,"keuringGas":true},
  {"id":"ft008","name":"Food container (Berging en Dampkap) C209","plate":"","type":"Container - Algemeen / te bepalen","category":"support","inCheckin":true,"poets":true,"keuringElek":true,"keuringGas":false},
  {"id":"ft009","name":"Food container (Dampkap) C205","plate":"","type":"Container - Algemeen / te bepalen","category":"support","inCheckin":true,"poets":true,"keuringElek":true,"keuringGas":false},
  {"id":"ft010","name":"Food container (Friet) C201","plate":"","type":"Container - Friet","category":"frituur","inCheckin":true,"poets":true,"keuringElek":true,"keuringGas":true},
  {"id":"ft011","name":"Food container (Friet-2_Vallen) C203","plate":"","type":"Container - Friet","category":"frituur","inCheckin":true,"poets":true,"keuringElek":true,"keuringGas":true},
  {"id":"ft012","name":"Food container (Hamburger) C202","plate":"","type":"Container - Hamburger","category":"hamburger","inCheckin":true,"poets":true,"keuringElek":true,"keuringGas":false},
  {"id":"ft013","name":"Food container (Met koeling) C103","plate":"","type":"Container - Koeling","category":"support","inCheckin":true,"poets":true,"keuringElek":true,"keuringGas":false},
  {"id":"ft014","name":"Food container (Met koeling) C107","plate":"","type":"Container - Koeling","category":"support","inCheckin":true,"poets":true,"keuringElek":true,"keuringGas":false},
  {"id":"ft015","name":"Food container (Met koeling) C108","plate":"","type":"Container - Koeling","category":"support","inCheckin":true,"poets":true,"keuringElek":true,"keuringGas":false},
  {"id":"ft016","name":"Food container (Met koeling en Dampkap) C207","plate":"","type":"Container - Koeling","category":"support","inCheckin":true,"poets":true,"keuringElek":true,"keuringGas":false},
  {"id":"ft017","name":"Food container (Met koeling en Dampkap) C208","plate":"","type":"Container - Koeling","category":"support","inCheckin":true,"poets":true,"keuringElek":true,"keuringGas":false},
  {"id":"ft018","name":"Food container (Pasta) C105","plate":"","type":"Container - Pasta","category":"pizza_pasta","inCheckin":true,"poets":true,"keuringElek":true,"keuringGas":false},
  {"id":"ft019","name":"Food container (Snackmuur) C110","plate":"","type":"Container - Algemeen / te bepalen","category":"support","inCheckin":true,"poets":true,"keuringElek":true,"keuringGas":true},
  {"id":"ft020","name":"Food container (Zonder koeling) C101","plate":"","type":"Container - Koeling","category":"support","inCheckin":true,"poets":true,"keuringElek":true,"keuringGas":false},
  {"id":"ft021","name":"Food container (Zonder koeling) C102","plate":"","type":"Container - Koeling","category":"support","inCheckin":true,"poets":true,"keuringElek":true,"keuringGas":false},
  {"id":"ft022","name":"Food container (Zonder koeling) C104","plate":"","type":"Container - Koeling","category":"support","inCheckin":true,"poets":true,"keuringElek":true,"keuringGas":false},
  {"id":"ft023","name":"Food container C106","plate":"","type":"Container - Algemeen / te bepalen","category":"support","inCheckin":true,"poets":true,"keuringElek":true,"keuringGas":false},
  {"id":"ft024","name":"Food container C109","plate":"","type":"Container - Algemeen / te bepalen","category":"support","inCheckin":true,"poets":true,"keuringElek":true,"keuringGas":false},
  {"id":"ft068","name":"Food container C111","plate":"","type":"Container - Algemeen / te bepalen","category":"support","inCheckin":true,"poets":true,"keuringElek":true,"keuringGas":false},
  {"id":"ft069","name":"Food container C112","plate":"","type":"Container - Algemeen / te bepalen","category":"support","inCheckin":true,"poets":true,"keuringElek":true,"keuringGas":false},
  {"id":"ft025","name":"Food container C204","plate":"","type":"Container - Algemeen / te bepalen","category":"support","inCheckin":true,"poets":true,"keuringElek":true,"keuringGas":false},
  {"id":"ft070","name":"Food container C211","plate":"","type":"Container - Algemeen / te bepalen","category":"support","inCheckin":true,"poets":true,"keuringElek":true,"keuringGas":true},
  {"id":"ft026","name":"Friet Container (Postel) 501","plate":"","type":"Container - Friet","category":"frituur","inCheckin":true,"poets":true,"keuringElek":false,"keuringGas":false},
  {"id":"ft028","name":"Friet Wagen (HR-ketel) 502","plate":"QKM-160","type":"Wagen - Friet","category":"frituur","inCheckin":true,"poets":true,"keuringElek":true,"keuringGas":true},
  {"id":"ft029","name":"Friet Wagen 304","plate":"1-QDO-725","type":"Wagen - Friet","category":"frituur","inCheckin":true,"poets":true,"keuringElek":true,"keuringGas":true},
  {"id":"ft030","name":"Friet Wagen 402","plate":"Q-AQD-079","type":"Wagen - Friet","category":"frituur","inCheckin":true,"poets":true,"keuringElek":true,"keuringGas":true},
  {"id":"ft031","name":"Friet Wagen 403","plate":"Q-AGL-524","type":"Wagen - Friet","category":"frituur","inCheckin":true,"poets":true,"keuringElek":true,"keuringGas":true},
  {"id":"ft032","name":"Friet Wagen 503","plate":"","type":"Wagen - Friet","category":"frituur","inCheckin":true,"poets":true,"keuringElek":true,"keuringGas":true},
  {"id":"ft033","name":"Friet Wagen 504","plate":"","type":"Wagen - Friet","category":"frituur","inCheckin":true,"poets":true,"keuringElek":true,"keuringGas":true},
  {"id":"ft034","name":"Friet Wagen 801","plate":"QHU-600","type":"Wagen - Friet","category":"frituur","inCheckin":true,"poets":true,"keuringElek":true,"keuringGas":true},
  {"id":"ft035","name":"Friet Wagen 802","plate":"QHU-549","type":"Wagen - Friet","category":"frituur","inCheckin":true,"poets":true,"keuringElek":true,"keuringGas":true},
  {"id":"ft036","name":"Friet Wagen 803","plate":"QKH-910","type":"Wagen - Friet","category":"frituur","inCheckin":true,"poets":true,"keuringElek":true,"keuringGas":true},
  {"id":"ft037","name":"Friet Wagen 804","plate":"1-QBV-106","type":"Wagen - Friet","category":"frituur","inCheckin":true,"poets":true,"keuringElek":true,"keuringGas":true},
  {"id":"ft038","name":"Friet Wagen 805","plate":"1-QDX-376","type":"Wagen - Friet","category":"frituur","inCheckin":true,"poets":true,"keuringElek":true,"keuringGas":true},
  {"id":"ft039","name":"Friet Wagen 806","plate":"QJV-990","type":"Wagen - Friet","category":"frituur","inCheckin":true,"poets":true,"keuringElek":true,"keuringGas":true},
  {"id":"ft040","name":"Friet Wagen 901","plate":"QEF-280","type":"Wagen - Friet","category":"frituur","inCheckin":true,"poets":true,"keuringElek":true,"keuringGas":true},
  {"id":"ft041","name":"Hamburger Container 12","plate":"","type":"Container - Hamburger","category":"hamburger","inCheckin":true,"poets":true,"keuringElek":true,"keuringGas":false},
  {"id":"ft042","name":"Hamburger Container 13","plate":"","type":"Container - Hamburger","category":"hamburger","inCheckin":true,"poets":true,"keuringElek":true,"keuringGas":false},
  {"id":"ft044","name":"Hamburger Wagen (Kiosk) 14","plate":"","type":"Wagen - Hamburger","category":"hamburger","inCheckin":true,"poets":true,"keuringElek":true,"keuringGas":false},
  {"id":"ft045","name":"Hamburger Wagen 202","plate":"QCF-476","type":"Wagen - Hamburger","category":"hamburger","inCheckin":true,"poets":true,"keuringElek":true,"keuringGas":true},
  {"id":"ft046","name":"Hamburger Wagen 306","plate":"1-QAG-166","type":"Wagen - Hamburger","category":"hamburger","inCheckin":true,"poets":true,"keuringElek":true,"keuringGas":true},
  {"id":"ft047","name":"Ijs Wagen (Humbaur Ola) 51","plate":"QEM-672","type":"Wagen - Ijs","category":"sweet_ijs","inCheckin":true,"poets":true,"keuringElek":true,"keuringGas":true},
  {"id":"ft048","name":"Ijs Wagen (Kermis Ola) 52","plate":"","type":"Wagen - Ijs","category":"sweet_ijs","inCheckin":true,"poets":true,"keuringElek":true,"keuringGas":false},
  {"id":"ft049","name":"Jumper 302","plate":"XRI-303","type":"Wagen - Friet","category":"rijdend","inCheckin":true,"poets":true,"keuringElek":true,"keuringGas":true},
  {"id":"ft050","name":"Kassa units","plate":"","type":"Unit - Kassa","category":"support","inCheckin":true,"poets":true,"keuringElek":true,"keuringGas":false},
  {"id":"ft051","name":"Koelaanhangwagen 61","plate":"","type":"Aanhangwagen - Koeling (geen keuring)","category":"support","inCheckin":true,"poets":true,"keuringElek":false,"keuringGas":false},
  {"id":"ft053","name":"Koelcontainer 63","plate":"","type":"Container - Koeling (geen keuring)","category":"support","inCheckin":true,"poets":true,"keuringElek":false,"keuringGas":false},
  {"id":"ft054","name":"Pasta Wagen 11","plate":"","type":"Wagen - Pasta","category":"pizza_pasta","inCheckin":true,"poets":true,"keuringElek":true,"keuringGas":false},
  {"id":"ft055","name":"Pizza en Broodjes Wagen 21","plate":"","type":"Wagen - Pizza & Broodjes","category":"pizza_pasta","inCheckin":true,"poets":true,"keuringElek":true,"keuringGas":false},
  {"id":"ft056","name":"Pizza en Broodjes Wagen 22","plate":"","type":"Wagen - Pizza & Broodjes","category":"pizza_pasta","inCheckin":true,"poets":true,"keuringElek":true,"keuringGas":false},
  {"id":"ft057","name":"Pizza en Pasta Container 23","plate":"","type":"Container - Pizza & Pasta","category":"pizza_pasta","inCheckin":true,"poets":true,"keuringElek":true,"keuringGas":false},
  {"id":"ft059","name":"Stockage container S101","plate":"","type":"Container - Stockage (geen keuring)","category":"support","inCheckin":true,"poets":true,"keuringElek":false,"keuringGas":false},
  {"id":"ft060","name":"Stockage container S102","plate":"","type":"Container - Stockage (geen keuring)","category":"support","inCheckin":true,"poets":true,"keuringElek":false,"keuringGas":false},
  {"id":"ft061","name":"Sweet corner Container 55","plate":"","type":"Container - Sweet corner","category":"sweet_ijs","inCheckin":true,"poets":true,"keuringElek":true,"keuringGas":false},
  {"id":"ft062","name":"Sweet corner Wagen (Humbaur) 54","plate":"","type":"Wagen - Sweet corner","category":"sweet_ijs","inCheckin":true,"poets":true,"keuringElek":true,"keuringGas":false},
  {"id":"ft063","name":"Sweetcorner Wagen (Kiosk) 53","plate":"","type":"Wagen - Sweet corner","category":"sweet_ijs","inCheckin":true,"poets":true,"keuringElek":true,"keuringGas":false},
  {"id":"ft065","name":"Tap Wagen (Dubble-as) 42","plate":"","type":"Wagen - Tap / dranken","category":"tap","inCheckin":true,"poets":true,"keuringElek":false,"keuringGas":false},
  {"id":"ft066","name":"Tap Wagen (Klein) 44","plate":"","type":"Wagen - Tap / dranken","category":"tap","inCheckin":true,"poets":true,"keuringElek":true,"keuringGas":false},
  {"id":"ft067","name":"Tap Wagen 43","plate":"","type":"Wagen - Tap / dranken","category":"tap","inCheckin":true,"poets":true,"keuringElek":true,"keuringGas":false},
  ];

  function fleet() { return TRUCKS.slice(); }
  function poetsTrucks() { return TRUCKS.filter(function (t) { return t.poets; }).map(function (t) { return t.name; }); }

  // Bouwt de gegroepeerde structuur voor een view ('checkin' of 'planning').
  function groups(view) {
    return CATEGORIES.map(function (c) {
      var trucks = TRUCKS
        .filter(function (t) { return t.category === c.key && (view !== 'checkin' || t.inCheckin); })
        .map(function (t) { return t.name; });
      if (view === 'checkin') return { label: c.checkinLabel, type: c.checkinType, trucks: trucks };
      return { label: c.planningLabel, color: c.color, bg: c.bg, trucks: trucks };
    }).filter(function (g) { return g.trucks.length; });
  }

  var api = {
    TRUCKS: TRUCKS, CATEGORIES: CATEGORIES,
    fleet: fleet, poetsTrucks: poetsTrucks, groups: groups,
    checkinGroups: function () { return groups('checkin'); },
    planningGroups: function () { return groups('planning'); }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.TruckData = api;
})(typeof window !== 'undefined' ? window : globalThis);
