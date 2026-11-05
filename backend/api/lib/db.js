// Akses Postgres (Neon). Untuk tes lokal memakai PGlite (Postgres WASM) bila PGLITE=1.
import pg from 'pg';

let pool = null;
let lite = null;

async function pglite() {
  if (lite) return lite;
  const { PGlite } = await import('@electric-sql/pglite');
  const { readFileSync } = await import('node:fs');
  lite = new PGlite();
  await lite.exec(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  return lite;
}

function p() {
  return (pool ??= new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3, idleTimeoutMillis: 10000 }));
}

const norm = (r) => { if (r && r.rowCount === undefined) r.rowCount = r.affectedRows ?? 0; return r; };
function wrap(t) { return { query: async (text, params = []) => norm(await t.query(text, params)) }; }

export async function q(text, params = []) {
  if (process.env.PGLITE) return norm(await (await pglite()).query(text, params));
  return p().query(text, params);
}
export async function one(text, params) { return (await q(text, params)).rows[0] ?? null; }
export async function many(text, params) { return (await q(text, params)).rows; }

/** Transaksi: fn menerima objek dengan query(text, params). */
export async function tx(fn) {
  if (process.env.PGLITE) return (await pglite()).transaction((t) => fn(wrap(t)));
  const c = await p().connect();
  try {
    await c.query('BEGIN');
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
