import * as webpush from 'web-push';
import { config } from './config.ts';
import { db, getSetting, setSetting } from './db.ts';

// VAPID keys: from .env if given, otherwise generated once and kept in the database
// so existing subscriptions keep working across restarts.
let publicKey = config.vapidPublic;
let privateKey = config.vapidPrivate;
if (!publicKey || !privateKey) {
  publicKey = getSetting('vapid_public') || '';
  privateKey = getSetting('vapid_private') || '';
  if (!publicKey || !privateKey) {
    const keys = webpush.generateVAPIDKeys();
    publicKey = keys.publicKey;
    privateKey = keys.privateKey;
    setSetting('vapid_public', publicKey);
    setSetting('vapid_private', privateKey);
    console.log('[push] Generated new VAPID keys and stored them in the database.');
  }
}
webpush.setVapidDetails(config.vapidSubject, publicKey, privateKey);

export const vapidPublicKey = publicKey;

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

type SubRow = { id: number; player_id: number; endpoint: string; sub_json: string };

export function saveSubscription(playerId: number, sub: webpush.PushSubscription) {
  db.prepare(
    `INSERT INTO push_subs (player_id, endpoint, sub_json) VALUES (?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET player_id = excluded.player_id, sub_json = excluded.sub_json`,
  ).run(playerId, sub.endpoint, JSON.stringify(sub));
}

async function sendTo(rows: SubRow[], payload: PushPayload) {
  const body = JSON.stringify({ ...payload, url: payload.url || '/' });
  let sent = 0;
  let failed = 0;
  await Promise.all(
    rows.map(async (row) => {
      try {
        await webpush.sendNotification(JSON.parse(row.sub_json), body, { TTL: 60 * 60 * 6, urgency: 'high' });
        sent++;
      } catch (err: any) {
        failed++;
        // 404/410: subscription is gone (app removed or permission revoked)
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          db.prepare('DELETE FROM push_subs WHERE id = ?').run(row.id);
        } else {
          console.warn('[push] send failed', err?.statusCode, err?.body || err?.message);
        }
      }
    }),
  );
  return { sent, failed };
}

export function pushToPlayer(playerId: number, payload: PushPayload) {
  const rows = db.prepare('SELECT * FROM push_subs WHERE player_id = ?').all(playerId) as SubRow[];
  return sendTo(rows, payload);
}

export function pushToAll(payload: PushPayload, exceptPlayerId?: number) {
  const rows = db.prepare('SELECT * FROM push_subs WHERE player_id != ?').all(exceptPlayerId ?? -1) as SubRow[];
  return sendTo(rows, payload);
}
