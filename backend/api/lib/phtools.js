// Alat (tools) Phipop. Semua dijalankan di server Hulhup sendiri: pencarian memakai database Hulhup langsung
// (hanya data PUBLIK yang bisa dilihat user publik), sehingga ke mesin bahasa hanya terkirim cuplikan yang relevan untuk satu jawaban.
import https from 'node:https';
import http from 'node:http';
import net from 'node:net';
import { one, many } from './db.js';
import { privateIp, safeLookup, get, ent, preview, parseMeta } from './preview.js';
import { getAudio } from './blobs.js';

// ---------- kode pendek post (/p/<kode>), salinan dari web/lib/code.ts ----------
const A62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const KS = [0x2f4a7c, 0x91b3d5, 0x5e08a1, 0xc7392e], M18 = 0x3ffff;
const FF = (x, k) => { let h = (Math.imul(x ^ k, 0x9e3779b1) >>> 0); h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b) >>> 0; h ^= h >>> 13; return h & M18; };
export function decCode(code) {
  if (!/^[0-9a-zA-Z]{7}$/.test(code)) return null;
  let n = 0; for (const ch of code) n = n * 62 + A62.indexOf(ch);
  if (n >= (M18 + 1) * (M18 + 1)) return null;
  let l = Math.floor(n / (M18 + 1)), r = n % (M18 + 1);
  for (const k of [...KS].reverse()) { const t = r ^ FF(l, k); r = l; l = t; }
  return l * (M18 + 1) + r;
}
export function encCode(id) {
  let l = Math.floor(id / (M18 + 1)) & M18, r = id % (M18 + 1);
  for (const k of KS) { const nl = r, nr = l ^ FF(r, k); l = nl; r = nr; }
  let n = l * (M18 + 1) + r, out = '';
  for (let i = 0; i < 7; i++) { out = A62[n % 62] + out; n = Math.floor(n / 62); }
  return out;
}
export const postUrl = (id) => `https://hulhup.my.id/p/${encCode(Number(id))}`;

// ---------- util ----------
export const clip = (t, n) => { const x = String(t || '').replace(/\s+/g, ' ').trim(); return x.length > n ? x.slice(0, n) + '…' : x; };
const like = (s) => '%' + String(s).toLowerCase().replace(/[\\%_]/g, (m) => '\\' + m) + '%';
export const isPub = (rand) => String(rand || 'public').split(',').includes('public');
const day = (ms) => new Date(Number(ms)).toISOString().slice(0, 10);
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const PUB = `a.ai_view and a.rand ~ '(^|,)public(,|$)' and not a.hidden and not a.pending and u.status='active' and u.pvis='public'`;

/** Isi lengkap sebuah post (teks panjang tersimpan di penyimpanan terpisah). */
export async function bodyOf(row) {
  if (row.body !== null && row.body !== undefined && row.body !== '') return row.body;
  if (!row.body_key) return row.descr || '';
  try { const b = await getAudio('mongo', row.body_key); return b ? b.toString('utf8') : row.descr || ''; } catch { return row.descr || ''; }
}

/** Ambil id post dari angka, kode 7 huruf, atau URL Hulhup. */
export function refToId(ref) {
  const s = String(ref ?? '').trim();
  if (/^\d{1,10}$/.test(s)) return Number(s);
  const m = s.match(/\/p\/([0-9A-Za-z]{7})(?![0-9A-Za-z])/) || s.match(/^([0-9A-Za-z]{7})$/);
  if (m) return decCode(m[1]);
  const n = s.match(/\/p\/(\d{1,10})(?!\d)/); return n ? Number(n[1]) : null;
}

