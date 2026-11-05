import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.PGLITE = '1';
const { handle } = await import('../lib/app.js');
const { ApiErr } = await import('../lib/util.js');
import { Readable } from 'node:stream';

async function call(method, path, { token, body, raw, ip } = {}) {
  const buf = raw ?? (body ? Buffer.from(JSON.stringify(body)) : Buffer.alloc(0));
  const req = Readable.from(buf.length ? [buf] : []);
  req.method = method; req.socket = {};
  req.headers = { 'x-forwarded-for': ip || '1.1.1.1', ...(token ? { authorization: 'Bearer ' + token } : {}), ...(raw ? { 'content-type': 'application/octet-stream' } : body ? { 'content-type': 'application/json' } : {}) };
  try { return { ok: true, ...(await handle(req, new URL(path, 'http://x'))) }; }
  catch (e) { if (e instanceof ApiErr) return { ok: false, error: e.code, status: e.status }; throw e; }
}
const mp3 = (n = 2000) => Buffer.concat([Buffer.from([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 0]), Buffer.alloc(n, 1)]);
const reg = async (u) => (await call('POST', '/register', { body: { name: u, username: u, password: 'secret1', birth: '2000-01-01' }, ip: '9.9.' + u })).token;

test('alur utama', async () => {
  const a = await reg('alice'), b = await reg('bobby');
  assert.equal((await call('POST', '/register', { body: { name: 'x', username: 'alice', password: 'secret1', birth: '2000-01-01' } })).error, 'username_taken');
  assert.equal((await call('POST', '/login', { body: { username: 'alice', password: 'salah!!' } })).error, 'bad_credentials');
  assert.equal((await call('POST', '/audios?secs=5&rand=public&desc=hai', { token: a, raw: mp3() })).ok, true);
  assert.equal((await call('POST', '/audios?secs=25&rand=friend', { token: a, raw: mp3() })).ok, true);
  const r = await call('GET', '/random?f=public', { token: b });
  assert.equal(r.audio.owner, 'alice');
  assert.equal((await call('GET', '/random?f=friend', { token: b })).audio, null);
  // like + notif
  const l = await call('POST', `/audios/${r.audio.id}/like`, { token: b });
  assert.deepEqual([l.liked, l.likes], [true, 1]);
  assert.equal((await call('POST', `/audios/${r.audio.id}/like`, { token: b })).likes, 0);
  await call('POST', `/audios/${r.audio.id}/like`, { token: b });
  assert.equal((await call('GET', '/me', { token: a })).unread_social, 1);
  // file akses
  assert.ok((await call('GET', `/audios/${r.audio.id}/file`, { token: b })).binary);
  // hubungan dua pihak
  await call('POST', '/relations', { token: b, body: { to: 'alice', type: 'friend' } });
  assert.equal((await call('POST', '/relations/bobby/accept', { token: a })).ok, true);
  assert.equal((await call('GET', '/random?f=friend', { token: b })).audio.owner, 'alice');
  // follow
  const f = await call('POST', '/users/alice/follow', { token: b });
  assert.deepEqual([f.following, f.followers], [true, 1]);
  // profil terkunci
  await call('PATCH', '/me/settings', { token: a, body: { pvis: 'me' } });
  assert.equal((await call('GET', '/users/alice', { token: await reg('carol') })).locked, true);
  // foto
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100)]);
  assert.equal((await call('POST', '/me/avatar', { token: a, raw: png })).ok, true);
  assert.equal((await call('POST', '/me/avatar', { token: a, raw: Buffer.concat([png, Buffer.alloc(4 * 1024 * 1024)]) })).error, 'too_big_img');
  assert.equal((await call('GET', '/stats')).ok, true);
  assert.equal((await call('GET', '/notifications', { token: null })).error, 'unauthorized');
});

test('akun dibanned diblokir', async () => {
  const t = await reg('dave');
  const { q } = await import('../lib/db.js');
  await q(`update users set status='banned' where username='dave'`);
  assert.equal((await call('GET', '/me', { token: t })).error, 'banned');
});
