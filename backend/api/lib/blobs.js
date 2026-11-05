// Penyimpanan berkas: audio 1-20 dtk -> MongoDB, audio 21-30 dtk -> Supabase Storage (lewat Edge Function), foto -> Postgres.
// Tanpa konfigurasi (tes lokal) memakai memori.
import { randomBytes } from 'node:crypto';

const mem = new Map();
let mongo = null;

async function coll() {
  if (!mongo) {
    const { MongoClient } = await import('mongodb');
    const c = new MongoClient(process.env.MONGODB_URI, { maxPoolSize: 3, serverSelectionTimeoutMS: 8000 });
    await c.connect();
    mongo = c.db(process.env.MONGODB_DB || 'hulhup').collection('audio');
  }
  return mongo;
}

async function sb(method, key, body, mime) {
  const r = await fetch(`${process.env.SUPABASE_URL}/functions/v1/blob?key=${encodeURIComponent(key)}`, {
    method,
    headers: { 'x-blob-secret': process.env.BLOB_SECRET, ...(mime ? { 'content-type': mime } : {}) },
    body,
  });
  if (!r.ok && !(method === 'DELETE')) throw new Error(`supabase ${r.status}`);
  return r;
}

export const storeFor = (secs) => (secs <= 20 && (process.env.MONGODB_URI || !process.env.SUPABASE_URL) ? 'mongo' : 'supabase');

export async function putAudio(store, buf, mime) {
  const key = randomBytes(12).toString('hex');
  if (store === 'mongo' && process.env.MONGODB_URI) {
    const { Binary } = await import('mongodb');
    await (await coll()).insertOne({ _id: key, data: new Binary(buf), mime, created: Date.now() });
  } else if (store === 'supabase' && process.env.SUPABASE_URL) {
    await sb('PUT', key, buf, mime);
  } else mem.set(`${store}:${key}`, buf);
  return key;
}

export async function getAudio(store, key) {
  if (store === 'mongo' && process.env.MONGODB_URI) {
    const d = await (await coll()).findOne({ _id: key });
    return d ? Buffer.from(d.data.buffer) : null;
  }
  if (store === 'supabase' && process.env.SUPABASE_URL) {
    const r = await sb('GET', key);
    return r.status === 404 ? null : Buffer.from(await r.arrayBuffer());
  }
  return mem.get(`${store}:${key}`) ?? null;
}

export async function delAudio(store, key) {
  try {
    if (store === 'mongo' && process.env.MONGODB_URI) await (await coll()).deleteOne({ _id: key });
    else if (store === 'supabase' && process.env.SUPABASE_URL) await sb('DELETE', key);
    else mem.delete(`${store}:${key}`);
  } catch { /* berkas yatim dibersihkan belakangan */ }
}
