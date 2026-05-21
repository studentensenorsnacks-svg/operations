/**
 * Cloud Functions for the Señor Snacks operations tool.
 *
 *   anthropicProxy - HTTP endpoint behind hosting rewrite /api/anthropic.
 *                    Forwards calls to the Anthropic API so the API key
 *                    stays server-side instead of in the browser.
 *
 * Note: the Microsoft 365 calendar sync runs entirely client-side in the
 * browser (MSAL) — there is deliberately no Cloud Function for it.
 */
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { logger } = require('firebase-functions');

const REGION = 'europe-west1';

// Anthropic API key — lives in Cloud Secret Manager, never in code, git or
// the browser. Used by the anthropicProxy endpoint:
//   firebase functions:secrets:set ANTHROPIC_API_KEY
const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');

// ── HTTP: Anthropic API proxy ────────────────────────────
// The browser pages (laadlijst-beheer.html, planning.html) POST a standard
// Anthropic /v1/messages body here; this forwards it with the secret key so
// the key never ships to the client. Reached at /api/anthropic via the
// Firebase Hosting rewrite. CORS is limited to our own hosting domains.
exports.anthropicProxy = onRequest(
  {
    region: REGION,
    secrets: [ANTHROPIC_API_KEY],
    cors: [
      'https://operationssenorsnacks.web.app',
      'https://operationssenorsnacks.firebaseapp.com',
    ],
    timeoutSeconds: 120,
    memory: '512MiB',
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: { message: 'Gebruik POST.' } });
      return;
    }
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY.value(),
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(req.body),
      });
      const data = await response.json();
      res.set('Cache-Control', 'no-store');
      res.status(response.status).json(data);
    } catch (e) {
      logger.error('anthropicProxy mislukt', e);
      res.status(500).json({ error: { message: String(e?.message || e) } });
    }
  },
);
