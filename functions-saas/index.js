/**
 * Cloud Functions for the EventFlow SaaS app (deployed to senorkeuringqr).
 *
 *   portalAction - HTTP endpoint that lets suppliers access their portal
 *                  without Firebase Auth. Validates portalCode and uses
 *                  the Admin SDK to bypass Firestore rules.
 *
 * Deploy:  firebase deploy --only functions:saas --project senorkeuringqr
 */
const { onRequest } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');

const REGION = 'europe-west1';

if (!admin.apps.length) admin.initializeApp();
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36);

// Verify the caller's Firebase ID token (sent as Authorization: Bearer <idToken>).
async function requireAuth(req) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  if (!header.startsWith('Bearer ')) throw Object.assign(new Error('Missing token'), { code: 401 });
  const token = header.slice(7);
  try {
    return await admin.auth().verifyIdToken(token);
  } catch (e) {
    throw Object.assign(new Error('Invalid token'), { code: 401 });
  }
}

// Delete every Storage object whose path is referenced inside a list of events
// (task-response attachments, document attachments) or requests (message
// attachments). Best-effort: missing files are ignored.
async function deleteStorageForEvents(events) {
  const bucket = getStorage(admin.app()).bucket();
  const paths = [];
  for (const e of events) {
    for (const t of (e.tasks || [])) {
      for (const r of (t.responses || [])) {
        if (r.attachment?.path) paths.push(r.attachment.path);
      }
    }
    for (const d of (e.documents || [])) {
      if (d.path) paths.push(d.path);
    }
  }
  for (const p of paths) {
    try { await bucket.file(p).delete(); } catch {}
  }
}
async function deleteStorageForRequests(requests) {
  const bucket = getStorage(admin.app()).bucket();
  const paths = [];
  for (const r of requests) {
    for (const m of (r.messages || [])) {
      if (m.attachment && typeof m.attachment === 'object' && m.attachment.path) paths.push(m.attachment.path);
    }
  }
  for (const p of paths) {
    try { await bucket.file(p).delete(); } catch {}
  }
}

// Permanently remove a workspace and all data tied to it: events, suppliers,
// requests, storage objects, invites. Members' user docs lose this wsId from
// their workspaceIds array.
async function wipeWorkspace(db, wsId) {
  const wsRef = db.collection('workspaces').doc(wsId);
  const wsSnap = await wsRef.get();
  const memberUids = wsSnap.exists ? Object.keys(wsSnap.data().members || {}) : [];

  const [evSnap, supSnap, rqSnap, invSnap] = await Promise.all([
    db.collection('events').where('wsId', '==', wsId).get(),
    db.collection('suppliers').where('wsId', '==', wsId).get(),
    db.collection('requests').where('wsId', '==', wsId).get(),
    db.collection('invites').where('wsId', '==', wsId).get(),
  ]);
  const events = evSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const requests = rqSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  await deleteStorageForEvents(events);
  await deleteStorageForRequests(requests);

  const batches = [db.batch()];
  let count = 0;
  const queueDelete = (ref) => {
    if (count >= 400) { batches.push(db.batch()); count = 0; }
    batches[batches.length - 1].delete(ref); count++;
  };
  evSnap.docs.forEach(d => queueDelete(d.ref));
  supSnap.docs.forEach(d => queueDelete(d.ref));
  rqSnap.docs.forEach(d => queueDelete(d.ref));
  invSnap.docs.forEach(d => queueDelete(d.ref));
  queueDelete(wsRef);
  for (const b of batches) await b.commit();

  // Strip the wsId from each member's user.workspaceIds (best effort).
  await Promise.all(memberUids.map(async (uid) => {
    try {
      const uRef = db.collection('users').doc(uid);
      const u = await uRef.get();
      if (!u.exists) return;
      const data = u.data();
      const newWsIds = (data.workspaceIds || []).filter(x => x !== wsId);
      const patch = { workspaceIds: newWsIds };
      if (data.defaultWorkspaceId === wsId) patch.defaultWorkspaceId = newWsIds[0] || null;
      await uRef.set(patch, { merge: true });
    } catch (e) { logger.warn('user cleanup failed for ' + uid, e); }
  }));
}

// Simple Firestore-backed rate limiter. Buckets writes into a fixed window
// and returns false when the cap is hit. One transactional read+write per
// call — negligible cost.
async function checkRateLimit(db, key, maxPerWindow, windowMs) {
  const ref = db.collection('_rateLimits').doc(key);
  const now = Date.now();
  return db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const data = doc.exists ? doc.data() : null;
    if (!data || now - (data.windowStart || 0) > windowMs) {
      tx.set(ref, { count: 1, windowStart: now, expiresAt: new Date(now + windowMs * 4) });
      return true;
    }
    if (data.count >= maxPerWindow) return false;
    tx.update(ref, { count: data.count + 1 });
    return true;
  });
}

function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