const POSTQ = `select a.id, a.descr, a.body, a.body_key, a.rand, a.created, a.likes, a.comments, a.media, a.n_audio, a.secs, a.hidden, a.pending, a.ai_view, u.username, u.name, u.status, u.pvis from audios a join users u on u.id=a.owner`;
const card = async (r, full = false) => ({
  id: Number(r.id), url: postUrl(r.id), oleh: `@${r.username}`, tanggal: day(r.created), sorot: r.likes, komentar: r.comments,
  teks: clip(full ? await bodyOf(r) : r.descr, full ? 1800 : 240), ...(Number(r.n_audio) > 0 ? { ada_audio: true } : {}), ...((r.media || []).length ? { media: (r.media || []).slice(0, 6) } : {}),
});

// ---------- tools Hulhup ----------
export async function searchHulhup({ q = '', kind = 'post', sort = 'baru' } = {}) {
  const terms = String(q).toLowerCase().split(/\s+/).map((x) => x.replace(/^@/, '')).filter((x) => x.length > 1).slice(0, 4);
  if (kind === 'akun') {
    if (!terms.length) return { hasil: [] };
    const where = terms.map((_, i) => `(lower(username) like $${i + 1} or lower(name) like $${i + 1} or lower(bio) like $${i + 1})`).join(' and ');
    const rows = await many(`select username, name, bio from users where status='active' and pvis='public' and ${where} order by (lower(username)=$${terms.length + 1}) desc, id asc limit 8`, [...terms.map(like), terms[0]]);
    return { hasil: rows.map((u) => ({ akun: `@${u.username}`, nama: u.name, bio: clip(u.bio, 140) })) };
  }
  const where = terms.map((_, i) => `(lower(a.descr) like $${i + 1} or lower(coalesce(a.body,'')) like $${i + 1} or lower(u.username) like $${i + 1} or lower(u.name) like $${i + 1})`).join(' and ');
  const order = sort === 'top' ? 'a.likes desc, a.comments desc, a.id desc' : 'a.id desc';
  const rows = await many(`${POSTQ} where ${PUB}${where ? ' and ' + where : ''} ${sort === 'top' && !terms.length ? `and a.created > ${Date.now() - 7 * 86400e3}` : ''} order by ${order} limit 8`, terms.map(like));
  return { hasil: await Promise.all(rows.map((r) => card(r))) };
}

/** Pantau Hulhup (hanya baca, hanya yang publik): peringkat akun, post ramai, komentar terbaru, akun baru. */
export async function pantau(jenis) {
  const j = String(jenis || '');
  if (j === 'pengikut_terbanyak') {
    const rows = await many(`select u.username, u.name, count(f.src)::int n from users u left join follows f on f.dst=u.id where u.status='active' and u.pvis='public' group by u.id order by n desc, u.id asc limit 8`);
    return { hasil: rows.map((r) => ({ akun: `@${r.username}`, nama: r.name, pengikut: r.n })) };
  }
  if (j === 'akun_baru') {
    const rows = await many(`select username, name, bio from users where status='active' and pvis='public' order by id desc limit 8`);
    return { hasil: rows.map((r) => ({ akun: `@${r.username}`, nama: r.name, bio: clip(r.bio, 100) })) };
  }
  if (j === 'komentar_baru') {
    const since = Date.now() - 36 * 3600e3;
    const rows = await many(`select c.body, c.post_id, cu.username cuser, pu.username puser from comments c join audios a on a.id=c.post_id join users cu on cu.id=c.owner join users pu on pu.id=a.owner where a.rand ~ '(^|,)public(,|$)' and not a.hidden and not a.pending and pu.status='active' and pu.pvis='public' and cu.status='active' and cu.pvis='public' and not c.pending and c.ph_state='' and c.created > $1 order by c.id desc limit 18`, [since]);
    return { hasil: rows.map((r) => ({ oleh: `@${r.cuser}`, di_post_milik: `@${r.puser}`, url: postUrl(r.post_id), komentar: clip(r.body, 200) })) };
  }
  const rows = await many(`${POSTQ} where ${PUB} and a.created > ${Date.now() - 3 * 86400e3} order by (a.likes + a.comments * 2) desc, a.id desc limit 8`);
  return { hasil: await Promise.all(rows.map((r) => card(r))) };
}

