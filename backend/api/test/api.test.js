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
const reg = async (u) => { const r = await call('POST', '/register', { body: { name: u, username: u, password: 'secret1', birth: '2000-01-01' }, ip: '9.9.' + u }); if (!r.token) console.log('REG', u, JSON.stringify(r)); return r.token; };

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

test('pengunggah ikut mendengar audio publiknya sendiri; maks 15 dtk', async () => {
  const t = await reg('erin');
  await call('POST', '/audios?secs=40&rand=public&desc=punyaku', { token: t, raw: mp3() });
  let own = null;
  for (let i = 0; i < 60 && !own; i++) { const r = await call('GET', '/random?f=public', { token: t }); if (r.audio && r.audio.owner === 'erin') own = r.audio; }
  assert.ok(own, 'audio sendiri harus bisa muncul');
  assert.equal(own.secs, 15);
  assert.equal((await call('GET', '/random?f=friend', { token: t })).audio, null);
});

test('akun dibanned diblokir', async () => {
  const t = await reg('dave');
  const { q } = await import('../lib/db.js');
  await q(`update users set status='banned' where username='dave'`);
  assert.equal((await call('GET', '/me', { token: t })).error, 'banned');
});

test('laporan, keluar perangkat lain, spasi sandi', async () => {
  assert.equal((await call('POST', '/register', { body: { name: 'x', username: 'spasi', password: 'a b c d e', birth: '2000-01-01' }, ip: '7.7.7.7' })).error, 'bad_password');
  const a = await reg('frank'), b = await reg('gina'), c = await reg('hank'), d = await reg('iris');
  await call('POST', '/audios?secs=3&rand=public&desc=lapor', { token: a, raw: mp3() });
  let id = null;
  for (let i = 0; i < 80 && !id; i++) { const r = await call('GET', '/random?f=public', { token: b }); if (r.audio && r.audio.owner === 'frank') id = r.audio.id; }
  assert.ok(id);
  assert.equal((await call('POST', '/reports', { token: a, body: { audio: id, reason: 'spam' } })).error, 'forbidden');
  for (const t of [b, c, d]) assert.equal((await call('POST', '/reports', { token: t, body: { audio: id, reason: 'spam' } })).ok, true);
  const { one } = await import('../lib/db.js');
  assert.equal((await one('select hidden from audios where id=$1', [id])).hidden, false); // laporan tidak diproses otomatis
  assert.equal((await one('select count(*)::int n from reports where target_audio=$1', [id])).n, 3);
  const t2 = (await call('POST', '/login', { body: { username: 'frank', password: 'secret1' }, ip: '8.8.8.8' })).token;
  const o = await call('POST', '/me/logout-others', { token: a });
  assert.equal(o.closed, 1);
  assert.equal((await call('GET', '/me', { token: t2 })).error, 'unauthorized');
  assert.equal((await call('GET', '/me', { token: a })).ok, true);
});

test('privasi profil & perangkat', async () => {
  const a = await reg('privy'), b = await reg('other1'); assert.ok(a && b, 'reg');
  const up = await call('POST', '/audios?secs=3&rand=public', { token: a, raw: mp3() }); assert.equal(up.error, undefined, JSON.stringify(up));
  await call('PATCH', '/me/settings', { token: a, body: { pvis: 'me' } });
  const own = await call('GET', '/users/privy', { token: a });
  assert.equal(own.audios.length, 1); assert.equal(own.locked, false);
  const other = await call('GET', '/users/privy', { token: b });
  assert.equal(other.locked, true); assert.equal(other.audios.length, 0);
  const s = await call('GET', '/me/sessions', { token: a });
  assert.equal(s.items.length, 1); assert.equal(s.items[0].current, true);
  const t2 = (await call('POST', '/login', { body: { username: 'privy', password: 'secret1' }, ip: '7.7.7.7' })).token;
  const s2 = await call('GET', '/me/sessions', { token: a });
  assert.equal(s2.items.length, 2);
  const other2 = s2.items.find((i) => !i.current);
  assert.equal((await call('DELETE', '/me/sessions/' + other2.id, { token: a })).ok, true);
  assert.equal((await call('GET', '/me', { token: t2 })).error, 'unauthorized');
  assert.equal((await call('DELETE', '/me/sessions/' + s2.items.find((i) => i.current).id, { token: a })).error, 'not_found');
});

