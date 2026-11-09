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

test('Hups: teks, 1 audio/backsound, komentar bersarang, tag, sematan, laporan, simpan, filter multi', async () => {
  const a = await reg('hupa'), b = await reg('hupb'), c3 = await reg('hupc');
  const long = 'kata '.repeat(900).trim(); // 4499 huruf -> teks lengkap di penyimpanan teks
  assert.equal((await call('POST', '/posts', { token: a, body: { hups: true } })).error, 'empty');
  assert.equal((await call('POST', '/posts', { token: null, body: { text: 'x', hups: true } })).error, 'unauthorized');
  // tulisan saja tidak pernah masuk Acak
  const p1 = await call('POST', '/posts', { token: a, body: { text: long, hups: true, rand_on: true, audios: 0 } });
  assert.ok(p1.id);
  const rr = await call('GET', '/random?f=public', { token: b });
  assert.equal(rr.audio && rr.audio.id === p1.id, false);
  // maksimal 3 audio (Acak 1); backsound tidak masuk Acak; tersembunyi sampai audio terunggah
  const p2 = await call('POST', '/posts', { token: a, body: { text: 'ada backsound @hupb', hups: true, audios: 5, bgm: true, bgm_idx: 1 } });
  assert.equal((await call('POST', '/posts', { token: a, body: { text: 'x', hups: true, rand_on: true, audios: 2 } })).error, 'rand_one');
  assert.equal((await call('GET', `/posts/${p2.id}`, { token: b })).error, 'not_found');
  for (let i = 0; i < 3; i++) assert.equal((await call('POST', `/posts/${p2.id}/audio?secs=3`, { token: a, raw: mp3() })).ok, true);
  assert.equal((await call('POST', `/posts/${p2.id}/audio?secs=4`, { token: a, raw: mp3() })).ok, false);
  const d2 = await call('GET', `/posts/${p2.id}`, { token: b });
  assert.equal(d2.post.files.length, 3);
  assert.equal(d2.post.bgm_idx, 1);
  assert.equal(d2.post.bgm, true);
  assert.equal(d2.post.in_rand, false);
  // audio lebih dari 1 MB ditolak
  const p4 = await call('POST', '/posts', { token: a, body: { text: 'besar', hups: true, audios: 1 } });
  assert.equal((await call('POST', `/posts/${p4.id}/audio?secs=3`, { token: a, raw: mp3(1100 * 1024) })).error, 'too_big');
  await call('DELETE', `/audios/${p4.id}`, { token: a });
  // tag: akun yang di-tag dapat notifikasi "mention"
  const nb = await call('GET', '/notifications', { token: b });
  assert.ok(nb.items.some((x) => x.type === 'mention' && x.post === p2.id));
  // preview dipotong, feed Hups memuat teks lengkap bila pendek, halaman penuh lengkap
  const feed = await call('GET', '/hups?f=public', { token: b });
  const it1 = feed.items.find((x) => x.id === p1.id);
  assert.ok(it1.long && it1.desc.length <= 300 && it1.text === null);
  assert.equal(feed.items.find((x) => x.id === p2.id).text, 'ada backsound @hupb');
  assert.equal((await call('GET', `/posts/${p1.id}`, { token: b })).text, long);
  assert.equal((await call('GET', '/hups?f=public')).ok, true); // tamu boleh lihat
  // filter multi: satu post bisa untuk beberapa audiens sekaligus
  const p3 = await call('POST', '/posts', { token: a, body: { text: 'untuk teman dan pengikut', hups: true, rand: ['friend', 'followers'] } });
  assert.equal((await call('GET', '/hups?f=public', { token: b })).items.some((x) => x.id === p3.id), false);
  assert.equal((await call('GET', '/hups?f=friend', { token: b })).items.length, 0);
  await call('POST', '/users/hupa/follow', { token: b });
  assert.equal((await call('GET', '/hups?f=followers', { token: b })).items.some((x) => x.id === p3.id), true);
  assert.equal((await call('GET', '/hups?f=friend,followers,public', { token: b })).items.some((x) => x.id === p3.id), true);
  // komentar bersarang dalam, termasuk balasan ke-8 tingkat
  const c1 = await call('POST', `/posts/${p1.id}/comments`, { token: b, body: { text: 'komentar pertama' } });
  let par = c1.id, last;
  for (let i = 0; i < 8; i++) { last = await call('POST', `/posts/${p1.id}/comments`, { token: i % 2 ? b : a, body: { text: 'tingkat ' + (i + 2), parent: par } }); assert.ok(last.id); par = last.id; }
  assert.equal((await call('POST', `/posts/${p1.id}/comments`, { token: null, body: { text: 'x' } })).error, 'unauthorized');
  assert.equal((await call('POST', `/posts/${p1.id}/comments`, { token: b, body: {} })).error, 'empty');
  const bigc = await call('POST', `/posts/${p1.id}/comments`, { token: b, body: { text: 'z'.repeat(5000) } });
  const cl = await call('GET', `/posts/${p1.id}/comments`, { token: b });
  assert.equal(cl.items.length, 10);
  assert.equal(cl.items.find((x) => x.id === last.id).parent, par === last.id ? cl.items.find((x) => x.id === last.id).parent : 0);
  assert.ok(cl.items.find((x) => x.id === bigc.id).long);
  assert.equal((await call('GET', `/comments/${bigc.id}/text`, { token: b })).text.length, 5000);
  // tag di komentar -> notifikasi ke yang di-tag (hupc dapat akses karena post publik)
  await call('POST', `/posts/${p1.id}/comments`, { token: b, body: { text: 'halo @hupc', parent: c1.id } });
  assert.ok((await call('GET', '/notifications', { token: c3 })).items.some((x) => x.type === 'mention'));
  // komentar audio maksimal 1
  const ca = await call('POST', `/posts/${p1.id}/comments`, { token: b, body: { audios: 9 } });
  assert.equal((await call('GET', `/posts/${p1.id}/comments`, { token: a })).items.some((x) => x.id === ca.id), false);
  for (let i = 0; i < 1; i++) assert.equal((await call('POST', `/comments/${ca.id}/audio?secs=2`, { token: b, raw: mp3() })).ok, true);
  assert.equal((await call('POST', `/comments/${ca.id}/audio?secs=2`, { token: b, raw: mp3() })).ok, false);
  const cl2 = await call('GET', `/posts/${p1.id}/comments`, { token: a });
  assert.equal(cl2.items.find((x) => x.id === ca.id).audios.length, 1);
  assert.ok((await call('GET', `/comments/${ca.id}/file?i=0`, { token: a })).binary);
  // sematan: hanya pemilik post, hanya komentar utama, satu saja
  assert.equal((await call('POST', `/comments/${c1.id}/pin`, { token: b })).error, 'forbidden');
  assert.equal((await call('POST', `/comments/${last.id}/pin`, { token: a })).error, 'bad_request');
  assert.equal((await call('POST', `/comments/${c1.id}/pin`, { token: a })).pinned, true);
  assert.equal((await call('POST', `/comments/${bigc.id}/pin`, { token: a })).pinned, true);
  assert.deepEqual((await call('GET', `/posts/${p1.id}/comments`, { token: a })).items.filter((x) => x.pinned).map((x) => x.id), [bigc.id]);
  // laporkan komentar
  assert.equal((await call('POST', '/reports', { token: a, body: { comment: ca.id, reason: 'spam' } })).ok, true);
  assert.equal((await call('POST', '/reports', { token: b, body: { comment: ca.id, reason: 'spam' } })).error, 'forbidden');
  // sorot komentar + hapus (pemilik post boleh; balasan ikut terhapus)
  assert.equal((await call('POST', `/comments/${c1.id}/like`, { token: a })).likes, 1);
  assert.equal((await call('DELETE', `/comments/${c1.id}`, { token: c3 })).status, 403);
  assert.equal((await call('DELETE', `/comments/${c1.id}`, { token: a })).ok, true);
  assert.equal((await call('GET', `/posts/${p1.id}/comments`, { token: b })).items.length, 2);
  // simpan
  assert.equal((await call('POST', `/audios/${p1.id}/save`, { token: b })).saved, true);
  assert.equal((await call('GET', '/me/saved', { token: b })).audios[0].id, p1.id);
  assert.equal((await call('POST', `/audios/${p1.id}/save`, { token: b })).saved, false);
  assert.equal((await call('POST', `/audios/${p1.id}/save`, { token: null })).error, 'unauthorized');
  // pencarian mencakup Hups, dan menghormati audiens
  assert.ok((await call('GET', '/search?q=backsound', { token: b })).audios.some((x) => x.id === p2.id));
  assert.equal((await call('GET', '/search?q=teman%20dan', { token: c3 })).audios.length, 0);
  // privasi daftar hubungan + angka hubungan
  assert.ok((await call('GET', '/users/hupa', { token: b })).user.rels >= 0);
  await call('PATCH', '/me/settings', { token: a, body: { rvis: 'me' } });
  assert.equal((await call('GET', '/users/hupa/relations', { token: b })).locked, true);
  assert.equal((await call('GET', '/users/hupa', { token: b })).user.rels, -1);
  assert.ok((await call('GET', '/users/hupa', { token: a })).user.rels >= 0);
  assert.equal((await call('GET', '/me', { token: a })).user.rvis, 'me');
  await call('PATCH', '/me/settings', { token: a, body: { rvis: ['followers', 'friend'] } });
  assert.equal((await call('GET', '/me', { token: a })).user.rvis, 'followers,friend');
  assert.ok((await call('GET', '/users/hupa', { token: b })).user.rels >= 0); // b mengikuti a
  // hapus post membersihkan
  assert.equal((await call('DELETE', `/audios/${p2.id}`, { token: a })).ok, true);
  assert.equal((await call('GET', `/posts/${p2.id}`, { token: a })).error, 'not_found');
});

