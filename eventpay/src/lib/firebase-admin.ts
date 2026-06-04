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

const DATABASE_ID = 'event';

let cached: Firestore | null | undefined;

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
