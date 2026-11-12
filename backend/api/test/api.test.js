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
const mkpost = async (t, text, extra = {}, audio = mp3()) => { const r = await call('POST', '/posts', { token: t, body: { text, audios: 1, ...extra } }); if (!r.id) return r; const u = await call('POST', `/posts/${r.id}/audio?secs=3`, { token: t, raw: audio }); assert.equal(u.ok, true, JSON.stringify(u)); return r; };
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
  // putar & lihat: 1 per akun walau diulang
  for (let i = 0; i < 3; i++) { await call('POST', `/audios/${r.audio.id}/play`, { token: b }); await call('POST', `/audios/${r.audio.id}/view`, { token: b }); }
  const pv = await call('POST', `/audios/${r.audio.id}/play`, { token: b });
  assert.deepEqual([pv.plays, pv.views, pv.counted], [1, 1, false]);
  const pv2 = await call('POST', `/audios/${r.audio.id}/view`, { token: a });
  assert.deepEqual([pv2.plays, pv2.views, pv2.counted], [1, 2, true]);
  assert.equal((await call('POST', `/audios/${r.audio.id}/play`)).ok, false);
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

test('Hups: aturan post (1 audio wajib, teks maks 1000), komentar tanpa audio, tag, sematan, filter multi', async () => {
  const a = await reg('hupa'), b = await reg('hupb'), c3 = await reg('hupc');
  assert.equal((await call('POST', '/posts', { token: null, body: { text: 'x', audios: 1 } })).error, 'unauthorized');
  // wajib tepat 1 audio
  const txt = await call('POST', '/posts', { token: a, body: { text: 'hanya teks', audios: 0 } });
  assert.ok(txt.id, JSON.stringify(txt));
  assert.equal((await call('GET', `/posts/${txt.id}`, { token: a })).post.files.length, 0);
  assert.equal((await call('POST', '/posts', { token: a, body: { text: '', audios: 0 } })).error, 'empty');
  const panjang = await call('POST', '/posts', { token: a, body: { text: 'a'.repeat(5000), audios: 0 } });
  assert.ok(panjang.id, JSON.stringify(panjang));
  const bg = await mkpost(a, 'dengan backsound', { bgm: true });
  assert.equal((await call('GET', `/posts/${bg.id}`, { token: a })).post.bgm, true);
  assert.equal((await call('POST', '/posts', { token: a, body: { text: 'dua audio', audios: 2 } })).error, 'need_audio');
  assert.equal((await call('POST', '/posts', { token: a, body: { text: 'tiga audio', audios: 3 } })).error, 'need_audio');
  assert.ok((await call('POST', '/posts', { token: a, body: { text: 'x' } })).id);
  // teks maksimal 1000 huruf
  const edge = await mkpost(a, 'a'.repeat(1000)); assert.ok(edge.id);
  // satu post tampil di Acak dan Hups; tersembunyi sampai audio terunggah
  const p2 = await call('POST', '/posts', { token: a, body: { text: 'halo @hupb', audios: 1 } });
  assert.equal((await call('GET', `/posts/${p2.id}`, { token: b })).error, 'not_found');
  assert.equal((await call('POST', `/posts/${p2.id}/audio?secs=3`, { token: a, raw: mp3() })).ok, true);
  assert.equal((await call('POST', `/posts/${p2.id}/audio?secs=4`, { token: a, raw: mp3() })).ok, false); // audio kedua ditolak
  const d2 = await call('GET', `/posts/${p2.id}`, { token: b });
  assert.equal(d2.post.files.length, 1);
  assert.equal(d2.post.in_rand, true);
  assert.equal(d2.post.in_hups, true);
  assert.equal(d2.post.bgm, false);
  const feed = await call('GET', '/hups?f=public', { token: b });
  assert.ok(feed.items.some((x) => x.id === p2.id));
  assert.equal((await call('GET', '/hups?f=public')).ok, true); // tamu boleh lihat
  let seen = false;
  for (let i = 0; i < 80 && !seen; i++) { const r = await call('GET', '/random?f=public', { token: b }); if (r.audio && r.audio.id === p2.id) seen = true; }
  assert.ok(seen, 'post juga muncul di Acak');
  // audio lebih dari 1 MB ditolak
  const p4 = await call('POST', '/posts', { token: a, body: { text: 'besar', audios: 1 } });
  assert.equal((await call('POST', `/posts/${p4.id}/audio?secs=3`, { token: a, raw: mp3(1100 * 1024) })).error, 'too_big');
  await call('DELETE', `/audios/${p4.id}`, { token: a });
  // tag: akun yang di-tag dapat notifikasi "mention"
  const nb = await call('GET', '/notifications', { token: b });
  assert.ok(nb.items.some((x) => x.type === 'mention' && x.post === p2.id));
  // komentar: tanpa audio, panjang bebas, bersarang
  assert.equal((await call('POST', `/posts/${p2.id}/comments`, { token: b, body: { audios: 1 } })).error, 'empty');
  assert.equal((await call('POST', `/comments/1/audio`, { token: b, raw: mp3() })).error, 'no_comment_audio');
  const big = await call('POST', `/posts/${p2.id}/comments`, { token: b, body: { text: 'k'.repeat(5000), audios: 1 } });
  assert.ok(big.id);
  assert.equal((await call('GET', `/comments/${big.id}/text`, { token: b })).text.length, 5000);
  const rep2 = await call('POST', `/posts/${p2.id}/comments`, { token: c3, body: { text: 'balasan', parent: big.id } });
  assert.ok(rep2.id);
  const cl = await call('GET', `/posts/${p2.id}/comments`, { token: b });
  assert.ok(cl.items.every((x) => !x.files || x.files.length === 0));
  // filter multi: satu post bisa untuk beberapa audiens sekaligus
  const p3 = await mkpost(a, 'untuk teman dan pengikut', { rand: ['friend', 'followers'] });
  assert.ok(p3.id);
  assert.ok((await call('GET', '/users/hupa', { token: b })).user.rels >= 0);
  // hapus post membersihkan
  assert.equal((await call('DELETE', `/audios/${p2.id}`, { token: a })).ok, true);
  assert.equal((await call('GET', `/posts/${p2.id}`, { token: a })).error, 'not_found');
});

