// Firebase Admin (Firestore) voor accountopslag.
//
// In de Firebase-omgeving (frameworksBackend) worden credentials automatisch
// via Application Default Credentials aangeleverd; lokaal zijn die er meestal
// niet. We initialiseren daarom defensief: lukt het niet, dan geeft getDb()
// null terug en valt de app terug op enkel de centrale admin (geen beheerders).
//
// De operations-database heet "event" (zie firebase.json → firestore.database),
// dus we selecteren die named database expliciet.

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getDatabaseWithUrl, type Database } from 'firebase-admin/database';

const DATABASE_ID = 'event';

// Realtime Database (operations) — events, laadlijsten, bestellingen, catalogus.
// Aparte URL dan Firestore; we geven die expliciet mee aan getDatabase() zodat
// het niet afhangt van een default databaseURL op de app.
const RTDB_URL =
  'https://operationssenorsnacks-default-rtdb.europe-west1.firebasedatabase.app';

let cached: Firestore | null | undefined;
let cachedRtdb: Database | null | undefined;

export function getDb(): Firestore | null {
  if (cached !== undefined) return cached;
  try {
    const app = getApps()[0] ?? initializeApp();
    cached = getFirestore(app, DATABASE_ID);
  } catch (err) {
    console.error('Firestore-initialisatie mislukt (accountbeheer uit):', err);
    cached = null;
  }
  return cached;
}

// Realtime Database-handle. Net als getDb() defensief: lukt het niet (bv. lokaal
// zonder Application Default Credentials), dan null → de route geeft een nette
// 503. In de frameworksBackend-deploy levert ADC volledige RTDB-rechten en
// omzeilt de admin-SDK database.rules.json. Alleen lezen.
export function getRtdb(): Database | null {
  if (cachedRtdb !== undefined) return cachedRtdb;
  try {
    const app = getApps()[0] ?? initializeApp({ databaseURL: RTDB_URL });
    cachedRtdb = getDatabaseWithUrl(RTDB_URL, app);
  } catch (err) {
    console.error('RTDB-initialisatie mislukt (prognose uit):', err);
    cachedRtdb = null;
  }
  return cachedRtdb;
}