export async function getPost(ref, allowId = 0) {
  const id = refToId(ref); if (!id) return { error: 'referensi post tidak valid' };
  const r = await one(`${POSTQ} where a.id=$1`, [id]);
  const ok = r && !r.hidden && !r.pending && r.status === 'active' && ((isPub(r.rand) && r.pvis === 'public' && r.ai_view) || Number(r.id) === Number(allowId));
  if (!ok) return { error: 'post privat atau tidak ada: kamu tidak boleh membaca atau membahasnya' };
  const cm = await many(`select c.body, u.username from comments c join users u on u.id=c.owner where c.post_id=$1 and not c.pending and c.ph_state='' and u.status='active' order by c.id asc limit 12`, [id]);
  return { post: await card(r, true), komentar: cm.map((c) => `@${c.username}: ${clip(c.body, 160)}`) };
}

export async function getAccount(username) {
  const un = String(username || '').toLowerCase().replace(/^@/, '').replace(/[^a-z0-9_]/g, '').slice(0, 20);
  const u = await one(`select id, username, name, bio, pvis, status, verified, badge from users where username=$1`, [un]);
  if (!u || u.status !== 'active') return { error: 'akun tidak ada' };
  if (u.pvis !== 'public') return { error: 'akun privat: kamu tidak boleh membahas isinya' };
  const fo = await one(`select (select count(*)::int from follows where dst=$1) pengikut, (select count(*)::int from follows where src=$1) mengikuti`, [u.id]).catch(() => null);
  const rows = await many(`${POSTQ} where ${PUB} and a.owner=$1 order by a.id desc limit 6`, [u.id]);
  return { akun: `@${u.username}`, nama: u.name, bio: clip(u.bio, 240), centang: u.badge ? { warna: { purple: 'ungu', blue: 'biru', orange: 'oranye' }[u.badge] || u.badge } : !!u.verified, ...(fo || {}), post_publik_terbaru: await Promise.all(rows.map((r) => card(r))) };
}