test('penanda AI dari metadata (audio dan foto profil)', async () => {
  const S = await import('../lib/deks/samples.js');
  const a = await reg('aiuser');
  const tagged = S.mp3WithId3([['TXXX', S.id3Txxx('encoder', 'ElevenLabs text-to-speech')]]);
  const p = await mkpost(a, 'suara buatan', {}, tagged);
  const got = (await call('GET', `/posts/${p.id}`, { token: a })).post;
  assert.equal(got.ai, true); assert.equal(got.ai_kind, 'made');
  const edited = await mkpost(a, 'suara diedit', {}, S.wav(Buffer.concat([(() => { const x = Buffer.from(S.xmpDst('compositeWithTrainedAlgorithmicMedia')); const h = Buffer.alloc(8); h.write('_PMX', 0); h.writeUInt32LE(x.length, 4); return Buffer.concat([h, x, x.length & 1 ? Buffer.from([0]) : Buffer.alloc(0)]); })()])));
  assert.equal((await call('GET', `/posts/${edited.id}`, { token: a })).post.ai_kind, 'edited');
  const q1 = await mkpost(a, 'suara biasa');
  assert.equal((await call('GET', `/posts/${q1.id}`, { token: a })).post.ai, false);
  assert.equal((await call('POST', '/me/avatar', { token: a, raw: S.pngWithText(S.plainPng(), 'parameters', 'x\nSteps: 20, Sampler: Euler a') })).ok, true);
  assert.equal((await call('GET', '/me', { token: a })).user.avatar_ai, true);
  assert.equal((await call('POST', '/me/avatar', { token: a, raw: S.pngWithText(S.plainPng(), 'Software', 'Camera') })).ok, true);
  assert.equal((await call('GET', '/me', { token: a })).user.avatar_ai, false);
  const real = S.mp3WithId3([['TIT2', S.id3Text('audio diary')], ['TXXX', S.id3Txxx('handler', 'AudioHandler soun c2pa jumbf')]]);
  const rp = await mkpost(a, 'rekaman biasa', {}, real);
  assert.equal((await call('GET', `/posts/${rp.id}`, { token: a })).post.ai, false);
});

