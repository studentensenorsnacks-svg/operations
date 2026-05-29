// Anonieme Firebase-auth bootstrap (V1/legacy modus).
// Wordt geladen op pagina's die naar RTDB/Storage praten zodat de
// auth-required security rules onze app doorlaten en willekeurige
// bezoekers niet.
//
// Op de V2-login-host (hostname bevat "-login" of "-v2") slaat dit
// script zichzelf over — daar doet de login-flow zelf de auth.
(function () {
  if (!window.firebase) {
    console.warn('[anon-auth] Firebase SDK niet geladen');
    return;
  }
  if (typeof firebase.auth !== 'function') {
    console.warn('[anon-auth] firebase-auth-compat.js ontbreekt');
    return;
  }

  var host = (location.hostname || '').toLowerCase();
  if (host.indexOf('-login') !== -1 || host.indexOf('-v2') !== -1) {
    return; // V2-modus: echte login regelt auth.
  }

  var auth = firebase.auth();
  try { auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL); } catch (e) { /* noop */ }

  window.fbAuthReady = new Promise(function (resolve) {
    var done = false;
    function finish(user) { if (done) return; done = true; resolve(user); }

    auth.onAuthStateChanged(function (user) {
      if (user) { finish(user); return; }
      auth.signInAnonymously()
          .then(function (cred) { finish(cred.user); })
          .catch(function (err) {
            console.error('[anon-auth] sign-in mislukt:', err);
            finish(null);
          });
    });
  });
})();