test('Hups: teks panjang, banyak audio, komentar bersarang, simpan, filter', async () => {
  const a = await reg('hupa'), b = await reg('hupb');
  const long = 'kata '.repeat(600).trim(); // 2999 huruf -> teks lengkap di penyimpanan teks
  // pilih tempat wajib
  assert.equal((await call('POST', '/posts', { token: a, body: { text: 'x' } })).error, 'pick_place');
  assert.equal((await call('POST', '/posts', { token: a, body: { hups: true } })).error, 'empty');
  assert.equal((await call('POST', '/posts', { token: null, body: { text: 'x', hups: true } })).error, 'unauthorized');
  const p1 = await call('POST', '/posts', { token: a, body: { text: long, hups: true, rand_on: true, audios: 0 } });
  assert.ok(p1.id);
  // banyak audio: otomatis tidak masuk acak, tersembunyi sampai semua audio terunggah
  const p2 = await call('POST', '/posts', { token: a, body: { text: 'dua audio', hups: true, rand_on: true, audios: 2 } });
  assert.equal((await call('GET', `/posts/${p2.id}`, { token: b })).error, 'not_found');
  assert.equal((await call('POST', `/posts/${p2.id}/audio?secs=3`, { token: a, raw: mp3() })).done, false);
  assert.equal((await call('POST', `/posts/${p2.id}/audio?secs=4`, { token: a, raw: mp3() })).done, true);
  assert.equal((await call('POST', `/posts/${p2.id}/audio?secs=4`, { token: a, raw: mp3() })).ok, false);
  const d2 = await call('GET', `/posts/${p2.id}`, { token: b });
  assert.deepEqual(d2.post.files.map((f) => f.secs), [3, 4]);
  assert.equal(d2.post.in_rand, false);
  // preview dipotong, halaman penuh lengkap
  const feed = await call('GET', '/hups?f=public', { token: b });
  const it1 = feed.items.find((x) => x.id === p1.id);
  assert.ok(it1.long && it1.desc.length <= 300);
  assert.equal((await call('GET', `/posts/${p1.id}`, { token: b })).text, long);
  assert.equal((await call('GET', '/hups?f=public')).ok, true); // tamu boleh lihat
  // filter hups = filter acak
  const p3 = await call('POST', '/posts', { token: a, body: { text: 'untuk teman', hups: true, rand: 'friend' } });
  assert.equal((await call('GET', '/hups?f=public', { token: b })).items.some((x) => x.id === p3.id), false);
  assert.equal((await call('GET', '/hups?f=friend', { token: b })).items.length, 0);
  // acak: teks saja boleh, banyak audio tidak
  const rr = await call('GET', '/random?f=public', { token: b });
  assert.notEqual(rr.audio && rr.audio.id, p2.id);
  // komentar bersarang
  const c1 = await call('POST', `/posts/${p1.id}/comments`, { token: b, body: { text: 'komentar pertama' } });
  const c2 = await call('POST', `/posts/${p1.id}/comments`, { token: a, body: { text: 'balasan', parent: c1.id } });
  assert.equal((await call('POST', `/posts/${p1.id}/comments`, { token: null, body: { text: 'x' } })).error, 'unauthorized');
  assert.equal((await call('POST', `/posts/${p1.id}/comments`, { token: b, body: {} })).error, 'empty');
  const bigc = await call('POST', `/posts/${p1.id}/comments`, { token: b, body: { text: 'z'.repeat(5000) } });
  const cl = await call('GET', `/posts/${p1.id}/comments`, { token: b });
  assert.equal(cl.items.length, 3);
  assert.equal(cl.items.find((x) => x.id === c2.id).parent, c1.id);
  assert.ok(cl.items.find((x) => x.id === bigc.id).long);
  assert.equal((await call('GET', `/comments/${bigc.id}/text`, { token: b })).text.length, 5000);
  assert.equal((await call('GET', `/posts/${p1.id}`, { token: b })).post.comments, 3);
  // komentar audio satu
  const ca = await call('POST', `/posts/${p1.id}/comments`, { token: b, body: { audio: true } });
  assert.equal((await call('GET', `/posts/${p1.id}/comments`, { token: a })).items.length, 3);
  assert.equal((await call('POST', `/comments/${ca.id}/audio?secs=2`, { token: b, raw: mp3() })).ok, true);
  const cl2 = await call('GET', `/posts/${p1.id}/comments`, { token: a });
  assert.equal(cl2.items.length, 4);
  assert.ok((await call('GET', `/comments/${ca.id}/file`, { token: a })).binary);
  // sorot komentar, notifikasi, hapus
  assert.equal((await call('POST', `/comments/${c1.id}/like`, { token: a })).likes, 1);
  assert.ok((await call('GET', '/me', { token: a })).unread_social >= 1);
  assert.equal((await call('DELETE', `/comments/${c1.id}`, { token: await reg('hupc') })).status, 403);
  assert.equal((await call('DELETE', `/comments/${c1.id}`, { token: a })).ok, true); // pemilik post boleh; balasan ikut terhapus
  assert.equal((await call('GET', `/posts/${p1.id}`, { token: b })).post.comments, 2);
  // simpan
  assert.equal((await call('POST', `/audios/${p1.id}/save`, { token: b })).saved, true);
  assert.equal((await call('GET', '/me/saved', { token: b })).audios[0].id, p1.id);
  assert.equal((await call('POST', `/audios/${p1.id}/save`, { token: b })).saved, false);
  assert.equal((await call('POST', `/audios/${p1.id}/save`, { token: null })).error, 'unauthorized');
  // privasi daftar hubungan
  await call('PATCH', '/me/settings', { token: a, body: { rvis: 'me' } });
  assert.equal((await call('GET', '/users/hupa/relations', { token: b })).locked, true);
  assert.equal((await call('GET', '/me', { token: a })).user.rvis, 'me');
  // hapus post membersihkan
  assert.equal((await call('DELETE', `/audios/${p2.id}`, { token: a })).ok, true);
  assert.equal((await call('GET', `/posts/${p2.id}`, { token: a })).error, 'not_found');
});