exports.portalAction = onRequest(
  {
    region: REGION,
    cors: true,
    invoker: 'public',
    timeoutSeconds: 30,
    memory: '256MiB',
    maxInstances: 10,
    concurrency: 40,
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Use POST' });
      return;
    }
    try {
      const db = getFirestore(admin.app(), 'event');
      const ip = clientIp(req);

      // Global per-IP cap: 120 requests per minute, regardless of action.
      // Stops blunt DDoS / brute-force-portal-code attempts.
      const ipOk = await checkRateLimit(db, `ip:${ip}`, 120, 60_000);
      if (!ipOk) { res.status(429).json({ error: 'Te veel verzoeken — probeer later opnieuw.' }); return; }

      const { action, portalCode, ...params } = req.body || {};
      if (!portalCode) { res.status(400).json({ error: 'Missing portalCode' }); return; }
      const code = String(portalCode).trim().toLowerCase();

      // Per-portalCode cap: 60 actions per minute. Stops spam from one supplier.
      const codeOk = await checkRateLimit(db, `code:${code}`, 60, 60_000);
      if (!codeOk) { res.status(429).json({ error: 'Te veel acties op deze code — probeer later opnieuw.' }); return; }

      const supSnap = await db.collection('suppliers').where('portalCode', '==', code).limit(1).get();
      const supplier = supSnap.empty ? null : { id: supSnap.docs[0].id, ...supSnap.docs[0].data() };

      const rqByCodeSnap = await db.collection('requests').where('portalCode', '==', code).limit(1).get();
      const firstRq = rqByCodeSnap.empty ? null : rqByCodeSnap.docs[0].data();

      if (!supplier && !firstRq) {
        res.status(404).json({ error: 'Onbekende code' });
        return;
      }

      const wsId = supplier?.wsId || firstRq?.wsId;
      if (!wsId) { res.status(404).json({ error: 'Workspace onbekend' }); return; }

      if (action === 'load') {
        if (supplier) {
          await db.collection('suppliers').doc(supplier.id).update({ lastAccess: new Date().toISOString() });
        }
        const evSnap = await db.collection('events').where('wsId', '==', wsId).get();
        const events = evSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const rqSnap = await db.collection('requests').where('portalCode', '==', code).get();
        const requests = rqSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Mint a Firebase Auth custom token so the portal user can write to
        // Storage with strict rules. UID is deterministic per supplier.
        const portalUid = supplier ? `portal_${supplier.id}` : `portal_rq_${rqByCodeSnap.docs[0].id}`;
        const customToken = await admin.auth().createCustomToken(portalUid, {
          portal: true,
          wsId,
          supplierId: supplier?.id || null,
          portalCode: code,
        });
        res.json({ supplier, events, requests, customToken });
        return;
      }

      if (action === 'toggleTask') {
        if (!supplier) { res.status(403).json({ error: 'Geen leverancier' }); return; }
        const { eventId, taskId } = params;
        const evRef = db.collection('events').doc(eventId);
        const evDoc = await evRef.get();
        if (!evDoc.exists || evDoc.data().wsId !== wsId) { res.status(403).json({ error: 'Forbidden' }); return; }
        const tasks = (evDoc.data().tasks || []).map(t => t.id === taskId ? { ...t, status: t.status === 'done' ? 'open' : 'done' } : t);
        await evRef.update({ tasks });
        res.json({ ok: true });
        return;
      }

      if (action === 'addTaskResponse') {
        if (!supplier) { res.status(403).json({ error: 'Geen leverancier' }); return; }
        const { eventId, taskId, text, attachment } = params;
        const evRef = db.collection('events').doc(eventId);
        const evDoc = await evRef.get();
        if (!evDoc.exists || evDoc.data().wsId !== wsId) { res.status(403).json({ error: 'Forbidden' }); return; }
        const resp = { id: uid(), supplierId: supplier.id, supplierName: supplier.name || 'Leverancier', text: text || '', attachment: attachment || null, createdAt: new Date().toISOString() };
        const tasks = (evDoc.data().tasks || []).map(t => t.id === taskId ? { ...t, responses: [...(t.responses || []), resp] } : t);
        await evRef.update({ tasks });
        res.json({ ok: true });
        return;
      }

      if (action === 'addMessage') {
        const { requestId, text, attachment } = params;
        const rqRef = db.collection('requests').doc(requestId);
        const rqDoc = await rqRef.get();
        if (!rqDoc.exists || rqDoc.data().portalCode !== code) { res.status(403).json({ error: 'Forbidden' }); return; }
        const msg = { id: uid(), from: 'supplier', text: text || '', attachment: attachment || null, createdAt: new Date().toISOString() };
        const messages = [...(rqDoc.data().messages || []), msg];
        await rqRef.update({ status: 'beantwoord', messages });
        res.json({ ok: true });
        return;
      }

      res.status(400).json({ error: 'Unknown action' });
    } catch (e) {
      logger.error('portalAction failed', e);
      res.status(500).json({ error: String(e?.message || e) });
    }
  },
);

