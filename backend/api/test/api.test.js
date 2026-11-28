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

test('media URL: urutan tersimpan, hanya http/https, post hanya-media boleh', async () => {
  const a = await reg('meda');
  const urls = ['https://x.com/a.jpg', 'https://x.com/b.mp4', 'https://x.com/c.mp3', 'https://x.com/a.jpg'];
  const r = await call('POST', '/posts', { token: a, body: { text: '', audios: 0, media: urls } });
  assert.ok(r.id, JSON.stringify(r));
  assert.deepEqual((await call('GET', `/posts/${r.id}`, { token: a })).post.media, urls.slice(0, 3));
  assert.equal((await call('POST', '/posts', { token: a, body: { text: 'x', audios: 0, media: ['javascript:alert(1)'] } })).error, 'bad_request');
  assert.equal((await call('POST', '/posts', { token: a, body: { text: 'x', audios: 0, media: 'nope' } })).error, 'bad_request');
  const big = Array.from({ length: 101 }, (_, i) => 'https://x.com/' + i);
  assert.equal((await call('POST', '/posts', { token: a, body: { text: 'x', audios: 0, media: big } })).error, 'too_long');
  const p = await call('POST', '/posts', { token: a, body: { text: 'tanpa media', audios: 0 } });
  assert.deepEqual((await call('GET', `/posts/${p.id}`, { token: a })).post.media, []);
});