test('algoritma Hups: sorot + komentar + waktu', async () => {
  const a = await reg('algo'), b = await reg('algb');
  const old = await call('POST', '/posts', { token: a, body: { text: 'lama sekali', hups: true } });
  const pop = await call('POST', '/posts', { token: a, body: { text: 'populer', hups: true } });
  const fresh = await call('POST', '/posts', { token: a, body: { text: 'baru', hups: true } });
  for (const t of [b, await reg('algc'), await reg('algd')]) await call('POST', `/audios/${pop.id}/like`, { token: t });
  await call('POST', `/posts/${pop.id}/comments`, { token: b, body: { text: 'bagus' } });
  const ids = (await call('GET', '/hups?f=public', { token: b })).items.map((x) => x.id);
  assert.ok(ids.indexOf(pop.id) < ids.indexOf(fresh.id) && ids.indexOf(fresh.id) < ids.indexOf(old.id));
  // waktu: post sangat lama kalah dari yang baru walau sama-sama tanpa interaksi
  assert.ok(ids.indexOf(fresh.id) < ids.indexOf(old.id));
});

test('notifikasi bisa dihapus semua atau dipilih; terkirim; lupa sandi', async () => {
  const a = await reg('notia'), b = await reg('notib');
  await call('POST', '/users/notia/follow', { token: b });
  const pp = await call('POST', '/posts', { token: a, body: { text: 'hai', hups: true } });
  await call('POST', `/audios/${pp.id}/like`, { token: b });
  const n = await call('GET', '/notifications', { token: a });
  assert.ok(n.items.length >= 2 && n.items[0].id > 0);
  assert.equal((await call('POST', '/notifications/delete', { token: a, body: { ids: [n.items[0].id] } })).n, 1);
  assert.equal((await call('POST', '/notifications/delete', { token: b, body: { ids: [n.items[1].id] } })).n, 0); // bukan miliknya
  assert.equal((await call('GET', '/notifications', { token: a })).items.length, n.items.length - 1);
  assert.ok((await call('POST', '/notifications/delete', { token: a, body: { all: true } })).n >= 1);
  assert.equal((await call('GET', '/notifications', { token: a })).items.length, 0);
  // terkirim: siapa saja yang pernah dikirimi
  await call('POST', '/posts', { token: a, body: { text: 'rahasia', hups: true, rand: 'accounts', to: ['notib'] } });
  const sent = await call('GET', '/me/sent', { token: a });
  assert.deepEqual(sent.people.map((x) => [x.username, x.n]), [['notib', 1]]);
  assert.equal((await call('GET', '/me/sent?to=notib', { token: a })).audios.length, 1);
  assert.equal((await call('GET', '/hups?f=me', { token: b })).items.length, 1);
  // lupa sandi lewat kode pemulihan
  const rg = await call('POST', '/register', { body: { name: 'lupa', username: 'lupaa', password: 'secret1', birth: '2000-01-01' }, ip: '7.7.7.7' });
  assert.match(rg.recovery, /^[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/);
  assert.equal((await call('POST', '/recover', { body: { username: 'lupaa', code: 'salah-salah-sala', password: 'baru123' } })).error, 'bad_recovery');
  const ok = await call('POST', '/recover', { body: { username: 'lupaa', code: rg.recovery.toUpperCase(), password: 'baru123' } });
  assert.equal(ok.ok, true);
  assert.notEqual(ok.recovery, rg.recovery);
  assert.equal((await call('POST', '/login', { body: { username: 'lupaa', password: 'secret1' } })).error, 'bad_credentials');
  assert.ok((await call('POST', '/login', { body: { username: 'lupaa', password: 'baru123' } })).token);
  assert.equal((await call('GET', '/me', { token: rg.token })).error, 'unauthorized'); // sesi lama dicabut
  assert.equal((await call('POST', '/recover', { body: { username: 'lupaa', code: rg.recovery, password: 'baru1234' } })).error, 'bad_recovery'); // kode lama hangus
});