// ── HTTP: GDPR account/workspace actions ─────────────────────────
// Authenticated endpoints for data-subject rights: delete workspace,
// delete account, export workspace data.
exports.accountAction = onRequest(
  {
    region: REGION,
    cors: true,
    invoker: 'public',
    timeoutSeconds: 540,
    memory: '512MiB',
    maxInstances: 5,
  },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).json({ error: 'Use POST' }); return; }
    try {
      const decoded = await requireAuth(req).catch(e => { throw e; });
      const userUid = decoded.uid;
      const db = getFirestore(admin.app(), 'event');
      const { action, ...params } = req.body || {};

      if (action === 'exportWorkspace') {
        const { wsId } = params;
        const wsSnap = await db.collection('workspaces').doc(wsId).get();
        if (!wsSnap.exists || !wsSnap.data().members?.[userUid]) {
          res.status(403).json({ error: 'Geen lid van deze workspace' }); return;
        }
        const [evSnap, supSnap, rqSnap] = await Promise.all([
          db.collection('events').where('wsId', '==', wsId).get(),
          db.collection('suppliers').where('wsId', '==', wsId).get(),
          db.collection('requests').where('wsId', '==', wsId).get(),
        ]);
        res.json({
          exportedAt: new Date().toISOString(),
          workspace: { id: wsSnap.id, ...wsSnap.data() },
          events: evSnap.docs.map(d => ({ id: d.id, ...d.data() })),
          suppliers: supSnap.docs.map(d => ({ id: d.id, ...d.data() })),
          requests: rqSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        });
        return;
      }

      if (action === 'deleteWorkspace') {
        const { wsId } = params;
        const wsSnap = await db.collection('workspaces').doc(wsId).get();
        if (!wsSnap.exists) { res.status(404).json({ error: 'Workspace bestaat niet' }); return; }
        if (wsSnap.data().ownerId !== userUid) {
          res.status(403).json({ error: 'Alleen de eigenaar kan de werkruimte verwijderen' }); return;
        }
        await wipeWorkspace(db, wsId);
        res.json({ ok: true });
        return;
      }

      if (action === 'transferOwnership') {
        const { wsId, newOwnerUid } = params;
        const wsSnap = await db.collection('workspaces').doc(wsId).get();
        if (!wsSnap.exists) { res.status(404).json({ error: 'Workspace bestaat niet' }); return; }
        const wsData = wsSnap.data();
        if (wsData.ownerId !== userUid) { res.status(403).json({ error: 'Alleen de eigenaar' }); return; }
        if (!wsData.members?.[newOwnerUid]) { res.status(400).json({ error: 'Nieuwe eigenaar moet al lid zijn' }); return; }
        const newMembers = { ...wsData.members };
        newMembers[newOwnerUid] = { ...newMembers[newOwnerUid], role: 'owner' };
        newMembers[userUid] = { ...newMembers[userUid], role: 'editor' };
        await db.collection('workspaces').doc(wsId).update({ ownerId: newOwnerUid, members: newMembers });
        res.json({ ok: true });
        return;
      }

      if (action === 'renameWorkspace') {
        const { wsId, name } = params;
        const wsSnap = await db.collection('workspaces').doc(wsId).get();
        if (!wsSnap.exists) { res.status(404).json({ error: 'Workspace bestaat niet' }); return; }
        if (wsSnap.data().ownerId !== userUid) { res.status(403).json({ error: 'Alleen de eigenaar' }); return; }
        if (!name || !String(name).trim()) { res.status(400).json({ error: 'Naam vereist' }); return; }
        await db.collection('workspaces').doc(wsId).update({ name: String(name).trim() });
        res.json({ ok: true });
        return;
      }

      if (action === 'deleteAccount') {
        // For each workspace where the user is the SOLE owner: wipe it.
        // For others: remove the user from members.
        const userDocRef = db.collection('users').doc(userUid);
        const userDoc = await userDocRef.get();
        const wsIds = userDoc.exists ? (userDoc.data().workspaceIds || []) : [];

        for (const wsId of wsIds) {
          const wsSnap = await db.collection('workspaces').doc(wsId).get();
          if (!wsSnap.exists) continue;
          const wsData = wsSnap.data();
          if (wsData.ownerId === userUid) {
            await wipeWorkspace(db, wsId);
          } else {
            // Remove user from members.
            const newMembers = { ...(wsData.members || {}) };
            delete newMembers[userUid];
            await db.collection('workspaces').doc(wsId).update({ members: newMembers });
          }
        }

        // Delete user doc.
        try { await userDocRef.delete(); } catch {}
        // Delete Firebase Auth account.
        try { await admin.auth().deleteUser(userUid); } catch (e) { logger.warn('auth delete failed', e); }
        res.json({ ok: true });
        return;
      }

      res.status(400).json({ error: 'Unknown action' });
    } catch (e) {
      const code = e?.code === 401 ? 401 : 500;
      logger.error('accountAction failed', e);
      res.status(code).json({ error: String(e?.message || e) });
    }
  },
);