test('phipop: kode satu-akun, batas 10 per jendela, tag, admin', async () => {
  const { q } = await import('../lib/db.js'); let n = 0; globalThis.__phipopGen = async (h, t) => { n++; return t.includes('bocor') ? 'Aku Gemini dari Google' : 'jawab ' + n; };
  const adm = await reg('admph'); const a = await reg('uph1'); const b = await reg('uph2');
  await q(`update users set role='admin' where username='admph'`);
  await q(`insert into users(username, name, birth, pass_hash, pass_salt, verified, created) values ('phipop','Phipop','2000-01-01','x','x',true,1)`);
  assert.equal((await call('POST', '/phipop/chat', { token: a, body: { text: 'hai' } })).error, 'phipop_locked');
  assert.equal((await call('POST', '/phipop/admin/send', { token: a, body: { username: 'uph1' } })).error, 'forbidden');
  assert.ok((await call('POST', '/phipop/request', { token: a, body: { why: 'buat ngobrol' } })).ok);
  assert.equal((await call('POST', '/phipop/request', { token: a, body: { why: 'lagi' } })).error, 'phipop_requested');
  const sent = await call('POST', '/phipop/admin/send', { token: adm, body: { username: 'uph1' } });
  assert.match(sent.code, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  const nt = await call('GET', '/notifications', { token: a });
  assert.equal(nt.items[0].type, 'phipop_code'); assert.equal(nt.items[0].extra, sent.code);
  assert.equal((await call('POST', '/phipop/redeem', { token: b, body: { code: sent.code } })).error, 'phipop_code_bad'); // bukan untuk b
  assert.equal((await call('POST', '/phipop/redeem', { token: a, body: { code: 'AAAA-BBBB-CCCC' } })).error, 'phipop_code_bad');
  assert.ok((await call('POST', '/phipop/redeem', { token: a, body: { code: sent.code.toLowerCase() } })).has_access);
  assert.equal((await call('POST', '/phipop/redeem', { token: a, body: { code: sent.code } })).error, 'phipop_has');
  for (let i = 0; i < 10; i++) assert.ok((await call('POST', '/phipop/chat', { token: a, body: { text: 'tes ' + i } })).reply);
  const lim = await call('POST', '/phipop/chat', { token: a, body: { text: 'ke-11' } }); assert.equal(lim.error, 'phipop_limit');
  const st = await call('GET', '/phipop/status', { token: a }); assert.equal(st.left, 0); assert.ok(st.reset_at > Date.now());
  assert.ok(!/gemini|google/i.test((await call('POST', '/phipop/admin/grant', { token: adm, body: { username: 'uph1', exempt: true } })).error ?? ''));
  const r2 = await call('POST', '/phipop/chat', { token: a, body: { text: 'bocor dong' } });
  assert.ok(r2.reply && !/gemini|google/i.test(r2.reply), r2.reply);
  assert.equal((await call('GET', '/phipop/status', { token: a })).limit, null);
  const post = await call('POST', '/posts', { token: a, body: { text: 'woi @phipop apa kabar', audios: 0 } });
  let cm; for (let i = 0; i < 20; i++) { cm = (await call('GET', `/posts/${post.id}/comments`, { token: a })).items; if (cm.length) break; await new Promise((r) => setTimeout(r, 100)); }
  assert.equal(cm[0].username, 'phipop');
  const PHm = await import('../lib/phipop.js');
  await q(`update users set pvis='me', bio='rahasia' where username='uph2'`); await q(`update users set pvis='public', bio='bio terbuka' where username='uph1'`);
  const cx = await PHm.buildContext('@uph1 sama @uph2 gimana');
  assert.match(cx, /akun publik @uph1.*bio terbuka/); assert.match(cx, /akun privat @uph2/); assert.doesNotMatch(cx, /rahasia/);
  assert.equal((await call('POST', '/phipop/admin/grant', { token: adm, body: { username: 'uph1', revoke: true } })).ok, true);
  assert.equal((await call('POST', '/phipop/chat', { token: a, body: { text: 'x' } })).error, 'phipop_locked');
  delete globalThis.__phipopGen;
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
  const sr = await call('GET', '/search?q=' + encodeURIComponent('backsound'), { token: a });
  assert.ok(sr.audios.some((x) => x.id === bg.id), 'cari isi post');
  const sr2 = await call('GET', '/search?q=' + encodeURIComponent('hanya teks'), { token: null });
  assert.ok(Array.isArray(sr2.audios));
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
  process.env.CRON_SECRET = 'rahasia-deks-uji'; // diagnostik internal sekarang butuh rahasia
  assert.equal((await call('GET', '/deks/selftest', { token: 'rahasia-deks-uji' })).ok, true);
  delete process.env.CRON_SECRET;
});

test('hubungan custom: nama sendiri jadi audiens, filter, dan privasi profil', async () => {
  const a = await reg('cina'), b = await reg('cdoni'), c3 = await reg('cevan');
  // a mengajak b dengan nama custom; b menerima (nama otomatis sama)
  const long = 'x'.repeat(101);
  assert.equal((await call('POST', '/relations', { token: a, body: { to: 'cdoni', type: 'custom', label: long } })).error, 'too_long');
  assert.equal((await call('POST', '/relations', { token: a, body: { to: 'cdoni', type: 'custom' } })).error, 'empty');
  assert.equal((await call('POST', '/relations', { token: a, body: { to: 'cdoni', type: 'custom', label: 'orang kepercayaan' } })).ok, true);
  assert.equal((await call('POST', '/relations/cina/accept', { token: b })).ok, true);
  const ma = await call('GET', '/me', { token: a }), mb = await call('GET', '/me', { token: b });
  assert.deepEqual(ma.user.labels.map((x) => x.name), ['orang kepercayaan']);
  assert.deepEqual(mb.user.labels.map((x) => x.name), ['orang kepercayaan']);
  const la = ma.user.labels[0].id, lb = mb.user.labels[0].id;
  assert.equal((await call('GET', '/me/relations', { token: b })).active[0].label, 'orang kepercayaan');
  // post hanya untuk nama hubungan itu; nama milik orang lain ditolak
  assert.equal((await call('POST', '/posts', { token: a, body: { text: 'bocoran', audios: 0, rand: ['L' + lb] } })).error, 'bad_request');
  const p = await call('POST', '/posts', { token: a, body: { text: 'rahasia kepercayaan', audios: 0, rand: ['L' + la] } });
  assert.ok(p.id);
  assert.equal((await call('GET', `/posts/${p.id}`, { token: b })).post.id, p.id);
  assert.equal((await call('GET', `/posts/${p.id}`, { token: c3 })).error, 'not_found');
  // filter memakai nama milik pemirsa sendiri (lb) -> post a muncul di Hups b, tidak di c3
  const fb = await call('GET', `/hups?f=L${lb}`, { token: b });
  assert.ok(fb.items.some((x) => x.id === p.id), JSON.stringify(fb).slice(0, 200));
  assert.ok(!(await call('GET', '/hups?f=public', { token: b })).items.some((x) => x.id === p.id));
  assert.equal((await call('GET', `/random?f=L${lb}`, { token: b })).audio.id, p.id);
  assert.equal((await call('GET', `/random?f=L${lb}`, { token: c3 })).audio, null);
  // profil a hanya untuk nama itu
  assert.equal((await call('PATCH', '/me/settings', { token: a, body: { pvis: 'L' + la } })).ok, true);
  assert.equal((await call('GET', '/users/cina', { token: b })).locked, false);
  assert.equal((await call('GET', '/users/cina', { token: c3 })).locked, true);
  // ganti nama di sisi b, hubungan tetap
  assert.equal((await call('POST', '/relations/cina/label', { token: b, body: { label: 'kakak asuh' } })).label, 'kakak asuh');
  assert.equal((await call('GET', '/me/relations', { token: b })).active[0].label, 'kakak asuh');
  assert.equal((await call('GET', '/me/relations', { token: a })).active[0].label, 'orang kepercayaan');
  // hapus nama: audiens dicabut jadi hanya pemilik, profil pulih tidak bocor
  assert.equal((await call('DELETE', `/me/labels/${la}`, { token: a })).ok, true);
  assert.equal((await call('GET', `/posts/${p.id}`, { token: b })).error, 'not_found');
  assert.equal((await call('GET', `/posts/${p.id}`, { token: a })).post.id, p.id);
  assert.equal((await call('GET', '/me', { token: a })).user.pvis, 'me');
});

test('pratinjau tautan: aman dan terurai', async () => {
  const { privateIp, parseMeta } = await import('../lib/preview.js');
  for (const ip of ['127.0.0.1', '10.0.0.5', '192.168.1.1', '172.16.0.1', '169.254.169.254', '::1', 'fd00::1', '::ffff:127.0.0.1', '0.0.0.0']) assert.equal(privateIp(ip), true, ip);
  for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700::1111']) assert.equal(privateIp(ip), false, ip);
  const m = parseMeta('<html><head><title>Fallback</title><meta property="og:title" content="Hulhup &amp; teman"><meta property="og:description" content="Dengar suara"><meta property="og:image" content="/img/a.png"><link rel="icon" href="/f.ico"></head></html>', 'https://contoh.id/x');
  assert.deepEqual([m.title, m.desc, m.image, m.icon, m.host], ['Hulhup & teman', 'Dengar suara', 'https://contoh.id/img/a.png', 'https://contoh.id/f.ico', 'contoh.id']);
  const { imgSrc, imgUrlOf } = await import('../lib/preview.js');
  const sp = new URL('http://x' + imgSrc('https://contoh.id/a.png'));
  assert.equal(imgUrlOf(sp.searchParams.get('u'), sp.searchParams.get('s')), 'https://contoh.id/a.png');
  assert.equal(imgUrlOf(sp.searchParams.get('u'), 'palsu'), null);
  assert.equal(imgUrlOf(Buffer.from('https://lain.id/b.png').toString('base64url'), sp.searchParams.get('s')), null);
  assert.equal((await call('GET', imgSrc('https://lain.id/b.png').replace(/s=.*/, 's=palsu'))).error, 'not_found');
  assert.equal((await call('GET', imgSrc('http://127.0.0.1/a.png'))).error, 'not_found');
  const a = await reg('prevu');
  assert.equal((await call('GET', '/preview?url=' + encodeURIComponent('http://x'))).error, 'unauthorized');
  assert.equal((await call('GET', '/preview?url=javascript:1', { token: a })).error, 'bad_url');
  assert.equal((await call('GET', '/preview?url=' + encodeURIComponent('http://127.0.0.1/'), { token: a })).preview, null);
  assert.equal((await call('GET', '/preview?url=' + encodeURIComponent('http://169.254.169.254/latest'), { token: a })).preview, null);
});

test('keamanan: SSRF alamat khusus, diagnostik internal, masukan aneh, tanpa kebocoran', async () => {
  const { privateIp } = await import('../lib/preview.js');
  for (const ip of ['127.0.0.1', '10.0.0.5', '169.254.169.254', '::1', '[::1]', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:a9fe:a9fe', 'fd00::1', 'fe80::1', '64:ff9b::7f00:1', '100.64.0.1', '192.168.1.1', '0.0.0.0', '224.0.0.1']) assert.equal(privateIp(ip), true, ip);
  for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) assert.equal(privateIp(ip), false, ip);
  // diagnostik hanya untuk pemegang CRON_SECRET
  delete process.env.CRON_SECRET;
  assert.equal((await call('GET', '/deks/selftest')).error, 'not_found');
  assert.equal((await call('GET', '/health?push=1')).push, undefined);
  process.env.CRON_SECRET = 'rahasia-uji-123';
  assert.equal((await call('GET', '/deks/selftest')).error, 'not_found');
  assert.equal((await call('GET', '/cron/reminder', {})).error, 'unauthorized');
  delete process.env.CRON_SECRET;
  // masukan tidak valid untuk tipe kolom -> 400, bukan 500
  const t = await reg('sectest');
  assert.equal((await call('POST', '/posts/1/comments', { token: t, body: { text: 'x', parent: 'abc' } })).ok, false);
  // login: akun tidak ada dan sandi salah memberi kode sama
  const x = await call('POST', '/login', { body: { username: 'tidakada', password: 'secret1' }, ip: '7.7.7.7' });
  const y = await call('POST', '/login', { body: { username: 'sectest', password: 'salah12' }, ip: '7.7.7.8' });
  assert.deepEqual([x.error, x.status], [y.error, y.status]);
  // /img tanpa tanda tangan ditolak
  assert.equal((await call('GET', '/img?u=aHR0cDovLzEyNy4wLjAuMS8&s=abc')).error, 'not_found');
});

test('phipop v2: tools hanya publik, tag khusus, relationship, chat async, kelola post', async () => {
  const { q } = await import('../lib/db.js'); let n = 0;
  globalThis.__phipopGen = async (h, t) => { n++; return t.includes('kasar') ? 'lu ngentot' : 'jawab ' + n; };
  const adm = await reg('admv2'); const a = await reg('uv2a'); const b = await reg('uv2b');
  await q(`update users set role='admin' where username='admv2'`);
  const ph = await q(`select id from users where username='phipop'`).then((r) => r.rows[0]);
  const T = await import('../lib/phtools.js'); const PHm = await import('../lib/phipop.js');
  // kode pendek bolak-balik
  for (const id of [1, 77, 123456]) assert.equal(T.decCode(T.encCode(id)), id);
  // relationship ke phipop: hanya qih
  await q(`insert into users(username, name, birth, pass_hash, pass_salt, verified, created) values ('qih','Qih','2000-01-01','x','x',true,1) on conflict do nothing`);
  const rr = await call('POST', '/relations', { token: a, body: { to: 'phipop', type: 'friend' } });
  assert.equal(rr.error, 'forbidden');
  // tools: hanya publik
  await q(`update users set pvis='public' where username in ('uv2a','uv2b')`);
  const pub = await call('POST', '/posts', { token: a, body: { text: 'kucing oren lucu banget', audios: 0 } });
  const prv = await call('POST', '/posts', { token: a, body: { text: 'rahasia kucing belang', audios: 0, rand: ['friend'] } });
  const sr = await T.searchHulhup({ q: 'kucing' });
  assert.equal(sr.hasil.length, 1); assert.match(sr.hasil[0].teks, /oren/); assert.doesNotMatch(JSON.stringify(sr), /rahasia/);
  assert.ok((await T.getPost(prv.id)).error); assert.ok((await T.getPost(T.postUrl(pub.id))).post);
  assert.equal((await T.getPost(prv.id, prv.id)).post.id, prv.id); // di thread tempat di-tag
  assert.equal((await T.getAccount('uv2a')).akun, '@uv2a');
  // filter keluaran: seks tidak lolos
  assert.doesNotMatch(PHm.sanitizeReply('lu ngentot'), /ngentot/); assert.doesNotMatch(PHm.sanitizeReply('dasar kafir'), /kafir/);
  assert.equal(PHm.sanitizeReply('anjir goblok banget lu'), 'anjir goblok banget lu'); // kasar biasa boleh
  // akses; ptag hanya untuk yang punya akses
  await call('POST', '/phipop/request', { token: a, body: { why: 'tes' } });
  const sent = await call('POST', '/phipop/admin/send', { token: adm, body: { username: 'uv2a' } });
  assert.ok((await call('POST', '/phipop/redeem', { token: a, body: { code: sent.code } })).has_access);
  const p1 = await call('POST', '/posts', { token: a, body: { text: 'woi @phipop', audios: 0 } });
  const p2 = await call('POST', '/posts', { token: b, body: { text: 'woi @phipop', audios: 0 } });
  const g = async (id, t) => (await call('GET', `/posts/${id}`, { token: t })).post;
  assert.equal((await g(p1.id, a)).ptag, true); assert.equal((await g(p2.id, b)).ptag, false);
  let cm; for (let i = 0; i < 30; i++) { cm = (await call('GET', `/posts/${p1.id}/comments`, { token: a })).items; if (cm.length && !cm[0].ph) break; await new Promise((r) => setTimeout(r, 100)); }
  assert.equal(cm[0].username, 'phipop'); assert.equal(cm[0].ph, '');
  assert.equal((await call('GET', `/posts/${p2.id}/comments`, { token: b })).items.length, 0); // tanpa akses: tidak dijawab
  // 10 komentar pertama di postingan Phipop dijawab otomatis: tanpa akses, tanpa tag
  const own = await call('POST', '/phipop/admin/post', { token: adm, body: { text: 'post otomatis phipop' } });
  const waitPh = async (n) => { let r; for (let i = 0; i < 40; i++) { r = (await call('GET', `/posts/${own.id}/comments`, { token: b })).items; if (r.filter((x) => x.username === 'phipop' && !x.ph).length >= n) break; await new Promise((z) => setTimeout(z, 100)); } return r; };
  for (let i = 0; i < 11; i++) await call('POST', `/posts/${own.id}/comments`, { token: b, body: { text: 'komen ' + i } });
  const rr2 = await waitPh(10); await new Promise((z) => setTimeout(z, 600));
  const fin = (await call('GET', `/posts/${own.id}/comments`, { token: b })).items;
  assert.equal(fin.filter((x) => x.username === 'phipop' && !x.ph).length, 10); // komentar ke-11 tidak dijawab
  assert.equal(fin.filter((x) => x.username === 'phipop').length, 10);
  await call('DELETE', `/phipop/admin/posts/${own.id}`, { token: adm });
  // tag di komentar
  const c1 = await call('POST', `/posts/${p1.id}/comments`, { token: a, body: { text: '@phipop lanjut' } });
  const c2 = await call('POST', `/posts/${p1.id}/comments`, { token: b, body: { text: '@phipop dong' } });
  const all = (await call('GET', `/posts/${p1.id}/comments`, { token: a })).items; const mine = all.find((x) => x.id === c1.id), his = all.find((x) => x.id === c2.id);
  assert.equal(mine.ptag, true); assert.equal(his.ptag, false);
  // saran tag: phipop disembunyikan untuk yang tanpa akses
  assert.equal((await call('GET', '/search?q=phipop&m=1', { token: b })).users.length, 0);
  assert.equal((await call('GET', '/search?q=phipop&m=1', { token: a })).users.length, 1);
  // chat async + polling
  const st = await call('POST', '/phipop/chat', { token: a, body: { text: 'halo', async: true } });
  assert.ok(st.id); let it; for (let i = 0; i < 30; i++) { it = (await call('GET', `/phipop/chat/${st.id}`, { token: a })).item; if (it.status !== 'run') break; await new Promise((r) => setTimeout(r, 100)); }
  assert.equal(it.status, 'done'); assert.match(it.text, /jawab/); assert.ok(Array.isArray(it.links));
  assert.ok((await call('GET', '/phipop/chat', { token: a })).items.length >= 2);
  // memori tersimpan
  assert.ok((await q(`select turns from phipop_mem where user_id=(select id from users where username='uv2a')`)).rows[0].turns >= 1);
  // kelola post phipop: hanya admin
  assert.equal((await call('GET', '/phipop/admin/posts', { token: a })).error, 'forbidden');
  const mk = await call('POST', '/phipop/admin/post', { token: adm, body: { text: 'post dari phipop' } });
  assert.ok(mk.id);
  assert.equal((await call('GET', '/phipop/admin/posts', { token: adm })).items[0].text, 'post dari phipop');
  assert.ok((await call('POST', `/phipop/admin/posts/${mk.id}/replace`, { token: adm, body: { text: 'diganti' } })).ok);
  assert.equal((await call('GET', '/phipop/admin/posts', { token: adm })).items[0].text, 'diganti');
  assert.ok((await call('DELETE', `/phipop/admin/posts/${mk.id}`, { token: adm })).ok);
  assert.equal((await call('GET', '/phipop/admin/posts', { token: adm })).items.length, 0);
  // post otomatis (cron): dipakai mesin; di tes memakai kait palsu
  process.env.CRON_SECRET = 'sekret';
  const cr = await handle(Object.assign(Readable.from([]), { method: 'GET', socket: {}, headers: { authorization: 'Bearer sekret' } }), new URL('/cron/phipop-post?slot=am', 'http://x'));
  assert.ok(cr.ok && (cr.id || cr.skipped));
  const cr2 = await handle(Object.assign(Readable.from([]), { method: 'GET', socket: {}, headers: { authorization: 'Bearer sekret' } }), new URL('/cron/phipop-post?slot=am', 'http://x'));
  assert.equal(cr2.skipped, true); // satu kali per slot per hari
  delete globalThis.__phipopGen;
});

test('voting, masa aktif, dan pin admin', async () => {
  const { q } = await import('../lib/db.js');
  const adm = await reg('admvt'); const a = await reg('vta'); const b = await reg('vtb');
  await q(`update users set role='admin' where username='admvt'`);
  // poll tidak valid
  assert.equal((await call('POST', '/posts', { token: a, body: { text: 'x', audios: 0, poll: { options: ['satu'] } } })).error, 'poll_bad');
  assert.equal((await call('POST', '/posts', { token: a, body: { text: 'x', audios: 0, poll: { options: ['a', 'A'] } } })).error, 'poll_dup');
  // poll maks 2, hasil disembunyikan sebelum memilih
  const p = await call('POST', '/posts', { token: a, body: { audios: 0, poll: { title: 'Makan apa?', options: ['nasi', 'mie', 'roti'], max: 2, show_first: false }, expires_in: 3600000 } });
  assert.ok(p.id);
  let v = (await call('GET', `/posts/${p.id}`, { token: b })).post;
  assert.equal(v.poll.title, 'Makan apa?'); assert.equal(v.poll.reveal, false); assert.equal(v.poll.options[0].votes, null); assert.ok(v.expires_at > 0);
  const ids = v.poll.options.map((o) => o.id);
  assert.equal((await call('POST', `/posts/${p.id}/vote`, { token: b, body: { options: ids } })).error, 'poll_max');
  const r1 = await call('POST', `/posts/${p.id}/vote`, { token: b, body: { options: [ids[0], ids[2]] } });
  assert.equal(r1.poll.reveal, true); assert.equal(r1.poll.total, 1); assert.deepEqual(r1.poll.options.map((o) => o.votes), [1, 0, 1]);
  const r2 = await call('POST', `/posts/${p.id}/vote`, { token: b, body: { options: [ids[1]] } }); // ganti pilihan
  assert.deepEqual(r2.poll.options.map((o) => o.votes), [0, 1, 0]);
  // voting dengan waktu selesai: setelah selesai hasil terbuka & tidak bisa memilih
  const p2 = await call('POST', '/posts', { token: a, body: { audios: 0, poll: { options: ['x', 'y'], show_first: false, ends_in: 3600000 } } });
  await q('update polls set ends_at=$2 where post_id=$1', [p2.id, Date.now() - 1000]);
  const v2 = (await call('GET', `/posts/${p2.id}`, { token: b })).post;
  assert.equal(v2.poll.ended, true); assert.equal(v2.poll.reveal, true); assert.equal(v2.poll.options[0].votes, 0);
  assert.equal((await call('POST', `/posts/${p2.id}/vote`, { token: b, body: { options: [v2.poll.options[0].id] } })).error, 'poll_ended');
  // pin: hanya admin, hanya publik
  assert.equal((await call('POST', '/admin/pin', { token: a, body: { audio: p.id, minutes: 60 } })).status, 403);
  assert.ok((await call('POST', '/admin/pin', { token: adm, body: { audio: p.id, minutes: 60 } })).pinned);
  const h = await call('GET', '/hups?f=public', { token: b });
  assert.equal(h.pins[0].id, p.id); assert.ok(h.pins[0].pinned); assert.ok(!h.items.some((x) => x.id === p.id));
  assert.ok((await call('POST', '/admin/pin', { token: adm, body: { audio: p.id, unpin: true } })).ok);
  assert.equal((await call('GET', '/hups?f=public', { token: b })).pins.length, 0);
  // habis waktu: peringatan lalu hapus permanen
  await q('update audios set expires_at=$2, created=$3 where id=$1', [p.id, Date.now() + 5000, Date.now() - 3600000]);
  const { sweep } = await import('../lib/app.js');
  assert.equal((await call('GET', '/cron/sweep')).warned, 1);
  await q('update audios set expires_at=$2 where id=$1', [p.id, Date.now() - 1]);
  assert.equal((await call('GET', '/cron/sweep')).removed, 1);
  assert.equal((await call('GET', `/posts/${p.id}`, { token: b })).error, 'not_found');
  const ns = (await call('GET', '/notifications', { token: a })).items.map((n) => n.type);
  assert.ok(ns.includes('expired'));
});
