// One-off bootstrap script.
// Maakt (of update) een Firebase-Auth user met e-mail + password en
// kent custom-claim role=admin toe.
//
// Run lokaal:
//   1. Eénmalig: `gcloud auth application-default login` (zodat de
//      Firebase Admin SDK met je Google-account kan praten).
//   2. `cd functions && node setup-admin.js`
//
// Het script is idempotent: bestaande user → password + admin-rol updaten.

const admin = require('firebase-admin');

const PROJECT_ID = 'operationssenorsnacks';
const EMAIL = 'jelle@senorsnacks.be';
const PASSWORD = 'Joskejos77!';
const DISPLAY_NAME = 'Jelle Verboven';

async function main() {
  admin.initializeApp({ projectId: PROJECT_ID });

  let user;
  try {
    user = await admin.auth().getUserByEmail(EMAIL);
    console.log(`Bestaande user gevonden: ${user.uid} (${user.email})`);
    await admin.auth().updateUser(user.uid, {
      password: PASSWORD,
      displayName: user.displayName || DISPLAY_NAME,
      emailVerified: true,
    });
    console.log('Password + displayName bijgewerkt.');
  } catch (e) {
    if (e.code !== 'auth/user-not-found') throw e;
    user = await admin.auth().createUser({
      email: EMAIL,
      password: PASSWORD,
      displayName: DISPLAY_NAME,
      emailVerified: true,
    });
    console.log(`Nieuwe user aangemaakt: ${user.uid}`);
  }

  const existing = user.customClaims || {};
  await admin.auth().setCustomUserClaims(user.uid, {
    ...existing,
    role: 'admin',
  });
  console.log(`Rol 'admin' gezet op ${EMAIL}.`);
  console.log('');
  console.log('KLAAR. Log in op https://operationssenorsnacks-login.web.app/login.html');
  console.log(`  e-mail:     ${EMAIL}`);
  console.log(`  wachtwoord: ${PASSWORD}`);
  console.log('');
  console.log('Tip: wijzig je wachtwoord daarna via /users.html of via "Wachtwoord vergeten?" op login.');
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