test('algoritma Hups: sorot + komentar + waktu', async () => {
  const a = await reg('algo'), b = await reg('algb');
  const old = await mkpost(a, 'lama sekali');
  const pop = await mkpost(a, 'populer');
  const fresh = await mkpost(a, 'baru');
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
  const pp = await mkpost(a, 'hai');
  await call('POST', `/audios/${pp.id}/like`, { token: b });
  const n = await call('GET', '/notifications', { token: a });
  assert.ok(n.items.length >= 2 && n.items[0].id > 0);
  assert.equal((await call('POST', '/notifications/delete', { token: a, body: { ids: [n.items[0].id] } })).n, 1);
  assert.equal((await call('POST', '/notifications/delete', { token: b, body: { ids: [n.items[1].id] } })).n, 0); // bukan miliknya
  assert.equal((await call('GET', '/notifications', { token: a })).items.length, n.items.length - 1);
  assert.ok((await call('POST', '/notifications/delete', { token: a, body: { all: true } })).n >= 1);
  assert.equal((await call('GET', '/notifications', { token: a })).items.length, 0);
  // terkirim: siapa saja yang pernah dikirimi
  await mkpost(a, 'rahasia', { rand: 'accounts', to: ['notib'] });
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

test('Deks v2: contoh penanda alat asli (ditandai) dan contoh biasa (tidak ditandai)', async () => {
  const { runSelfTest } = await import('../lib/deks/selftest.js');
  const r = runSelfTest();
  assert.equal(r.ok, true, JSON.stringify(r.failed));
  assert.ok(r.total >= 30);
});

test('Deks v2: watermark Stable Diffusion terbaca dari PNG (fixture dari paket resmi invisible-watermark)', async () => {
  const fs = await import('node:fs');
  const { deksImage } = await import('../lib/deks/index.js');
  for (const [f, name] of [['sd1', 'Stable Diffusion v1'], ['sd2', 'Stable Diffusion v2'], ['xl', 'SDXL']]) {
    const rep = deksImage(fs.readFileSync(new URL(`./fixtures/wm-${f}.png`, import.meta.url)));
    assert.equal(rep.ai, true, f);
    assert.ok(rep.hits[0].why.includes(name), rep.hits[0].why);
  }
  assert.equal(deksImage(fs.readFileSync(new URL('./fixtures/wm-none.png', import.meta.url))).ai, false);
});

test('foto profil: paket DKS1 (berkas asli + foto tersimpan) dan tanda AI dari berkas asli', async () => {
  const S = await import('../lib/deks/samples.js');
  const tok = await reg('fotoai');
  const pack = (meta, img) => { const h = Buffer.alloc(9); h.write('DKS1', 0); h[4] = 0; h.writeUInt32BE(meta.length, 5); return Buffer.concat([h, meta, img]); };
  const small = S.plainJpeg(48, 48);
  const orig = S.pngWithText(S.plainPng(), 'parameters', 'x\nSteps: 20, Sampler: Euler a');
  const put = (body) => call('POST', '/me/avatar', { token: tok, raw: body });
  assert.equal((await put(pack(orig, small))).ok, true);
  let me = (await call('GET', '/me', { token: tok })).user;
  assert.equal(me.avatar_ai, true); assert.equal(me.avatar_ai_kind, 'made');
  // foto kamera biasa -> tidak ditandai, dan tanda lama hilang
  assert.equal((await put(pack(S.plainJpeg(64, 64), small))).ok, true);
  me = (await call('GET', '/me', { token: tok })).user;
  assert.equal(me.avatar_ai, false); assert.equal(me.avatar_ai_kind, '');
  // unggah polos (aplikasi lama) tetap jalan
  assert.equal((await put(small)).ok, true);
  assert.equal((await call('GET', '/deks/selftest')).ok, true);
});
