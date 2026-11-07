// Notifikasi dorong lewat Firebase Cloud Messaging (HTTP v1). Kunci hanya ada di variabel lingkungan server.
import { createSign } from 'node:crypto';
import { q, many } from './db.js';

const Q = [];
let tok = null, tokExp = 0;
const b64 = (x) => Buffer.from(x).toString('base64url');
const KEY = () => String(process.env.FCM_KEY || '').replace(/\\n/g, '\n');

export const pushReady = () => !!(process.env.FCM_KEY && process.env.FCM_EMAIL && process.env.FCM_PROJECT);
export function pushLater(to, type, actor, extra) { if (pushReady()) Q.push({ to, type, actor, extra: extra || '' }); }

async function accessToken() {
  if (tok && Date.now() < tokExp) return tok;
  const t = Math.floor(Date.now() / 1000);
  const head = b64(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64(JSON.stringify({ iss: process.env.FCM_EMAIL, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: t, exp: t + 3600 }));
  const sig = createSign('RSA-SHA256').update(`${head}.${body}`).sign(KEY()).toString('base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${head}.${body}.${sig}`,
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('fcm_token');
  tok = j.access_token; tokExp = Date.now() + (Number(j.expires_in || 3600) - 120) * 1000;
  return tok;
}

const TXT = {
  id: { like: 'menyukai audiomu', follow: 'mulai mengikutimu', rel_req: 'mengajakmu menjalin hubungan', rel_ok: 'menerima hubunganmu' },
  en: { like: 'liked your audio', follow: 'started following you', rel_req: 'invited you to a relationship', rel_ok: 'accepted your relationship' },
};

export async function pushFlush() {
  if (!Q.length) return;
  const items = Q.splice(0, 20);
  try {
    const at = await accessToken();
    for (const it of items) {
      const toks = await many('select token, lang from push_tokens where user_id=$1', [it.to]);
      if (!toks.length) continue;
      const a = await many('select name, username from users where id=$1', [it.actor]);
      const who = (a[0] && (a[0].name || a[0].username)) || 'Hulhup';
      for (const t of toks) {
        const lang = t.lang === 'en' ? 'en' : 'id';
        const msg = TXT[lang][it.type]; if (!msg) continue;
        const r = await fetch(`https://fcm.googleapis.com/v1/projects/${process.env.FCM_PROJECT}/messages:send`, {
          method: 'POST', headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: { token: t.token, notification: { title: 'Hulhup', body: `${who} ${msg}` }, data: { type: it.type }, android: { priority: 'HIGH', notification: { icon: 'ic_stat_hulhup', channel_id: 'hulhup_main' } } } }),
        });
        if (r.status === 404) await q('delete from push_tokens where token=$1', [t.token]);
      }
    }
  } catch (e) { console.error('push', e && e.message); }
}

export async function pushDiag() {
  try { await accessToken(); return { ready: pushReady(), token: true }; } catch (e) { return { ready: pushReady(), token: false }; }
}
