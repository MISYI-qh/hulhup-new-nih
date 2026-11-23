import { handle } from '../lib/app.js';
import { ApiErr } from '../lib/util.js';
import { pushFlush } from '../lib/push.js';

const ORIGINS = new Set(['https://hulhup.my.id', 'https://www.hulhup.my.id']);

function cors(req, res) {
  const o = req.headers.origin;
  if (o && (ORIGINS.has(o) || (process.env.VERCEL_ENV !== 'production' && /^http:\/\/localhost(:\d+)?$/.test(o)))) {
    res.setHeader('Access-Control-Allow-Origin', o);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Today');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
}

export default async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; sandbox");
  cors(req, res);
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  try {
    const url = new URL(req.url, 'http://x');
    const r = await handle(req, url);
    await pushFlush();
    if (r && r.binary) {
      res.statusCode = 200;
      res.setHeader('Content-Type', r.mime);
      res.setHeader('Cache-Control', r.cache);
      if (String(r.cache).startsWith('public')) { res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'); } // foto profil publik: bisa tampil di domain mana pun
      res.setHeader('Content-Length', r.binary.length);
      return res.end(r.binary);
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(r));
  } catch (e) {
    const known = e instanceof ApiErr;
    if (!known) console.error('error', e && e.message);
    res.statusCode = known ? e.status : 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ error: known ? e.code : 'server' }));
  }
}