// ---------- tools web ----------
const UA = 'Mozilla/5.0 (compatible; HulhupBot/1.0; +https://hulhup.my.id)';
async function ddg(qs) {
  const r = await fetch('https://html.duckduckgo.com/html/', { method: 'POST', signal: AbortSignal.timeout(6500), headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' }, body: `q=${encodeURIComponent(qs)}&kl=id-id` });
  if (!r.ok) throw new Error('ddg ' + r.status);
  const html = await r.text(); const out = [];
  for (const m of html.matchAll(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:class="result__snippet"[^>]*>([\s\S]*?)<\/a>)?/g)) {
    let u = ent(m[1]); const g = u.match(/[?&]uddg=([^&]+)/); if (g) u = decodeURIComponent(g[1]); if (u.startsWith('//')) u = 'https:' + u;
    if (!/^https?:\/\//.test(u) || /duckduckgo\.com/.test(u)) continue;
    out.push({ judul: clip(ent(m[2].replace(/<[^>]+>/g, '')), 120), url: u, ringkas: clip(ent((m[3] || '').replace(/<[^>]+>/g, '')), 220) });
    if (out.length >= 6) break;
  }
  if (!out.length) throw new Error('ddg kosong');
  return out;
}

/** Cadangan: pencarian berdasar Google lewat mesin bahasa (hanya kata kunci pencarian yang dikirim). */
async function groundedSearch(qs, gen) {
  const j = await gen({ contents: [{ role: 'user', parts: [{ text: `Cari di web: ${qs}\nJawab ringkas (maks 8 kalimat), fakta saja, bahasa Indonesia.` }] }], tools: [{ googleSearch: {} }], generationConfig: { maxOutputTokens: 600, temperature: 0.2 } });
  const c = j?.candidates?.[0]; const text = (c?.content?.parts || []).map((p) => p.text || '').join('').trim();
  const chunks = (c?.groundingMetadata?.groundingChunks || []).map((g) => g.web).filter(Boolean).slice(0, 5);
  const out = [];
  for (const w of chunks) {
    let u = w.uri; try { const r = await fetch(u, { redirect: 'follow', signal: AbortSignal.timeout(3500), headers: { 'user-agent': UA } }); u = r.url || u; r.body?.cancel?.(); } catch {}
    out.push({ judul: clip(w.title || host(u), 120), url: u, ringkas: '' });
  }
  return { ringkasan: text, out };
}

export async function searchWeb(qs, gen) {
  const q = String(qs || '').trim().slice(0, 200); if (!q) return { error: 'kata kunci kosong' };
  try { return { hasil: await ddg(q) }; } catch {}
  try { const g = await groundedSearch(q, gen); return { ringkasan_web: g.ringkasan, hasil: g.out }; } catch { return { error: 'pencarian web gagal' }; }
}

const safeUrl = (raw) => { try { const u = new URL(String(raw).trim()); return /^https?:$/.test(u.protocol) && !u.username && !u.password ? u : null; } catch { return null; } };

export async function openUrl(raw) {
  const u = safeUrl(raw); if (!u) return { error: 'url tidak valid' };
  if ((u.hostname === 'hulhup.my.id' || u.hostname === 'www.hulhup.my.id') && /^\/p\//.test(u.pathname)) return { error: 'ini post Hulhup, pakai get_post' };
  let cur = u.toString();
  try {
    for (let i = 0; i < 4; i++) {
      const r = await get(cur, UA);
      if (r.redirect) { cur = r.redirect; continue; }
      if (r.media) return { url: r.url, jenis: r.media, catatan: 'ini berkas media, pakai view_media' };
      const m = parseMeta(r.body, r.url);
      const text = ent(String(r.body).replace(/<(script|style|noscript|svg|head|nav|footer)[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' '));
      return { url: r.url, judul: clip(m.title, 160), deskripsi: clip(m.desc, 300), isi: clip(text, 3500) };
    }
  } catch (e) { return { error: 'gagal membuka: ' + String(e.message || e).slice(0, 60) }; }
  return { error: 'terlalu banyak pengalihan' };
}

// ---------- melihat/mendengar media ----------
function fetchBin(url, max, hops = 0) {
  return new Promise((resolve, reject) => {
    const u = safeUrl(url); if (!u) return reject(new Error('bad_url'));
    if (u.port && u.port !== '80' && u.port !== '443') return reject(new Error('bad_port'));
    if (net.isIP(u.hostname.replace(/^\[|\]$/g, '')) && privateIp(u.hostname)) return reject(new Error('blocked'));
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(u, { method: 'GET', lookup: safeLookup, timeout: 9000, headers: { 'user-agent': UA, accept: 'image/*,audio/*,video/*,*/*;q=0.5' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { res.resume(); if (hops >= 3) return reject(new Error('redirects')); return resolve(fetchBin(new URL(res.headers.location, u).toString(), max, hops + 1)); }
      const type = String(res.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('http ' + res.statusCode)); }
      if (!/^(image|audio|video)\//.test(type)) { res.resume(); return resolve({ html: true, url: u.toString(), type }); }
      const parts = []; let n = 0;
      res.on('data', (d) => { n += d.length; if (n > max) { res.destroy(); reject(new Error('too_big')); } else parts.push(d); });
      res.on('end', () => resolve({ buf: Buffer.concat(parts), mime: type, url: u.toString() }));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject); req.end();
  });
}
const MAXB = { image: 6 * 1024 * 1024, audio: 9 * 1024 * 1024, video: 14 * 1024 * 1024 };

/** Kembalikan { info, parts } — parts = inlineData yang dilampirkan ke mesin agar bisa dilihat/didengar. */
export async function viewMedia(ref, allowId = 0) {
  const s = String(ref || '').trim();
  const pid = /hulhup\.my\.id\/p\/|^\d{1,10}$|^[0-9A-Za-z]{7}$/.test(s) && !/^https?:\/\/(?!(www\.)?hulhup\.my\.id)/i.test(s) ? refToId(s) : null;
  if (pid) {
    const r = await one(`select a.id, a.rand, a.ai_view, a.hidden, a.pending, a.store, a.blob_key, a.mime, a.secs, u.status, u.pvis from audios a join users u on u.id=a.owner where a.id=$1`, [pid]);
    const ok = r && !r.hidden && !r.pending && r.status === 'active' && ((isPub(r.rand) && r.pvis === 'public' && r.ai_view) || Number(r.id) === Number(allowId));
    if (!ok) return { info: { error: 'post privat atau tidak ada' }, parts: [] };
    const files = [];
    if (r.store && r.blob_key) files.push({ store: r.store, key: r.blob_key, mime: r.mime });
    for (const f of await many('select store, blob_key, mime from post_audios where post_id=$1 order by idx limit 3', [pid])) files.push({ store: f.store, key: f.blob_key, mime: f.mime });
    const parts = []; let total = 0;
    for (const f of files.slice(0, 2)) {
      try { const b = await getAudio(f.store, f.key); if (b && total + b.length < 8 * 1024 * 1024) { total += b.length; parts.push({ mimeType: f.mime || 'audio/mp4', data: b.toString('base64') }); } } catch {}
    }
    return parts.length ? { info: { ok: true, catatan: `${parts.length} audio dari post dilampirkan, dengarkan` }, parts } : { info: { error: 'post ini tidak punya audio' }, parts: [] };
  }
  const u = safeUrl(s); if (!u) return { info: { error: 'url tidak valid' }, parts: [] };
  if (/(^|\.)(youtube\.com|youtu\.be)$/i.test(u.hostname) && /watch|shorts|live|^\/[\w-]{11}$/.test(u.pathname + u.search)) {
    return { info: { ok: true, catatan: 'video YouTube dilampirkan, tonton' }, parts: [{ mimeType: 'video/mp4', fileUri: u.toString() }] };
  }
  try {
    let r = await fetchBin(u.toString(), 14 * 1024 * 1024);
    let note = '';
    if (r.html) { // halaman biasa (mis. reel Instagram): coba videonya dulu, lalu gambar pratinjau
      const pv = await preview(u.toString()); const cands = [pv?.video, pv?.image].filter(Boolean);
      if (!cands.length) return { info: { error: 'tidak ada media yang bisa diambil dari halaman itu', caption: pv?.title || pv?.description || undefined }, parts: [] };
      let got = null;
      for (const c of cands) {
        try { const x = await fetchBin(c.startsWith('/') ? new URL(c, 'https://hulhup.my.id').toString() : c, 14 * 1024 * 1024); if (!x.html && x.buf.length <= (MAXB[x.mime.split('/')[0]] || 0)) { got = x; break; } } catch {}
      }
      if (!got) return { info: { error: 'video/gambar di halaman itu tidak bisa diunduh (mungkin diproteksi situsnya)', caption: [pv?.title, pv?.description].filter(Boolean).join(' - ').slice(0, 400) || undefined, catatan: 'jujur bilang ke pengguna kamu cuma bisa baca keterangannya, bukan nonton videonya' }, parts: [] };
      r = got; if (r.mime.startsWith('image/')) note = ' (hanya gambar pratinjau, video tidak bisa diunduh; bilang jujur)';
    }
    const kind = r.mime.split('/')[0];
    if (r.buf.length > MAXB[kind]) return { info: { error: 'media terlalu besar' }, parts: [] };
    return { info: { ok: true, jenis: r.mime, catatan: 'media dilampirkan, lihat/dengarkan' + note }, parts: [{ mimeType: r.mime, data: r.buf.toString('base64') }] };
  } catch (e) { return { info: { error: 'gagal mengambil media: ' + String(e.message || e).slice(0, 50) }, parts: [] }; }
}

/** Foto profil sebuah akun publik (atau milik penanya sendiri / akun resmi). */
export async function viewAvatar(username, askerId = 0) {
  const un = String(username || '').toLowerCase().replace(/^@/, '').replace(/[^a-z0-9_]/g, '').slice(0, 20);
  const u = await one(`select id, username, pvis, status, av_ver from users where username=$1`, [un]);
  if (!u || u.status !== 'active') return { info: { error: 'akun tidak ada' }, parts: [] };
  const official = ['phipop', 'misyi', 'hulhup'].includes(u.username);
  if (u.pvis !== 'public' && !official && Number(u.id) !== Number(askerId)) return { info: { error: 'akun privat: kamu tidak boleh melihat isinya' }, parts: [] };
  const r = await one(`select mime, data from photos where user_id=$1 and kind='avatar'`, [u.id]);
  if (!r || !(Number(u.av_ver) > 0)) return { info: { ok: true, catatan: `@${u.username} belum punya foto profil` }, parts: [] };
  return { info: { ok: true, catatan: `foto profil @${u.username} dilampirkan, lihat` }, parts: [{ mimeType: r.mime || 'image/png', data: Buffer.from(r.data).toString('base64') }] };
}

export const TOOL_DECLS = [
  { name: 'search_hulhup', description: 'Cari post atau akun di Hulhup (hanya yang publik). Pakai kalau pengguna minta cari/lihat post, akun, atau topik di Hulhup, atau butuh contoh/bahan dari Hulhup. sort=top untuk yang paling banyak disorot minggu ini.',
    parameters: { type: 'OBJECT', properties: { q: { type: 'STRING', description: 'kata kunci (boleh kosong untuk terbaru/top)' }, kind: { type: 'STRING', enum: ['post', 'akun'] }, sort: { type: 'STRING', enum: ['baru', 'top'] } } } },
  { name: 'pantau_hulhup', description: 'Akses baca-saja ke data publik Hulhup. jenis: pengikut_terbanyak (akun dengan pengikut terbanyak), post_ramai (post publik paling ramai 3 hari terakhir), komentar_baru (komentar publik 36 jam terakhir, termasuk yang lagi ribut), akun_baru. Pakai untuk pertanyaan peringkat/statistik/lagi viral apa di Hulhup.',
    parameters: { type: 'OBJECT', properties: { jenis: { type: 'STRING', enum: ['pengikut_terbanyak', 'post_ramai', 'komentar_baru', 'akun_baru'] } }, required: ['jenis'] } },
  { name: 'get_post', description: 'Baca satu post Hulhup lengkap beserta komentarnya. ref = id, kode 7 huruf, atau URL hulhup.my.id/p/...', parameters: { type: 'OBJECT', properties: { ref: { type: 'STRING' } }, required: ['ref'] } },
  { name: 'get_account', description: 'Lihat profil akun Hulhup publik dan post publik terbarunya.', parameters: { type: 'OBJECT', properties: { username: { type: 'STRING' } }, required: ['username'] } },
  { name: 'view_avatar', description: 'Lihat foto profil (avatar) sebuah akun Hulhup: akun publik mana pun, penanya sendiri, atau kamu sendiri (username phipop).', parameters: { type: 'OBJECT', properties: { username: { type: 'STRING' } }, required: ['username'] } },
  { name: 'search_web', description: 'Cari informasi di internet lewat peramban Hulhup. Pakai untuk hal terbaru, fakta, berita, atau yang tidak kamu tahu pasti.', parameters: { type: 'OBJECT', properties: { q: { type: 'STRING' } }, required: ['q'] } },
  { name: 'open_url', description: 'Buka dan baca isi halaman web dari sebuah URL (artikel, situs).', parameters: { type: 'OBJECT', properties: { url: { type: 'STRING' } }, required: ['url'] } },
  { name: 'view_media', description: 'Lihat gambar, tonton video (termasuk YouTube, reel/halaman yang punya video), atau dengarkan audio dari URL; atau dengarkan audio dari post Hulhup (ref post). Untuk video dalam post Hulhup, ambil URL-nya dari teks post lalu panggil ini.', parameters: { type: 'OBJECT', properties: { url: { type: 'STRING', description: 'URL media/halaman, atau id/kode/URL post Hulhup' } }, required: ['url'] } },
];
