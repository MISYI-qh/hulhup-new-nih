// Hulhup API: akun, audio acak dengan filter ketat, hubungan dua pihak, notifikasi.
// Semua izin ditegakkan di sini. Tidak ada endpoint admin: moderasi hanya lewat database.
import { preview, imgUrlOf, fetchImage } from './preview.js';
import { q, one, many, tx } from './db.js';
import { ApiErr, now, sha, token, hashPw, checkPw, dayStr, okBirth, ageOf, imageMime, audioMime, readBody } from './util.js';
import { storeFor, putAudio, getAudio, delAudio } from './blobs.js';
import { randomInt, timingSafeEqual, createHash } from 'node:crypto';
import * as PH from './phipop.js';
import { OFFICIAL_IMG } from './official_assets.js';
import { pushLater, pushDiag, pushReminders } from './push.js';
import { deksImage, deksAudio, brief } from './deks/index.js';
import { runSelfTest } from './deks/selftest.js';

const MAX_IMG = 3 * 1024 * 1024, MAX_AUDIO = 1024 * 1024; // semua audio maks 1 MB; foto profil maks 3 MB
const MAX_PACK = 4 * 1024 * 1024 + 200 * 1024; // paket foto profil + berkas asli untuk Deks (batas badan Vercel 4,5 MB)

/** Paket foto profil dari klien: 'DKS1' + jenis(1) + panjang(4) + berkas asli/sidecar untuk Deks + foto yang disimpan. Tanpa 'DKS1' = foto biasa. */
function unpack(body) {
  if (body.length > 9 && body.toString('latin1', 0, 4) === 'DKS1') {
    const n = body.readUInt32BE(5);
    if (n > body.length - 9) throw new ApiErr('bad_file');
    return { meta: body.subarray(9, 9 + n), img: body.subarray(9 + n) };
  }
  return { meta: null, img: body };
}
const logDeks = (who, rep) => { try { console.log('deks', who, brief(rep)); } catch { /* */ } };
const MAX_TEXT = 200000, MAX_POST_TEXT = 200000, INLINE_TEXT = 3000, PREVIEW = 300; // post: 1 audio wajib + teks maks 1000; komentar: teks saja, panjang bebas
const FILTERS = ['public', 'followers', 'following', 'both', 'friend', 'best', 'partner', 'family', 'relations', 'me'];
const REL_TYPES = ['friend', 'best', 'partner', 'family', 'custom'];
const LBL = /^L(\d+)$/; // audiens hubungan custom: L<id nama hubungan milik pemilik>
const MAX_LABEL = 100, MAX_LABELS = 30;
const UN = /^[a-z0-9_]{3,20}$/;
const SESSION_MS = 90 * 24 * 3600 * 1000;

// ---------- pembatasan laju ----------
async function hit(key, limit, windowSec) {
  const win = Math.floor(now() / 1000 / windowSec);
  const r = await one(
    `insert into rate_hits(k, win, n) values ($1, $2, 1) on conflict (k, win) do update set n = rate_hits.n + 1 returning n`,
    [key, win]);
  if (r.n > limit) throw new ApiErr('rate_limited', 429);
  if (Math.random() < 0.01) q('delete from rate_hits where win < $1', [Math.floor(now() / 1000 / 60) - 1440]).catch(() => {});
}

// ---------- audiens ----------
const FOLLOW = (a, b) => `exists(select 1 from follows x where x.src=${a} and x.dst=${b})`;
const REL = (a, b, type) => `exists(select 1 from rels r where r.status='active' ${type ? `and r.type='${type}'` : ''} and ((r.a=${a} and r.b=${b}) or (r.a=${b} and r.b=${a})))`;

/** Daftar audiens (boleh banyak, dipisah koma). Kosong/tidak valid -> null. 'public' mengalahkan yang lain; 'me' berdiri sendiri. */
function parseAud(x, allowMe = false, allowAccounts = false, collapse = true) {
  const raw = Array.isArray(x) ? x : String(x ?? '').split(',');
  const ok = new Set(FILTERS.filter((e) => allowMe || e !== 'me').concat(allowAccounts ? ['accounts'] : []));
  const out = [...new Set(raw.map((e) => String(e).trim()).filter((e) => ok.has(e) || LBL.test(e)))].slice(0, 40);
  if (!out.length) return null;
  if (!collapse) return out.join(',');
  if (out.includes('public')) return 'public';
  if (allowMe && out.includes('me')) return 'me';
  return out.join(',');
}
const audList = (s) => String(s || 'public').split(',').filter(Boolean);
const HAS = (k) => `'${k}'=any(string_to_array(a.rand,','))`;

/** Syarat SQL audiens untuk satu filter. Alias audio = a, pemirsa = $1. Audiens post boleh banyak: cukup satu yang cocok. */
function audCond1(f) {
  switch (f) {
    case 'public': return HAS('public');
    case 'followers': return `${HAS('followers')} and ${FOLLOW('$1', 'a.owner')}`;
    case 'following': return `${HAS('following')} and ${FOLLOW('a.owner', '$1')}`;
    case 'both': return `${HAS('both')} and (${FOLLOW('$1', 'a.owner')} or ${FOLLOW('a.owner', '$1')})`;
    case 'friend': case 'best': case 'partner': case 'family': return `${HAS(f)} and ${REL('$1', 'a.owner', f)}`;
    case 'relations': return `${HAS('relations')} and ${REL('$1', 'a.owner')}`;
    case 'me': return `${HAS('accounts')} and exists(select 1 from audio_to t where t.audio_id=a.id and t.user_id=$1)`;
    default: {
      const m = LBL.exec(f);
      // L<id>: nama hubungan milik pemirsa sendiri; tampilkan post dari akun yang pemirsa beri nama itu, selama post terbuka untuknya lewat hubungan.
      if (m) return `exists(select 1 from rels r where r.status='active' and ((r.a=$1 and r.b=a.owner and r.la=${m[1]}) or (r.b=$1 and r.a=a.owner and r.lb=${m[1]})) and ('relations'=any(string_to_array(a.rand,',')) or r.type=any(string_to_array(a.rand,',')) or ('L'||(case when r.a=a.owner then r.la else r.lb end))=any(string_to_array(a.rand,','))))`;
      // lbl: pemirsa masuk audiens hubungan custom milik pemilik post (dipakai untuk "semua yang boleh dilihat").
      if (f === 'lbl') return `exists(select 1 from rels r where r.status='active' and ((r.a=$1 and r.b=a.owner) or (r.b=$1 and r.a=a.owner)) and ('L'||(case when r.a=a.owner then r.la else r.lb end))=any(string_to_array(a.rand,',')))`;
      return 'false';
    }
  }
}
/** Filter boleh lebih dari satu: "public,followers" = salah satu. */
function audCond(f) { return '(' + audList(f).map(audCond1).join(' or ') + ')'; }
/** Filter dari query: daftar valid, kalau kosong 'public'. */
const filterOf = (x) => parseAud(x, true, false, false) ?? 'public';

/** Apakah pemirsa boleh melihat sesuatu berdasarkan audiens pemilik (boleh banyak; untuk profil/hubungan). */
async function canSee(mode, ownerId, viewerId, self = true) {
  const modes = audList(mode);
  if (modes.includes('public')) return true;
  viewerId = Number(viewerId) || 0; ownerId = Number(ownerId);
  if (!viewerId) return false;
  if (viewerId === ownerId) return self;
  const relMode = modes.filter((e) => ['friend', 'best', 'partner', 'family', 'custom', 'relations'].includes(e));
  const lbls = modes.filter((e) => LBL.test(e));
  if (relMode.length || lbls.length) {
    const r = await one(`select a, type, la, lb from rels where status='active' and ((a=$1 and b=$2) or (a=$2 and b=$1))`, [viewerId, ownerId]);
    if (r && (relMode.includes('relations') || relMode.includes(r.type))) return true;
    if (r) { const ol = Number(r.a) === ownerId ? r.la : r.lb; if (ol && lbls.includes('L' + ol)) return true; }
  }
  if (modes.some((e) => ['followers', 'following', 'both'].includes(e))) {
    const r = await one(`select ${FOLLOW('$1', '$2')} as fol, ${FOLLOW('$2', '$1')} as ing`, [viewerId, ownerId]);
    if (modes.includes('followers') && r.fol) return true;
    if (modes.includes('following') && r.ing) return true;
    if (modes.includes('both') && (r.fol || r.ing)) return true;
  }
  return false;
}

// ---------- nama hubungan custom ----------
function cleanLabel(x) {
  const t = String(x ?? '').replace(/\s+/g, ' ').trim();
  if ([...t].length > MAX_LABEL) throw new ApiErr('too_long', 413);
  return t;
}
/** Semua token L<id> pada daftar audiens harus nama hubungan milik pengguna itu sendiri. */
async function ownLabels(uid, rand) {
  const ids = [...new Set(audList(rand).map((e) => LBL.exec(e)).filter(Boolean).map((m) => Number(m[1])))];
  if (!ids.length) return;
  const r = await many('select id from rel_labels where owner=$1 and id = any($2::bigint[])', [uid, ids]);
  if (r.length !== ids.length) throw new ApiErr('bad_request');
}
/** Cari atau buat nama hubungan milik pengguna (di dalam transaksi). */
async function labelId(t, uid, name) {
  let r = (await t.query('select id from rel_labels where owner=$1 and lower(name)=lower($2)', [uid, name])).rows[0];
  if (!r) {
    if (Number((await t.query('select count(*)::int n from rel_labels where owner=$1', [uid])).rows[0].n) >= MAX_LABELS) throw new ApiErr('bad_request');
    r = (await t.query('insert into rel_labels(owner, name, created) values ($1,$2,$3) returning id', [uid, name, now()])).rows[0];
  }
  return Number(r.id);
}

// ---------- tampilan ----------
const avUrl = (u) => (u.av_ver > 0 ? `/users/${u.username}/avatar?v=${u.av_ver}` : null);
const cvUrl = (u) => (u.cv_ver > 0 ? `/users/${u.username}/cover?v=${u.cv_ver}` : null);

function streakOf(u, today) {
  if (!u.last_day) return 0;
  const y = dayStr(new Date(new Date(today + 'T00:00:00Z').getTime() - 86400000));
  return u.last_day === today || u.last_day === y ? u.streak : 0;
}

async function uv(u, me, today) {
  const mine = !!me && me.id === u.id;
  const r = await one(
    `select (select count(*) from audios where owner=$1 and not hidden and not pending)::int as audios, ${me && !mine ? FOLLOW('$2', '$1') : 'false'} as isf`,
    me && !mine ? [u.id, me.id] : [u.id]);
  // Angka hubungan hanya dikirim bila pemirsa termasuk yang boleh melihat (-1 = disembunyikan, tidak bisa diklik).
  const relOk = mine || (await canSee(u.rvis || 'public', u.id, me ? me.id : 0));
  const rels = relOk ? Number((await one(`select count(*)::int n from rels where status='active' and (a=$1 or b=$1)`, [u.id])).n) : -1;
  return {
    rels,
    username: u.username, name: u.name, bio: u.bio, age: mine ? ageOf(u.birth) : 0, birth: mine ? u.birth : '',
    avatar: avUrl(u), avatar_ai: u.av_ver > 0 && u.av_ai === true && !OFFICIAL.includes(u.username), avatar_ai_kind: u.av_ver > 0 && u.av_ai === true && !OFFICIAL.includes(u.username) ? (u.av_ai_kind || 'made') : '', cover: cvUrl(u), taps: mine ? Number(u.taps) : 0, pvis: mine ? u.pvis : '', rvis: mine ? (u.rvis || 'public') : '',
    streak: streakOf(u, today), days: mine ? u.days : 0,
    followers: u.followers, following: u.following, audios: r.audios, is_following: r.isf, is_me: mine, verified: u.verified,
    labels: mine ? (await many('select id, name from rel_labels where owner=$1 order by lower(name)', [u.id])).map((x) => ({ id: Number(x.id), name: x.name })) : undefined,
  };
}

const AUD_SQL = `select a.id, a.descr, a.secs, a.pprof, a.rand, a.created, a.likes, a.plays, a.views, a.owner, a.body_len, a.in_rand, a.in_hups, a.n_audio, a.comments, a.bgm, a.bgm_idx, a.media, a.ai, a.ai_kind, a.ptag, a.body btext, u.username ou, u.name oname, u.av_ver oav, u.av_ai oai, u.av_ai_kind oaik, u.verified ov, u.pvis opvis,
  exists(select 1 from likes l where l.audio_id=a.id and l.user_id=$1) liked, exists(select 1 from saves sv where sv.post_id=a.id and sv.user_id=$1) saved from audios a join users u on u.id=a.owner`;

function av(a) {
  const na = a.n_audio ?? 1;
  const files = Array.from({ length: na }, (_, i) => ({ url: `/audios/${a.id}/file${i ? `?i=${i}` : ''}`, secs: i === 0 ? a.secs : 0 }));
  return {
    id: Number(a.id), ptag: a.ptag === true, desc: a.descr, secs: a.secs, popup: true, vis: 'public', url: files.length ? files[0].url : '', pprof: a.pprof, rand: a.rand,
    created: Number(a.created), likes: a.likes, plays: a.plays || 0, views: a.views || 0, liked: a.liked, owner: a.ou, owner_name: a.oname,
    owner_avatar: a.oav > 0 ? `/users/${a.ou}/avatar?v=${a.oav}` : null, owner_avatar_ai: a.oav > 0 && a.oai === true && !OFFICIAL.includes(a.ou), owner_avatar_ai_kind: a.oav > 0 && a.oai === true && !OFFICIAL.includes(a.ou) ? (a.oaik || 'made') : '', ai: a.ai === true, ai_kind: a.ai === true ? (a.ai_kind || 'made') : '', owner_verified: a.ov,
    long: Number(a.body_len || 0) > String(a.descr || '').length, in_rand: a.in_rand !== false, in_hups: a.in_hups === true,
    files, comments: a.comments || 0, saved: a.saved === true,
    bgm: a.bgm === true, bgm_idx: a.bgm_idx || 0, text: a.btext ?? null,
    media: Array.isArray(a.media) ? a.media : [],
  };
}
/** Untuk penulis sendiri: sertakan daftar akun tujuan pada post berpilihan "akun tertentu". */
async function addTo(items, me) {
  if (!me) return items;
  const ids = items.filter((p) => p.owner === me.username && String(p.rand).split(',').includes('accounts')).map((p) => p.id);
  if (!ids.length) return items;
  const rows = await many('select t.audio_id, x.username, x.name from audio_to t join users x on x.id=t.user_id where t.audio_id = any($1::bigint[]) order by x.username', [ids]);
  for (const p of items) if (ids.includes(p.id)) p.to = rows.filter((r) => Number(r.audio_id) === p.id).map((r) => ({ username: r.username, name: r.name }));
  return items;
}
const mini = (u) => ({ username: u.username, name: u.name, avatar: avUrl(u), verified: u.verified });

async function notify(c, to, type, actor, audio, extra = '') {
  if (to === actor) return null;
  const d = await c.query(`select 1 from notifs where to_user=$1 and type=$2 and actor=$3 and audio is not distinct from $4 and extra=$5`, [to, type, actor, audio, extra]);
  if (d.rows.length) return null;
  await c.query(`insert into notifs(to_user, type, actor, audio, extra, created) values ($1,$2,$3,$4,$5,$6)`, [to, type, actor, audio, extra, now()]);
  pushLater(to, type, actor, extra);
}

// ---------- otentikasi ----------
function deviceOf(req) {
  const x = String(req.headers['x-device'] || '').replace(/[^\w .·()+\-/]/g, '').trim().slice(0, 60);
  if (x) return x;
  const ua = String(req.headers['user-agent'] || '');
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iOS' : /Windows/i.test(ua) ? 'Windows' : /Mac OS/i.test(ua) ? 'Mac' : /Linux/i.test(ua) ? 'Linux' : '';
  const br = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox/i.test(ua) ? 'Firefox' : /Chrome/i.test(ua) ? 'Chrome' : /Safari/i.test(ua) ? 'Safari' : '';
  return ('Web ' + br + (os ? ' · ' + os : '')).trim();
}

async function newSession(userId, req) {
  const t = token();
  await q('insert into sessions(token_hash, user_id, created, expires, device, last_seen) values ($1,$2,$3,$4,$5,$3)', [sha(t), userId, now(), now() + SESSION_MS, req ? deviceOf(req) : '']);
  return t;
}

async function authUser(req) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!t || t.length > 200) return null;
  const u = await one(`select u.*, s.last_seen as sess_seen from sessions s join users u on u.id=s.user_id where s.token_hash=$1 and s.expires>$2`, [sha(t), now()]);
  if (!u) return null;
  if (now() - Number(u.sess_seen) > 5 * 60 * 1000) await q('update sessions set last_seen=$2 where token_hash=$1', [sha(t), now()]);
  if (u.status !== 'active') throw new ApiErr('banned', 403);
  return u;
}

function ipOf(req) {
  // Di Vercel, x-vercel-forwarded-for / x-real-ip diisi platform (tidak bisa dipalsukan klien).
  const h = req.headers;
  return String(h['x-vercel-forwarded-for'] || h['x-real-ip'] || h['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'x';
}

function todayOf(req) {
  const h = req.headers['x-today'];
  const s = new Date(), lo = s.getTime() - 36 * 3600 * 1000, hi = s.getTime() + 36 * 3600 * 1000;
  if (typeof h === 'string' && okBirthLike(h)) {
    const t = new Date(h + 'T12:00:00Z').getTime();
    if (t >= lo && t <= hi) return h;
  }
  return dayStr(s);
}
const okBirthLike = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T00:00:00Z'));

// ---------- pemulihan sandi (kode pemulihan, tanpa email) ----------
const REC_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';
const recNorm = (x) => String(x ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
async function issueRecovery(userId) {
  const raw = Array.from({ length: 12 }, () => REC_CHARS[randomInt(REC_CHARS.length)]).join('');
  const { salt, hash } = await hashPw(raw);
  await q('update users set rec_hash=$2, rec_salt=$3 where id=$1', [userId, hash, salt]);
  return raw.replace(/(.{4})(?=.)/g, '$1-');
}

const DUMMY = { salt: '00'.repeat(16), hash: '00'.repeat(64) };

// ---------- penangan ----------
const routes = [];
const route = (method, re, fn) => routes.push([method, re, fn]);

route('POST', /^\/register$/, async (c) => {
  await hit(`reg:${c.ip}`, 5, 3600);
  const b = c.body;
  const name = String(b.name ?? '').trim(), username = String(b.username ?? '').trim().toLowerCase(), pw = String(b.password ?? '').trim(), birth = String(b.birth ?? '').trim();
  if (!name || name.length > 40) throw new ApiErr('bad_name');
  if (!UN.test(username)) throw new ApiErr('bad_username');
  if (pw.length < 6 || pw.length > 100 || /\s/.test(pw)) throw new ApiErr('bad_password');
  if (!okBirth(birth)) throw new ApiErr('bad_age');
  const { salt, hash } = await hashPw(pw);
  let u;
  try {
    u = await one(`insert into users(username, name, birth, pass_hash, pass_salt, created, rem) values ($1,$2,$3,$4,$5,$6,$7) returning *`,
      [username, name, birth, hash, salt, now(), c.body.slot ? String(c.body.slot).slice(0, 10) : null]);
  } catch (e) {
    if (e.code === '23505') throw new ApiErr('username_taken', 409);
    throw e;
  }
  const code = await issueRecovery(u.id);
  return { token: await newSession(u.id, c.req), user: await uv(u, u, c.today), recovery: code };
});

route('POST', /^\/login$/, async (c) => {
  const username = String(c.body.username ?? '').trim().toLowerCase();
  await hit(`login:${c.ip}`, 20, 600);
  await hit(`loginu:${username}`, 8, 600);
  const u = await one('select * from users where username=$1', [username]);
  const okPw = u ? await checkPw(String(c.body.password ?? '').trim(), u.pass_salt, u.pass_hash) : (await checkPw(String(c.body.password ?? '').trim(), DUMMY.salt, DUMMY.hash), false); // waktu sama walau akun tidak ada
  if (!u || !okPw) throw new ApiErr('bad_credentials', 401);
  if (u.status !== 'active') throw new ApiErr('banned', 403);
  return { token: await newSession(u.id, c.req), user: await uv(u, u, c.today) };
});

route('POST', /^\/recover$/, async (c) => {
  const username = String(c.body.username ?? '').trim().toLowerCase();
  await hit(`rec:${c.ip}`, 10, 3600);
  await hit(`recu:${username}`, 5, 3600);
  const pw = String(c.body.password ?? '').trim();
  if (pw.length < 6 || pw.length > 100 || /\s/.test(pw)) throw new ApiErr('bad_password');
  const u = await one('select * from users where username=$1', [username]);
  const code = recNorm(c.body.code);
  const okRec = u && u.rec_hash && code.length === 12 ? await checkPw(code, u.rec_salt, u.rec_hash) : (await checkPw(code || 'x', DUMMY.salt, DUMMY.hash), false); // waktu sama walau akun/kode tidak ada
  if (!u || !okRec) throw new ApiErr('bad_recovery', 401);
  if (u.status !== 'active') throw new ApiErr('banned', 403);
  const { salt, hash } = await hashPw(pw);
  await tx(async (t) => {
    await t.query('update users set pass_hash=$2, pass_salt=$3 where id=$1', [u.id, hash, salt]);
    await t.query('delete from sessions where user_id=$1', [u.id]);
  });
  return { ok: true, recovery: await issueRecovery(u.id) }; // kode lama hangus, kode baru diberikan
});

route('POST', /^\/me\/recovery$/, async (c) => {
  const u = c.need();
  await hit(`recg:${u.id}`, 5, 3600);
  if (!(await checkPw(String(c.body.password ?? '').trim(), u.pass_salt, u.pass_hash))) throw new ApiErr('bad_credentials', 401);
  return { recovery: await issueRecovery(u.id) };
});

route('POST', /^\/logout$/, async (c) => {
  const h = c.req.headers.authorization || '';
  if (h.startsWith('Bearer ')) await q('delete from sessions where token_hash=$1', [sha(h.slice(7))]);
  return { ok: true };
});

route('GET', /^\/preview$/, async (c) => {
  const u = c.need();
  await hit(`prev:${u.id}`, 120, 60);
  const url = String(c.query.url || '').slice(0, 2000);
  if (!/^https?:\/\//i.test(url)) throw new ApiErr('bad_url');
  return { preview: await preview(url) };
});

route('GET', /^\/img$/, async (c) => {
  await hit(`img:${c.ip}`, 600, 60);
  const u = imgUrlOf(c.query.u, c.query.s);
  if (!u) throw new ApiErr('not_found', 404);
  try {
    const r = await fetchImage(u);
    return { binary: r.buf, mime: r.mime, cache: 'public, max-age=86400, s-maxage=604800, immutable' };
  } catch { throw new ApiErr('not_found', 404); }
});

route('GET', /^\/stats$/, async (c) => ({ taps: c.me ? Number(c.me.taps) : 0, tapf: c.me ? (c.me.tapf || {}) : {} }));

async function addTap(uid, f) {
  const r = await one(`update users set taps=taps+1, tapf=jsonb_set(tapf, array[$2::text], to_jsonb(coalesce((tapf->>$2::text)::int,0)+1), true) where id=$1 returning tapf`, [uid, f]);
  return Number(r.tapf[f]);
}

route('GET', /^\/random$/, async (c) => {
  await hit(`rnd:${c.me ? 'u' + c.me.id : c.ip}`, 120, 60);
  const f = filterOf(c.query.f);
  const vid = c.me ? c.me.id : 0, last = Number(c.query.last) || 0;
  const base = `from audios a join users u on u.id=a.owner where not a.hidden and not a.pending and a.in_rand and u.status='active' and (${audCond(f)} or (a.owner=$1 and ${HAS('public')} and '${f}'='public'))`;
  let n = (await one(`select count(*)::int n ${base} and a.id<>$2`, [vid, last])).n;
  let excl = true;
  if (n === 0) { n = (await one(`select count(*)::int n ${base} and ($2=$2)`, [vid, last])).n; excl = false; }
  let taps = c.me ? Number((c.me.tapf || {})[f] || 0) : 0;
  if (n === 0) return { taps, audio: null }; // belum ada audio: angka tidak bertambah
  const off = randomInt(n); // acak sungguhan (CSPRNG), peluang sama
  const row = await one(`select a.id ${base} and ${excl ? 'a.id<>$2' : '$2=$2'} order by a.id offset ${off} limit 1`, [vid, last]);
  const a = await one(`${AUD_SQL} where a.id=$2`, [vid, row.id]);
  if (c.me && c.query.peek !== '1') taps = await addTap(c.me.id, f);
  return { taps, audio: av(a) };
});

// Hitung satu ketukan Acak untuk audio yang sudah diambil lebih dulu (peek=1), agar angka ketukan tetap tepat.
route('POST', /^\/taps$/, async (c) => {
  c.need(); await hit(`tap:${c.me.id}`, 120, 60);
  const f = filterOf(c.body && c.body.f);
  return { taps: await addTap(c.me.id, f) };
});

route('GET', /^\/search$/, async (c) => {
  await hit(`srch:${c.me ? 'u' + c.me.id : c.ip}`, 60, 60);
  const s = String(c.query.q ?? '').trim().toLowerCase().slice(0, 50);
  if (!s || !s.replace(/[@#\s]/g, '')) return { users: [], audios: [] };
  if (c.me && s.length >= 2) { // ingat pencarian terakhir (dipakai peringkat Hups); simpan 20 terakhir saja
    q('insert into search_log(user_id, sq, created) values ($1,$2,$3)', [c.me.id, s, now()]).then(() => q('delete from search_log where user_id=$1 and id not in (select id from search_log where user_id=$1 order by id desc limit 20)', [c.me.id])).catch(() => {});
  }
  const esc = (x) => x.replace(/[\\%_]/g, (m) => '\\' + m);
  const terms = [...new Set(s.replace(/^[@#]/, '').split(/\s+/).map((x) => x.replace(/^[@#]/, '')).filter(Boolean))].slice(0, 5);
  const users = [];
  {
    const where = terms.map((_, i) => `(lower(username) like $${i + 1} or lower(name) like $${i + 1} or lower(bio) like $${i + 1})`).join(' and ');
    users.push(...await many(`select * from users where status='active' and ${where} order by (lower(username) like $${terms.length + 1}) desc, username limit 30`, [...terms.map((x) => '%' + esc(x) + '%'), esc(terms[0]) + '%']));
  }
  if (c.query.m === '1' && !(c.me && await PH.accessOf(c.me.id))) { for (let i = users.length - 1; i >= 0; i--) if (users[i].username === PH.PH_USER) users.splice(i, 1); }
  const vid = c.me ? Number(c.me.id) : 0;
  const pc = terms.map((_, i) => `(lower(a.descr) like $${i + 2} or lower(coalesce(a.body,'')) like $${i + 2} or lower(u.username) like $${i + 2} or lower(u.name) like $${i + 2} or lower(a.mentions) like $${i + 2} or exists(select 1 from comments cm where cm.post_id=a.id and not cm.pending and lower(cm.body) like $${i + 2}))`).join(' and ');
  const rows = await many(`${AUD_SQL} where not a.hidden and not a.pending and u.status='active' and ${pc} order by a.id desc limit 120`, [vid, ...terms.map((x) => '%' + esc(x) + '%')]);
  const audios = [];
  for (const a of rows) {
    if (await canOpen({ id: a.id, owner: a.owner, rand: a.rand, hidden: false, pending: false, ostatus: 'active', pvis: a.opvis }, vid)) audios.push(av(a));
    if (audios.length >= 40) break;
  }
  return { users: users.map(mini), audios };
});

async function unreadCounts(id) {
  const r = await one(`select count(*)::int u, count(*) filter (where type in ('like','follow','rel_req','rel_ok','comment','reply','mention'))::int s from notifs where to_user=$1 and not seen`, [id]);
  return { unread: r.u, unread_social: r.s };
}

route('GET', /^\/me$/, async (c) => ({ user: await uv(c.need(), c.me, c.today), ...(await unreadCounts(c.me.id)) }));

route('PATCH', /^\/me\/settings$/, async (c) => {
  const u = c.need();
  const pv = c.body.pvis === undefined ? u.pvis : parseAud(c.body.pvis, true), rv = c.body.rvis === undefined ? (u.rvis || 'public') : parseAud(c.body.rvis, true);
  if (!pv || !rv) throw new ApiErr('bad_file');
  await ownLabels(u.id, pv + ',' + rv);
  const r = await one('update users set pvis=$2, rvis=$3 where id=$1 returning *', [u.id, pv, rv]);
  return { user: await uv(r, r, c.today) };
});

route('POST', /^\/me\/checkin$/, async (c) => {
  const u = c.need(), today = c.today;
  let isNew = false, streak = u.streak, days = u.days, last = u.last_day;
  if (last !== today) {
    isNew = true;
    const y = dayStr(new Date(new Date(today + 'T00:00:00Z').getTime() - 86400000));
    let missed = 0;
    if (last && last === y) streak = u.streak + 1;
    else { if (last) missed = Math.max(0, Math.round((new Date(today) - new Date(last)) / 86400000) - 1); streak = 1; }
    days = u.days + 1;
    await tx(async (t) => {
      await t.query('update users set streak=$2, days=$3, last_day=$4 where id=$1', [u.id, streak, days, today]);
      await t.query('insert into logins(user_id, day) values ($1,$2) on conflict do nothing', [u.id, today]);
      if (missed > 0) await t.query(`insert into notifs(to_user, type, n, created) values ($1,'missed',$2,$3)`, [u.id, missed, now()]);
      await t.query(`insert into notifs(to_user, type, n, created) values ($1,'streak',$2,$3)`, [u.id, streak, now()]);
    });
  }
  return { streak: streakOf({ last_day: today, streak }, today), days, new: isNew };
});

route('GET', /^\/me\/log$/, async (c) => {
  const u = c.need();
  const d = await many('select day from logins where user_id=$1 order by day desc limit 800', [u.id]);
  return { days: d.map((r) => r.day).sort(), streak: streakOf(u, c.today), total: u.days };
});

route('POST', /^\/me\/reminders$/, async (c) => {
  const u = c.need();
  if (c.body.test === true) {
    await hit(`rtest:${u.id}`, 10, 3600);
    await q(`insert into notifs(to_user, type, n, created) values ($1,'tired',0,$2)`, [u.id, now()]);
    return { ok: true, added: true };
  }
  const slot = String(c.body.slot ?? '').slice(0, 10), slotMs = Number(c.body.slot_ms) || 0;
  const valid = okBirthLike(slot) && slotMs <= now() && slotMs > now() - 48 * 3600 * 1000;
  if (!valid) return { ok: true, added: false };
  const fresh = u.rem && u.rem !== slot && c.body.on !== false;
  if (fresh) await q(`insert into notifs(to_user, type, n, created) values ($1,'tired',0,$2)`, [u.id, slotMs]);
  await q('update users set rem=$2 where id=$1', [u.id, slot]);
  return { ok: true, added: !!fresh };
});

route('DELETE', /^\/me\/followers\/([a-z0-9_]+)$/, async (c, m) => {
  const u = c.need();
  const f = await one('select id from users where username=$1', [m[1]]);
  if (!f) throw new ApiErr('not_found', 404);
  await tx(async (t) => {
    const d = await t.query('delete from follows where src=$1 and dst=$2', [f.id, u.id]);
    if (d.rowCount) {
      await t.query('update users set followers=greatest(0, followers-1) where id=$1', [u.id]);
      await t.query('update users set following=greatest(0, following-1) where id=$1', [f.id]);
    }
    await t.query(`delete from notifs where type='follow' and actor=$1 and to_user=$2`, [f.id, u.id]);
  });
  return { followers: (await one('select followers from users where id=$1', [u.id])).followers };
});

route('PATCH', /^\/me$/, async (c) => {
  const u = c.need(), b = c.body;
  const name = 'name' in b ? String(b.name).trim() : u.name, bio = 'bio' in b ? String(b.bio).trim() : u.bio;
  const nu = 'username' in b ? String(b.username).trim().toLowerCase() : u.username, birth = 'birth' in b ? String(b.birth).trim() : u.birth;
  if (!name || name.length > 40) throw new ApiErr('bad_name');
  if (bio.length > 300) throw new ApiErr('bad_bio');
  if (!UN.test(nu)) throw new ApiErr('bad_username');
  if (!okBirth(birth)) throw new ApiErr('bad_age');
  let r;
  try { r = await one('update users set name=$2, bio=$3, username=$4, birth=$5 where id=$1 returning *', [u.id, name, bio, nu, birth]); }
  catch (e) { if (e.code === '23505') throw new ApiErr('username_taken', 409); throw e; }
  return { user: await uv(r, r, c.today) };
});

route('POST', /^\/me\/password$/, async (c) => {
  const u = c.need();
  await hit(`pw:${u.id}`, 8, 600);
  if (!(await checkPw(String(c.body.old ?? '').trim(), u.pass_salt, u.pass_hash))) throw new ApiErr('bad_credentials', 401);
  const pw = String(c.body.new ?? '').trim();
  if (pw.length < 6 || pw.length > 100 || /\s/.test(pw)) throw new ApiErr('bad_password');
  const { salt, hash } = await hashPw(pw);
  const cur = sha((c.req.headers.authorization || '').slice(7));
  await tx(async (t) => {
    await t.query('update users set pass_hash=$2, pass_salt=$3 where id=$1', [u.id, hash, salt]);
    await t.query('delete from sessions where user_id=$1 and token_hash<>$2', [u.id, cur]); // sesi lain hangus
  });
  return { ok: true };
});

route('POST', /^\/me\/logout-others$/, async (c) => {
  const u = c.need();
  const cur = sha((c.req.headers.authorization || '').slice(7));
  const d = await q('delete from sessions where user_id=$1 and token_hash<>$2', [u.id, cur]);
  return { ok: true, closed: d.rowCount };
});

route('GET', /^\/me\/sessions$/, async (c) => {
  const u = c.need();
  const cur = sha((c.req.headers.authorization || '').slice(7));
  const rows = await many('select token_hash, device, created, last_seen from sessions where user_id=$1 and expires>$2 order by last_seen desc limit 50', [u.id, now()]);
  return { items: rows.map((r) => ({ id: r.token_hash.slice(0, 16), device: r.device || 'Perangkat', created: Number(r.created), last_seen: Number(r.last_seen) || Number(r.created), current: r.token_hash === cur })) };
});

route('DELETE', /^\/me\/sessions\/([0-9a-f]{16})$/, async (c, m) => {
  const u = c.need();
  const cur = sha((c.req.headers.authorization || '').slice(7));
  const d = await q('delete from sessions where user_id=$1 and left(token_hash,16)=$2 and token_hash<>$3', [u.id, m[1], cur]);
  if (!d.rowCount) throw new ApiErr('not_found', 404);
  return { ok: true };
});

// ---------- notifikasi dorong ----------
route('POST', /^\/me\/push$/, async (c) => {
  const u = c.need();
  await hit(`push:${u.id}`, 30, 600);
  const t = String(c.body.token || '').slice(0, 400);
  if (!/^[\w:\-]{20,400}$/.test(t)) throw new ApiErr('bad_request');
  if (c.body.on === false) { await q('delete from push_tokens where token=$1 and user_id=$2', [t, u.id]); return { ok: true }; }
  await q(`insert into push_tokens(token, user_id, lang, created, remind) values ($1,$2,$3,$4,$5) on conflict (token) do update set user_id=$2, lang=$3, remind=$5`, [t, u.id, c.body.lang === 'en' ? 'en' : 'id', now(), c.body.remind !== false]);
  return { ok: true };
});

// ---------- laporan ----------
const REASONS = ['abuse', 'sexual', 'violence', 'spam', 'impersonate', 'other'];
route('POST', /^\/reports$/, async (c) => {
  const u = c.need();
  await hit(`rep:${u.id}`, 20, 3600);
  const reason = REASONS.includes(c.body.reason) ? c.body.reason : 'other';
  const note = String(c.body.note ?? '').trim().slice(0, 300);
  const aid = Number(c.body.audio) || null, cid = Number(c.body.comment) || null;
  let tu = null, ta = null, tc = null;
  if (cid) {
    const cm = await one('select id, owner, post_id from comments where id=$1', [cid]);
    if (!cm) throw new ApiErr('not_found', 404);
    if (Number(cm.owner) === Number(u.id)) throw new ApiErr('forbidden', 403);
    tc = cm.id; ta = cm.post_id; tu = cm.owner;
  } else if (aid) {
    const a = await one('select id, owner from audios where id=$1', [aid]);
    if (!a) throw new ApiErr('not_found', 404);
    if (Number(a.owner) === Number(u.id)) throw new ApiErr('forbidden', 403);
    ta = a.id; tu = a.owner;
  } else {
    const o = await one('select id from users where username=$1', [String(c.body.user ?? '').toLowerCase()]);
    if (!o) throw new ApiErr('not_found', 404);
    if (Number(o.id) === Number(u.id)) throw new ApiErr('forbidden', 403);
    tu = o.id;
  }
  const dup = await one(`select 1 from reports where reporter=$1 and target_user=$2 and target_audio is not distinct from $3 and target_comment is not distinct from $4 and status='open'`, [u.id, tu, ta, tc]);
  if (!dup) {
    await q('insert into reports(reporter, target_user, target_audio, target_comment, reason, created) values ($1,$2,$3,$4,$5,$6)', [u.id, tu, ta, tc, (reason + (note ? ': ' + note : '')).slice(0, 320), now()]);
  }
  return { ok: true };
});

route('DELETE', /^\/me$/, async (c) => {
  const u = c.need();
  const bl = await blobsOf('a.owner=$1', 'c.owner=$1 or c.post_id in (select id from audios where owner=$1)', [u.id]);
  await q('delete from users where id=$1', [u.id]); // semua data terkait ikut terhapus (CASCADE)
  await Promise.all(bl.map((b) => delAudio(b.store, b.key)));
  return { ok: true };
});

route('GET', /^\/me\/liked$/, async (c) => {
  const u = c.need();
  const rows = await many(`${AUD_SQL} where not a.hidden and not a.pending and exists(select 1 from likes l where l.audio_id=a.id and l.user_id=$1) order by a.id desc limit 200`, [u.id]);
  return { audios: rows.map(av) };
});

route('GET', /^\/notifications$/, async (c) => {
  const u = c.need();
  const rows = await many(
    `select n.id, n.type, n.created, n.seen, n.n, n.extra, n.actor, n.audio, a.username, a.name, a.av_ver, au.descr from notifs n
     left join users a on a.id=n.actor left join audios au on au.id=n.audio where n.to_user=$1 order by n.created desc, n.id desc limit 60`, [u.id]);
  const items = rows.filter((r) => r.actor === null || r.username).map((r) => (r.actor === null
    ? { id: Number(r.id), type: r.type, created: Number(r.created), seen: r.seen, n: r.n, username: '', name: 'Hulhup', avatar: null, desc: '' }
    : { id: Number(r.id), type: r.type, created: Number(r.created), seen: r.seen, username: r.username, name: r.name, avatar: r.av_ver > 0 ? `/users/${r.username}/avatar?v=${r.av_ver}` : null, desc: r.descr ?? '', extra: r.extra, post: r.audio ? Number(r.audio) : 0 }));
  await q('update notifs set seen=true where to_user=$1 and not seen', [u.id]);
  return { items };
});

route('POST', /^\/notifications\/delete$/, async (c) => {
  const u = c.need();
  if (c.body.all === true) return { ok: true, n: (await q('delete from notifs where to_user=$1', [u.id])).rowCount };
  const ids = (Array.isArray(c.body.ids) ? c.body.ids : []).map(Number).filter((x) => Number.isInteger(x) && x > 0).slice(0, 200);
  if (!ids.length) return { ok: true, n: 0 };
  return { ok: true, n: (await q('delete from notifs where to_user=$1 and id = any($2)', [u.id, ids])).rowCount };
});

route('DELETE', /^\/audios\/(\d+)$/, async (c, m) => {
  const u = c.need();
  const own = await one('select id from audios where id=$1 and owner=$2', [m[1], u.id]);
  if (!own) throw new ApiErr('not_found', 404);
  const bl = await blobsOf('a.id=$1', 'c.post_id=$1', [own.id]);
  await q('delete from audios where id=$1', [own.id]);
  await Promise.all(bl.map((b) => delAudio(b.store, b.key)));
  return { ok: true };
});

// Putar / lihat: hanya akun masuk, dan tiap akun dihitung 1 kali per post (ulang berapa kali pun tidak menambah).
for (const [kind, table, col] of [['play', 'post_plays', 'plays'], ['view', 'post_views', 'views']]) {
  route('POST', new RegExp(`^\\/audios\\/(\\d+)\\/${kind}$`), async (c, m) => {
    const u = c.need();
    await hit(`${kind}:${u.id}`, 600, 60);
    const a = await one('select id, hidden, bgm, n_audio from audios where id=$1', [m[1]]);
    if (!a || a.hidden) throw new ApiErr('not_found', 404);
    if (kind === 'play' && (a.bgm || !(a.n_audio > 0))) return { plays: 0, views: 0, counted: false }; // teks saja dan backsound tidak punya hitungan putar
    return tx(async (t) => {
      const r = await t.query(`insert into ${table}(post_id, user_id) values ($1,$2) on conflict do nothing`, [a.id, u.id]);
      if (r.rowCount) await t.query(`update audios set ${col}=${col}+1 where id=$1`, [a.id]);
      const x = (await t.query('select plays, views from audios where id=$1', [a.id])).rows[0];
      return { plays: x.plays, views: x.views, counted: r.rowCount > 0 };
    });
  });
}

route('POST', /^\/audios\/(\d+)\/like$/, async (c, m) => {
  const u = c.need();
  await hit(`like:${u.id}`, 120, 60);
  const a = await one(`select a.id, a.owner, a.rand, a.hidden from audios a where a.id=$1`, [m[1]]);
  if (!a || a.hidden) throw new ApiErr('not_found', 404);
  return tx(async (t) => {
    const d = await t.query('delete from likes where user_id=$1 and audio_id=$2', [u.id, a.id]);
    let liked;
    if (d.rowCount) { liked = false; await t.query('update audios set likes=greatest(0, likes-1) where id=$1', [a.id]); }
    else {
      liked = true;
      await t.query('insert into likes(user_id, audio_id) values ($1,$2)', [u.id, a.id]);
      await t.query('update audios set likes=likes+1 where id=$1', [a.id]);
      await notify(t, Number(a.owner), 'like', u.id, Number(a.id));
    }
    return { liked, likes: (await t.query('select likes from audios where id=$1', [a.id])).rows[0].likes };
  });
});

route('POST', /^\/audios$/, async (c) => {
  const u = c.need();
  await hit(`up:${u.id}`, 20, 3600);
  const body = await readBody(c.req, MAX_AUDIO + 1024);
  if (!body.length || body.length > MAX_AUDIO) throw new ApiErr('too_big', 413);
  const mime = audioMime(body);
  if (!mime) throw new ApiErr('bad_file');
  const f = c.query;
  const rnd = parseAud(f.rand, false, true) ?? 'public';
  await ownLabels(u.id, rnd);
  let to = [];
  if (audList(rnd).includes('accounts')) {
    const names = String(f.to ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean).slice(0, 200);
    const us = names.length ? await many('select id from users where username = any($1) and id<>$2 and status=$3', [names, u.id, 'active']) : [];
    to = us.map((r) => r.id);
    if (!to.length) throw new ApiErr('need_accounts');
  }
  const secs = Math.min(15, Math.max(1, parseInt(f.secs, 10) || 15));
  const desc = String(f.desc ?? '').trim().slice(0, MAX_POST_TEXT);
  const store = storeFor(secs);
  const dk = deksAudio(body); logDeks(`u${u.id} audio`, dk);
  const key = await putAudio(store, body, mime);
  try {
    await tx(async (t) => {
      const r = await t.query(`insert into audios(owner, descr, secs, store, blob_key, mime, rand, pprof, created, in_rand, in_hups, ai, ai_kind, deks) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,true,$10,$11,$12) returning id`,
        [u.id, desc, secs, store, key, mime, rnd, f.pprof !== '0', now(), dk.ai, dk.kind, brief(dk)]);
      for (const id of to) await t.query('insert into audio_to(audio_id, user_id) values ($1,$2)', [r.rows[0].id, id]);
    });
  } catch (e) { await delAudio(store, key); throw e; }
  return { ok: true };
});

route('GET', /^\/audios\/(\d+)\/file$/, async (c, m) => {
  const a = await accessRow(m[1]);
  if (!a || !(await canOpen(a, c.me ? Number(c.me.id) : 0))) throw new ApiErr('not_found', 404);
  const i = parseInt(c.query.i, 10) || 0;
  let f = a;
  if (i > 0) {
    f = await one('select store, blob_key, mime from post_audios where post_id=$1 and idx=$2', [a.id, i]);
    if (!f) throw new ApiErr('not_found', 404);
  }
  if (!f.store) throw new ApiErr('not_found', 404);
  const b = await getAudio(f.store, f.blob_key);
  if (!b) throw new ApiErr('not_found', 404);
  return { binary: b, mime: f.mime, cache: 'private, max-age=86400' };
});


/** Akun resmi (phipop, hulhup, misyi): foto profil dipasang/diperbarui otomatis dari aset tertanam, tanpa label AI. Sekali per instance. */
const OFFICIAL = Object.keys(OFFICIAL_IMG);
let officialDone = null;
function ensureOfficial() {
  officialDone ??= (async () => {
    for (const un of OFFICIAL) {
      const u = await one(`select id, av_ver, av_ai from users where username=$1`, [un]); if (!u) continue;
      const [mime, b64] = OFFICIAL_IMG[un]; const data = Buffer.from(b64, 'base64');
      const cur = await one(`select md5(data) h from photos where user_id=$1 and kind='avatar'`, [u.id]);
      const want = createHash('md5').update(data).digest('hex');
      if (!cur || (cur.h !== want && un !== 'hulhup')) {
        await q(`insert into photos(user_id, kind, mime, data) values ($1,'avatar',$2,$3) on conflict (user_id, kind) do update set mime=$2, data=$3`, [u.id, mime, data]);
        await q(`update users set av_ver=$2, av_ai=false, av_ai_kind='', av_deks=null where id=$1`, [u.id, now()]);
      } else if (u.av_ai) await q(`update users set av_ai=false, av_ai_kind='' where id=$1`, [u.id]);
    }
  })().catch((e) => { officialDone = null; console.error('official sync', e?.message); });
  return officialDone;
}

route('GET', /^\/users\/([a-z0-9_]+)\/(avatar|cover)$/, async (c, m) => {
  let r = await one(`select p.mime, p.data from photos p join users u on u.id=p.user_id where u.username=$1 and p.kind=$2 and u.status='active'`, [m[1], m[2]]);
  if (!r) throw new ApiErr('not_found', 404);
  return { binary: r.data, mime: r.mime, cache: 'public, max-age=31536000, immutable' };
});

route('POST', /^\/me\/(avatar|cover)$/, async (c, m) => {
  const u = c.need();
  await hit(`img:${u.id}`, 20, 3600);
  const raw = await readBody(c.req, MAX_PACK).catch((e) => { throw e.code === 'too_big' ? new ApiErr('too_big_img', 413) : e; });
  if (!raw.length) throw new ApiErr('bad_file');
  const { meta, img: body } = unpack(raw);
  if (!body.length) throw new ApiErr('bad_file');
  if (body.length > MAX_IMG || (!meta && raw.length > MAX_IMG)) throw new ApiErr('too_big_img', 413);
  const mime = imageMime(body);
  if (!mime || mime === 'image/gif') throw new ApiErr('bad_file');
  const col = m[1] === 'avatar' ? 'av_ver' : 'cv_ver';
  let dk = null;
  if (m[1] === 'avatar') { dk = deksImage(meta || body, meta ? body : null); logDeks(`u${u.id} avatar`, dk); } // Deks memeriksa berkas asli (atau sidecar metadata) + foto yang disimpan
  await tx(async (t) => {
    await t.query(`insert into photos(user_id, kind, mime, data) values ($1,$2,$3,$4) on conflict (user_id, kind) do update set mime=excluded.mime, data=excluded.data`, [u.id, m[1], mime, body]);
    if (dk) await t.query('update users set av_ver=$2, av_ai=$3, av_ai_kind=$4, av_deks=$5 where id=$1', [u.id, now(), dk.ai, dk.kind, brief(dk)]);
    else await t.query(`update users set ${col}=$2 where id=$1`, [u.id, now()]);
  });
  return { ok: true };
});

route('DELETE', /^\/me\/(avatar|cover)$/, async (c, m) => {
  const u = c.need();
  const col = m[1] === 'avatar' ? 'av_ver' : 'cv_ver';
  await tx(async (t) => {
    await t.query('delete from photos where user_id=$1 and kind=$2', [u.id, m[1]]);
    await t.query(`update users set ${col}=0${m[1] === 'avatar' ? ", av_ai=false, av_ai_kind='', av_deks=null" : ''} where id=$1`, [u.id]);
  });
  const r = await one('select * from users where id=$1', [u.id]);
  return { user: await uv(r, r, c.today) };
});

// ---------- hubungan ----------
const relRow = (o, type) => ({ username: o.username, name: o.name, avatar: avUrl(o), type, verified: o.verified, label: o.label_name ?? null, label_id: o.label_id ? Number(o.label_id) : null });

route('POST', /^\/relations$/, async (c) => {
  const u = c.need();
  await hit(`rel:${u.id}`, 30, 3600);
  const t = String(c.body.type), o = await one('select * from users where username=$1 and status=$2', [String(c.body.to ?? '').toLowerCase(), 'active']);
  if (!REL_TYPES.includes(t)) throw new ApiErr('bad_file');
  const lab = cleanLabel(c.body.label);
  if (t === 'custom' && !lab) throw new ApiErr('empty');
  if (!o) throw new ApiErr('not_found', 404);
  if (o.id === u.id) throw new ApiErr('forbidden', 403);
  if (o.username === PH.PH_USER && u.username !== 'qih') throw new ApiErr('forbidden', 403); // Phipop hanya berhubungan dengan bosnya
  await tx(async (c2) => {
    const ex = await c2.query(`select 1 from rels where (a=$1 and b=$2) or (a=$2 and b=$1)`, [u.id, o.id]);
    if (ex.rows.length) throw new ApiErr('rel_exists', 409);
    const la = lab ? await labelId(c2, u.id, lab) : null;
    await c2.query(`insert into rels(a, b, type, status, created, la) values ($1,$2,$3,'pending',$4,$5)`, [u.id, o.id, t, now(), la]);
    await notify(c2, Number(o.id), 'rel_req', u.id, null, t === 'custom' ? lab : t);
  });
  return { ok: true };
});

/** Ubah nama hubungan (milikku sendiri) pada satu hubungan; kosong = hapus nama. */
route('POST', /^\/relations\/([a-z0-9_]+)\/label$/, async (c, m) => {
  const u = c.need();
  await hit(`rl:${u.id}`, 60, 3600);
  const o = await one('select id from users where username=$1', [m[1]]);
  if (!o) throw new ApiErr('not_found', 404);
  const lab = cleanLabel(c.body.label);
  await tx(async (t) => {
    const r = (await t.query(`select a, b from rels where (a=$1 and b=$2) or (a=$2 and b=$1)`, [u.id, o.id])).rows[0];
    if (!r) throw new ApiErr('not_found', 404);
    const lid = lab ? await labelId(t, u.id, lab) : null;
    await t.query(`update rels set ${Number(r.a) === Number(u.id) ? 'la' : 'lb'}=$3 where a=$1 and b=$2`, [r.a, r.b, lid]);
  });
  return { ok: true, label: lab || null };
});

route('GET', /^\/me\/labels$/, async (c) => {
  const u = c.need();
  const rows = await many(`select l.id, l.name, (select count(*)::int from rels r where r.status='active' and ((r.a=$1 and r.la=l.id) or (r.b=$1 and r.lb=l.id))) n from rel_labels l where l.owner=$1 order by lower(l.name)`, [u.id]);
  return { items: rows.map((x) => ({ id: Number(x.id), name: x.name, n: x.n })) };
});

route('POST', /^\/me\/labels$/, async (c) => {
  const u = c.need();
  await hit(`lbl:${u.id}`, 60, 3600);
  const name = cleanLabel(c.body.name);
  if (!name) throw new ApiErr('empty');
  const id = await tx((t) => labelId(t, u.id, name));
  return { ok: true, id };
});

/** Hapus nama hubungan: hubungan yang memakainya tetap ada (tanpa nama), dan audiens post/profil yang memakainya dicabut (bila habis menjadi "hanya saya"). */
route('DELETE', /^\/me\/labels\/(\d+)$/, async (c, m) => {
  const u = c.need();
  await tx(async (t) => {
    const r = (await t.query('select id from rel_labels where id=$1 and owner=$2', [m[1], u.id])).rows[0];
    if (!r) throw new ApiErr('not_found', 404);
    const tok = 'L' + r.id;
    const strip = "coalesce(nullif(array_to_string(array_remove(string_to_array(%C,','), $2), ','), ''), 'me')";
    await t.query(`update audios set rand=${strip.replace('%C', 'rand')} where owner=$1 and $2=any(string_to_array(rand,','))`, [u.id, tok]);
    await t.query(`update users set pvis=${strip.replace('%C', 'pvis')} where id=$1 and $2=any(string_to_array(pvis,','))`, [u.id, tok]);
    await t.query(`update users set rvis=${strip.replace('%C', 'rvis')} where id=$1 and $2=any(string_to_array(rvis,','))`, [u.id, tok]);
    await t.query('delete from rel_labels where id=$1', [r.id]);
  });
  return { ok: true };
});

route('GET', /^\/me\/relations$/, async (c) => {
  const u = c.need();
  const rows = await many(`select r.*, o.username, o.name, o.av_ver, o.verified, l.name label_name, l.id label_id from rels r join users o on o.id = case when r.a=$1 then r.b else r.a end left join rel_labels l on l.id = case when r.a=$1 then r.la else r.lb end where r.a=$1 or r.b=$1 order by r.created desc`, [u.id]);
  const f = (r) => relRow({ ...r, av_ver: r.av_ver }, r.type);
  return {
    active: rows.filter((r) => r.status === 'active').map(f),
    incoming: rows.filter((r) => r.status === 'pending' && Number(r.b) === Number(u.id)).map(f),
    outgoing: rows.filter((r) => r.status === 'pending' && Number(r.a) === Number(u.id)).map(f),
  };
});

route('GET', /^\/users\/([a-z0-9_]+)\/relations$/, async (c, m) => {
  const o = await one(`select id, rvis from users where username=$1 and status='active'`, [m[1]]);
  if (!o) throw new ApiErr('not_found', 404);
  if (!(await canSee(o.rvis || 'public', o.id, c.me ? c.me.id : 0))) return { items: [], locked: true };
  const rows = await many(`select r.type, f.username, f.name, f.av_ver, f.verified, l.name label_name, l.id label_id from rels r join users f on f.id = case when r.a=$1 then r.b else r.a end left join rel_labels l on l.id = case when r.a=$1 then r.la else r.lb end where r.status='active' and (r.a=$1 or r.b=$1) and f.status='active' order by r.since desc nulls last limit 200`, [o.id]);
  return { items: rows.map((r) => relRow(r, r.type)) };
});

route('POST', /^\/relations\/([a-z0-9_]+)\/(accept|decline)$/, async (c, m) => {
  const u = c.need();
  const o = await one('select id from users where username=$1', [m[1]]);
  if (!o) throw new ApiErr('not_found', 404);
  await tx(async (t) => {
    const r = (await t.query(`select * from rels where (a=$1 and b=$2) or (a=$2 and b=$1)`, [u.id, o.id])).rows[0];
    if (!r) throw new ApiErr('not_found', 404);
    if (r.status !== 'pending' || Number(r.b) !== Number(u.id)) throw new ApiErr('forbidden', 403);
    await t.query(`delete from notifs where type='rel_req' and actor=$1 and to_user=$2`, [o.id, u.id]);
    if (m[2] === 'accept') {
      const theirs = r.la ? (await t.query('select name from rel_labels where id=$1', [r.la])).rows[0]?.name : '';
      const given = c.body.label ? cleanLabel(c.body.label) : (r.type === 'custom' ? theirs : '');
      const lb = given ? await labelId(t, u.id, given) : null;
      await t.query(`update rels set status='active', since=$3, lb=$4 where a=$1 and b=$2`, [r.a, r.b, now(), lb]);
      await notify(t, Number(o.id), 'rel_ok', u.id, null, r.type === 'custom' ? (theirs || 'custom') : r.type);
    } else await t.query('delete from rels where a=$1 and b=$2', [r.a, r.b]);
  });
  return { ok: true };
});

route('DELETE', /^\/relations\/([a-z0-9_]+)$/, async (c, m) => {
  const u = c.need();
  const o = await one('select id from users where username=$1', [m[1]]);
  if (!o) throw new ApiErr('not_found', 404);
  await tx(async (t) => {
    const d = await t.query(`delete from rels where (a=$1 and b=$2) or (a=$2 and b=$1)`, [u.id, o.id]);
    if (!d.rowCount) throw new ApiErr('not_found', 404);
    await t.query(`delete from notifs where type in ('rel_req','rel_ok') and ((actor=$1 and to_user=$2) or (actor=$2 and to_user=$1))`, [u.id, o.id]);
  });
  return { ok: true };
});

// ---------- profil ----------
route('GET', /^\/users\/([a-z0-9_]+)$/, async (c, m) => {
  const u = await one(`select * from users where username=$1 and status='active'`, [m[1]]);
  if (!u) throw new ApiErr('not_found', 404);
  const uid = Number(u.id), vid = c.me ? Number(c.me.id) : 0, mine = vid === uid;
  const locked = !mine && !(await canSee(u.pvis, uid, vid));
  const rows = locked ? [] : await many(`${AUD_SQL} where a.owner=$2 and not a.pending ${mine ? '' : `and not a.hidden and (${audCond(FILTERS.join(',') + ',lbl')})`} order by a.id desc limit 200`, [vid, uid]);
  let rel = { status: 'none', type: '' };
  if (vid && !mine) {
    const r = await one(`select r.*, l.name label_name from rels r left join rel_labels l on l.id = case when r.a=$1 then r.la else r.lb end where (r.a=$1 and r.b=$2) or (r.a=$2 and r.b=$1)`, [vid, uid]);
    if (r) rel = { status: r.status === 'active' ? 'active' : Number(r.a) === Number(vid) ? 'out' : 'in', type: r.type, label: r.label_name ?? null };
  }
  return { user: await uv(u, c.me, c.today), audios: mine ? await addTo(rows.map(av), c.me) : rows.map(av), locked, rel };
});

route('POST', /^\/users\/([a-z0-9_]+)\/follow$/, async (c, m) => {
  const u = c.need();
  await hit(`fol:${u.id}`, 60, 60);
  const o = await one(`select id from users where username=$1 and status='active'`, [m[1]]);
  if (!o) throw new ApiErr('not_found', 404);
  if (Number(o.id) === Number(u.id)) throw new ApiErr('forbidden', 403);
  return tx(async (t) => {
    const d = await t.query('delete from follows where src=$1 and dst=$2', [u.id, o.id]);
    let following;
    if (d.rowCount) {
      following = false;
      await t.query('update users set followers=greatest(0, followers-1) where id=$1', [o.id]);
      await t.query('update users set following=greatest(0, following-1) where id=$1', [u.id]);
    } else {
      following = true;
      await t.query('insert into follows(src, dst) values ($1,$2)', [u.id, o.id]);
      await t.query('update users set followers=followers+1 where id=$1', [o.id]);
      await t.query('update users set following=following+1 where id=$1', [u.id]);
      await notify(t, Number(o.id), 'follow', u.id, null);
    }
    return { following, followers: (await t.query('select followers from users where id=$1', [o.id])).rows[0].followers };
  });
});

route('GET', /^\/users\/([a-z0-9_]+)\/follows$/, async (c, m) => {
  const o = await one(`select id from users where username=$1 and status='active'`, [m[1]]);
  if (!o) throw new ApiErr('not_found', 404);
  const followers = c.query.kind !== 'following';
  const rows = await many(
    `select u.* from follows f join users u on u.id = ${followers ? 'f.src' : 'f.dst'} where ${followers ? 'f.dst' : 'f.src'}=$1 and u.status='active' order by u.username limit 500`, [o.id]);
  return { users: rows.map(mini) };
});


// ---------- Hups: tulisan, banyak audio, komentar, simpan ----------
const cutPreview = (t) => {
  if (t.length <= PREVIEW) return t;
  let c = t.slice(0, PREVIEW);
  const i = c.lastIndexOf(' ');
  if (i > PREVIEW * 0.6) c = c.slice(0, i);
  return c.trimEnd();
};
async function putText(t) {
  if (t.length <= INLINE_TEXT) return { body: t, key: null };
  return { body: null, key: await putAudio('mongo', Buffer.from(t, 'utf8'), 'text/plain') };
}
async function readText(body, key) {
  if (body !== null && body !== undefined) return body;
  if (!key) return '';
  const b = await getAudio('mongo', key);
  return b ? b.toString('utf8') : '';
}
const okText = (v) => String(v ?? '').replace(/\r\n/g, '\n').trim();

/** Kunci semua berkas (audio, teks panjang) milik post/komentar untuk dihapus dari penyimpanan. */
async function blobsOf(postWhere, commentWhere, params) {
  const out = [];
  const add = (store, key) => { if (key) out.push({ store, key }); };
  for (const r of await many(`select a.store, a.blob_key, a.body_key from audios a where ${postWhere}`, params)) { add(r.store, r.blob_key); add('mongo', r.body_key); }
  for (const r of await many(`select pa.store, pa.blob_key from post_audios pa join audios a on a.id=pa.post_id where ${postWhere}`, params)) add(r.store, r.blob_key);
  for (const r of await many(`select c.body_key from comments c where ${commentWhere}`, params)) add('mongo', r.body_key);
  for (const r of await many(`select ca.store, ca.blob_key from comment_audios ca join comments c on c.id=ca.comment_id where ${commentWhere}`, params)) add(r.store, r.blob_key);
  return out;
}

async function accessRow(id) {
  return one(`select a.id, a.owner, a.rand, a.hidden, a.pending, a.in_hups, a.in_rand, a.store, a.blob_key, a.mime, u.pvis, u.status ostatus from audios a join users u on u.id=a.owner where a.id=$1`, [id]);
}
/** Boleh membuka post: pemilik, atau pemirsa yang masuk audiens post / profil pemilik, atau yang sudah menyorot/menyimpan. */
async function canOpen(a, vid) {
  if (vid && vid === Number(a.owner)) return true;
  if (a.hidden || a.pending || a.ostatus !== 'active') return false;
  let ok = false;
  if (audList(a.rand).includes('accounts')) ok = !!vid && !!(await one('select 1 from audio_to where audio_id=$1 and user_id=$2', [a.id, vid]));
  if (!ok) ok = await canSee(a.rand, Number(a.owner), vid, false);
  if (!ok && vid) ok = !!(await one('select 1 from likes where audio_id=$1 and user_id=$2 union select 1 from saves where post_id=$1 and user_id=$2', [a.id, vid]));
  return ok;
}
async function openPost(id, c) {
  const a = await accessRow(id);
  if (!a || !(await canOpen(a, c.me ? Number(c.me.id) : 0))) throw new ApiErr('not_found', 404);
  return a;
}
async function recount(postId) {
  await q("update audios set comments=(select count(*) from comments where post_id=$1 and not pending and ph_state='') where id=$1", [postId]);
}

/** Daftar URL media (hanya URL yang disimpan): http/https, ≤ 2048 huruf, tanpa duplikat, maks 100 sebagai batas anti-penyalahgunaan. */
function okMedia(v) {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new ApiErr('bad_request');
  const out = [];
  for (const x of v) {
    const s = String(x ?? '').trim();
    if (!s || s.length > 2048 || !/^https?:\/\/[^\s]+$/i.test(s)) throw new ApiErr('bad_request');
    if (!out.includes(s)) out.push(s);
  }
  if (out.length > 100) throw new ApiErr('too_long', 413);
  return out;
}

route('POST', /^\/posts$/, async (c) => {
  const u = c.need();
  await hit(`post:${u.id}`, 40, 3600);
  const b = c.body, text = okText(b.text);
  if (text.length > MAX_POST_TEXT) throw new ApiErr('too_long', 413);
  const n = b.audios === undefined ? 0 : parseInt(b.audios, 10); // 0 = hanya teks, 1 = satu audio (biasa atau backsound)
  if (n !== 0 && n !== 1) throw new ApiErr('need_audio');
  const media = okMedia(b.media);
  if (n === 0 && !text && !media.length) throw new ApiErr('empty');
  const bgm = n === 1 && b.bgm === true, bgmIdx = 0, inRand = true, inHups = true; // satu post tampil di Acak dan di Hups
  const rnd = parseAud(b.rand, false, true) ?? 'public';
  await ownLabels(u.id, rnd);
  const mentions = [...new Set((text.match(/@([a-z0-9_]{3,20})/g) || []).map((x) => x.slice(1)))].slice(0, 10);
  let to = [];
  if (audList(rnd).includes('accounts')) {
    const names = (Array.isArray(b.to) ? b.to : []).map((s) => String(s).trim().toLowerCase()).filter(Boolean).slice(0, 200);
    const us = names.length ? await many('select id from users where username = any($1) and id<>$2 and status=$3', [names, u.id, 'active']) : [];
    to = us.map((r) => r.id);
    if (!to.length) throw new ApiErr('need_accounts');
  }
  const { body, key } = await putText(text);
  let id;
  try {
    id = await tx(async (t) => {
      const r = await t.query(`insert into audios(owner, descr, secs, rand, pprof, created, body, body_key, body_len, in_rand, in_hups, n_audio, pending, bgm, mentions, bgm_idx, media) values ($1,$2,0,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb) returning id`,
        [u.id, cutPreview(text), rnd, b.pprof !== false, now(), body, key, text.length, inRand, inHups, n, n > 0, bgm, mentions.join(','), bgmIdx, JSON.stringify(media)]);
      for (const x of to) await t.query('insert into audio_to(audio_id, user_id) values ($1,$2)', [r.rows[0].id, x]);
      return Number(r.rows[0].id);
    });
  } catch (e) { if (key) await delAudio('mongo', key); throw e; }
  if (n === 0) await mentionNotify(id, u.id);
  if (PH_TAG.test(text) && await PH.accessOf(u.id)) { await q('update audios set ptag=true where id=$1', [id]); await PH.later(phipopReply(u, id, null, text)); }
  return { ok: true, id };
});

route('POST', /^\/posts\/(\d+)\/audio$/, async (c, m) => {
  const u = c.need();
  await hit(`pa:${u.id}`, 150, 3600);
  const a = await one('select id, owner, n_audio, store from audios where id=$1', [m[1]]);
  if (!a || Number(a.owner) !== Number(u.id)) throw new ApiErr('not_found', 404);
  const have = (a.store ? 1 : 0) + Number((await one('select count(*)::int n from post_audios where post_id=$1', [a.id])).n);
  if (have >= a.n_audio) throw new ApiErr('bad_request');
  const body = await readBody(c.req, MAX_AUDIO + 1024);
  if (!body.length || body.length > MAX_AUDIO) throw new ApiErr('too_big', 413);
  const mime = audioMime(body);
  if (!mime) throw new ApiErr('bad_file');
  const secs = Math.min(15, Math.max(1, parseInt(c.query.secs, 10) || 15));
  const store = storeFor(secs), key = await putAudio(store, body, mime);
  const dk = have === 0 ? deksAudio(body) : null; if (dk) logDeks(`u${u.id} post-audio`, dk);
  try {
    if (have === 0) await q('update audios set store=$2, blob_key=$3, mime=$4, secs=$5, ai=$6, ai_kind=$7, deks=$8 where id=$1', [a.id, store, key, mime, secs, dk.ai, dk.kind, brief(dk)]);
    else await q('insert into post_audios(post_id, idx, store, blob_key, mime, secs) values ($1,$2,$3,$4,$5,$6)', [a.id, have, store, key, mime, secs]);
    if (have + 1 >= a.n_audio) await q('update audios set pending=false where id=$1', [a.id]);
  } catch (e) { await delAudio(store, key); throw e; }
  if (have + 1 >= a.n_audio) await mentionNotify(a.id, u.id);
  return { ok: true, done: have + 1 >= a.n_audio };
});

route('GET', /^\/posts\/(\d+)$/, async (c, m) => {
  const vid = c.me ? Number(c.me.id) : 0;
  await openPost(m[1], c);
  const row = await one(`${AUD_SQL} where a.id=$2`, [vid, m[1]]);
  const full = await one('select body, body_key from audios where id=$1', [m[1]]);
  const p = (await addTo([av(row)], c.me))[0];
  const ex = await many('select idx, secs from post_audios where post_id=$1 order by idx', [m[1]]);
  for (const e of ex) if (p.files[e.idx]) p.files[e.idx].secs = e.secs;
  return { post: p, text: await readText(full.body, full.body_key) };
});

route('GET', /^\/hups$/, async (c) => {
  await hit(`hups:${c.me ? 'u' + c.me.id : c.ip}`, 240, 60);
  const f = filterOf(c.query.f);
  const vid = c.me ? c.me.id : 0, off = Math.min(2000, Math.max(0, Number(c.query.next) || 0));
  // Peringkat Hups (bobot tetap): waktu 35%, sorot 25%, komentar 25%, pencarian 15%. Tiap komponen bernilai 0..1.
  //  waktu     : makin baru makin tinggi (meluruh, separuh nilai tiap ~25 jam)
  //  sorot     : log(1+sorot) dibanding post terbaik di daftar yang sama (log agar satu post viral tidak menenggelamkan yang lain)
  //  komentar  : cara hitung sama dengan sorot
  //  pencarian : 1 bila penulis/isi post cocok dengan salah satu dari 20 pencarian terakhir si pembaca, selain itu 0
  const score = `(0.35 * exp(-((${now()} - a.created) / 3600000.0) / 36.0)
    + 0.25 * (ln(1 + a.likes) / greatest(ln(1 + max(a.likes) over ()), 1))
    + 0.25 * (ln(1 + a.comments) / greatest(ln(1 + max(a.comments) over ()), 1))
    + 0.15 * (case when exists(select 1 from (select sq from search_log where user_id=$1 order by id desc limit 20) z where position(z.sq in lower(coalesce(a.descr,'') || ' ' || coalesce(a.body,'') || ' ' || u.username || ' ' || u.name)) > 0) then 1 else 0 end))`;
  const rows = await many(
    `${AUD_SQL} where a.in_hups and not a.hidden and not a.pending and u.status='active' and (${audCond(f)} or (a.owner=$1 and ${HAS('public')} and '${f}'='public')) order by ${score} desc, a.id desc offset ${off} limit 21`,
    [vid]);
  const items = await addTo(rows.slice(0, 20).map(av), c.me);
  return { items, next: rows.length > 20 ? off + 20 : 0 };
});

route('POST', /^\/audios\/(\d+)\/save$/, async (c, m) => {
  const u = c.need();
  await hit(`save:${u.id}`, 120, 60);
  await openPost(m[1], c);
  const d = await q('delete from saves where user_id=$1 and post_id=$2', [u.id, m[1]]);
  if (d.rowCount) return { saved: false };
  await q('insert into saves(user_id, post_id, created) values ($1,$2,$3)', [u.id, m[1], now()]);
  return { saved: true };
});

route('GET', /^\/me\/sent$/, async (c) => {
  const u = c.need();
  const to = String(c.query.to ?? '').trim().toLowerCase();
  if (!to) {
    const rows = await many(`select x.username, x.name, x.av_ver, x.verified, count(*)::int n, max(a.created) last from audio_to t join audios a on a.id=t.audio_id join users x on x.id=t.user_id where a.owner=$1 and not a.pending group by x.username, x.name, x.av_ver, x.verified order by max(a.created) desc limit 200`, [u.id]);
    return { people: rows.map((r) => ({ ...mini(r), n: r.n })) };
  }
  const rows = await many(`${AUD_SQL} where a.owner=$1 and not a.pending and exists(select 1 from audio_to t join users x on x.id=t.user_id where t.audio_id=a.id and x.username=$2) order by a.id desc limit 200`, [u.id, to]);
  return { audios: rows.map(av) };
});

route('GET', /^\/me\/saved$/, async (c) => {
  const u = c.need();
  const rows = await many(`${AUD_SQL} join saves sv on sv.post_id=a.id and sv.user_id=$1 where not a.hidden and not a.pending and u.status='active' order by sv.created desc limit 200`, [u.id]);
  return { audios: rows.map(av) };
});

// ----- tag (@nama) -----
const mentionsOf = (t) => [...new Set((String(t || '').match(/@([a-z0-9_]{3,20})/g) || []).map((x) => x.slice(1)))].slice(0, 10);
/** Beri notifikasi "menyebut" ke akun yang di-tag (hanya yang boleh membuka post), kecuali yang sudah dapat notifikasi lain. */
async function mentionNotify(postId, actorId, names = null, skip = [], snippet = '') {
  const post = await one('select id, owner, mentions from audios where id=$1', [postId]);
  if (!post) return;
  const list = names ?? String(post.mentions || '').split(',').filter(Boolean);
  if (!list.length) return;
  const users = await many(`select id from users where username = any($1) and status='active'`, [list]);
  const row = await accessRow(postId);
  for (const x of users) {
    const id = Number(x.id);
    if (id === Number(actorId) || skip.includes(id)) continue;
    if (!(await canOpen(row, id))) continue;
    await tx(async (t) => { await notify(t, id, 'mention', actorId, Number(postId), snippet); });
  }
}

// ----- komentar -----
function cv(r, me, files) {
  return {
    id: Number(r.id), parent: r.parent ? Number(r.parent) : 0, username: r.username, name: r.name,
    avatar: r.av_ver > 0 ? `/users/${r.username}/avatar?v=${r.av_ver}` : null, verified: r.verified,
    text: r.body, long: !!r.body_key, audios: files || [],
    audio: files && files.length ? files[0] : null,
    likes: r.likes, liked: r.liked === true, created: Number(r.created), mine: !!me && Number(r.owner) === Number(me.id),
    pinned: r.pinned === true, ptag: r.ptag === true, ph: r.ph_state || '',
  };
}
const CMT_SQL = `select c.id, c.parent, c.owner, c.body, c.body_key, c.likes, c.created, c.pinned, c.ptag, c.ph_state, u.username, u.name, u.av_ver, u.verified,
  exists(select 1 from comment_likes l where l.comment_id=c.id and l.user_id=$2) liked from comments c join users u on u.id=c.owner`;

route('GET', /^\/posts\/(\d+)\/comments$/, async (c, m) => {
  await openPost(m[1], c);
  const rows = await many(`${CMT_SQL} where c.post_id=$1 and not c.pending and u.status='active' and not (c.ph_state<>'' and c.created < $3) order by c.id asc limit 500`, [m[1], c.me ? c.me.id : 0, now() - 150000]);
  const fl = await many(`select ca.comment_id, ca.idx, ca.secs from comment_audios ca join comments c on c.id=ca.comment_id where c.post_id=$1 order by ca.comment_id, ca.idx`, [m[1]]);
  const by = new Map();
  for (const f of fl) { const k = Number(f.comment_id); if (!by.has(k)) by.set(k, []); by.get(k).push({ url: `/comments/${k}/file?i=${f.idx}`, secs: f.secs }); }
  return { items: rows.map((r) => cv(r, c.me, by.get(Number(r.id)))) };
});

route('POST', /^\/posts\/(\d+)\/comments$/, async (c, m) => {
  const u = c.need();
  await hit(`cm:${u.id}`, 40, 600);
  const post = await openPost(m[1], c);
  const text = okText(c.body.text);
  if (text.length > MAX_TEXT) throw new ApiErr('too_long', 413);
  const na = 0; // komentar tidak boleh berisi audio
  if (!text) throw new ApiErr('empty');
  let parent = null, parentOwner = null;
  if (c.body.parent) {
    const pr = await one('select id, owner from comments where id=$1 and post_id=$2 and not pending', [c.body.parent, post.id]);
    if (!pr) throw new ApiErr('not_found', 404);
    parent = pr.id; parentOwner = Number(pr.owner);
  }
  const body = text.length <= INLINE_TEXT ? text : cutPreview(text);
  const key = text.length <= INLINE_TEXT ? null : await putAudio('mongo', Buffer.from(text, 'utf8'), 'text/plain');
  const snip = (text || '').slice(0, 80);
  let id;
  try {
    id = await tx(async (t) => {
      const r = await t.query('insert into comments(post_id, owner, parent, body, body_key, body_len, pending, n_audio, created) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id', [post.id, u.id, parent, body, key, text.length, na > 0, na, now()]);
      if (parentOwner) await notify(t, parentOwner, 'reply', u.id, Number(post.id), snip);
      if (Number(post.owner) !== parentOwner) await notify(t, Number(post.owner), 'comment', u.id, Number(post.id), snip);
      return Number(r.rows[0].id);
    });
  } catch (e) { if (key) await delAudio('mongo', key); throw e; }
  await recount(post.id);
  await mentionNotify(post.id, u.id, mentionsOf(text), [parentOwner, Number(post.owner)].filter(Boolean), snip);
  const tagged = PH_TAG.test(text) && await PH.accessOf(u.id);
  if (tagged) await q('update comments set ptag=true where id=$1', [id]);
  // 10 komentar pertama di postingan Phipop dijawab otomatis: siapa pun, tanpa akses, tanpa tag
  let auto = false;
  const phu = await PH.phipopUser();
  if (phu && Number(post.owner) === Number(phu.id) && u.username !== PH.PH_USER) auto = Number((await one(`select count(*)::int n from comments c join users cu on cu.id=c.owner where c.post_id=$1 and c.id<=$2 and cu.username<>$3 and not c.pending`, [post.id, id, PH.PH_USER])).n) <= 10;
  if (auto || tagged) await PH.later(phipopReply(u, post.id, id, text, auto));
  return { ok: true, id };
});

route('POST', /^\/comments\/(\d+)\/audio$/, async (c, m) => {
  c.need();
  throw new ApiErr('no_comment_audio', 400);
  // eslint-disable-next-line no-unreachable
  const u = c.need();
  await hit(`ca:${u.id}`, 90, 3600);
  const r = await one('select id, owner, post_id, pending, n_audio from comments where id=$1', [m[1]]);
  if (!r || Number(r.owner) !== Number(u.id) || !r.pending) throw new ApiErr('not_found', 404);
  const have = Number((await one('select count(*)::int n from comment_audios where comment_id=$1', [r.id])).n);
  if (have >= r.n_audio) throw new ApiErr('bad_request');
  const body = await readBody(c.req, MAX_AUDIO + 1024);
  if (!body.length || body.length > MAX_AUDIO) throw new ApiErr('too_big', 413);
  const mime = audioMime(body);
  if (!mime) throw new ApiErr('bad_file');
  const secs = Math.min(15, Math.max(1, parseInt(c.query.secs, 10) || 15));
  const store = storeFor(secs), key = await putAudio(store, body, mime);
  try {
    await q('insert into comment_audios(comment_id, idx, store, blob_key, mime, secs) values ($1,$2,$3,$4,$5,$6)', [r.id, have, store, key, mime, secs]);
    if (have + 1 >= r.n_audio) await q('update comments set pending=false where id=$1', [r.id]);
  } catch (e) { await delAudio(store, key); throw e; }
  if (have + 1 >= r.n_audio) await recount(r.post_id);
  return { ok: true, done: have + 1 >= r.n_audio };
});

route('GET', /^\/comments\/(\d+)\/(file|text)$/, async (c, m) => {
  const r = await one('select id, post_id, body, body_key, pending, owner from comments where id=$1', [m[1]]);
  if (!r || (r.pending && (!c.me || Number(c.me.id) !== Number(r.owner)))) throw new ApiErr('not_found', 404);
  await openPost(r.post_id, c);
  if (m[2] === 'text') return { text: await readText(r.body_key ? null : r.body, r.body_key) };
  const f = await one('select store, blob_key, mime from comment_audios where comment_id=$1 and idx=$2', [r.id, parseInt(c.query.i, 10) || 0]);
  if (!f) throw new ApiErr('not_found', 404);
  const b = await getAudio(f.store, f.blob_key);
  if (!b) throw new ApiErr('not_found', 404);
  return { binary: b, mime: f.mime, cache: 'private, max-age=86400' };
});

// Pemilik post menyematkan satu komentar utama (menekan lagi = lepas).
route('POST', /^\/comments\/(\d+)\/pin$/, async (c, m) => {
  const u = c.need();
  const r = await one('select c.id, c.post_id, c.parent, c.pinned, c.pending, a.owner post_owner from comments c join audios a on a.id=c.post_id where c.id=$1', [m[1]]);
  if (!r || r.pending) throw new ApiErr('not_found', 404);
  if (Number(r.post_owner) !== Number(u.id)) throw new ApiErr('forbidden', 403);
  if (r.parent) throw new ApiErr('bad_request');
  const on = !r.pinned;
  await tx(async (t) => {
    await t.query('update comments set pinned=false where post_id=$1', [r.post_id]);
    if (on) await t.query('update comments set pinned=true where id=$1', [r.id]);
  });
  return { pinned: on };
});

route('DELETE', /^\/comments\/(\d+)$/, async (c, m) => {
  const u = c.need();
  const r = await one('select c.id, c.owner, c.post_id, a.owner post_owner from comments c join audios a on a.id=c.post_id where c.id=$1', [m[1]]);
  if (!r) throw new ApiErr('not_found', 404);
  if (Number(r.owner) !== Number(u.id) && Number(r.post_owner) !== Number(u.id)) throw new ApiErr('forbidden', 403);
  const tree = `with recursive t as (select id, body_key from comments where id=$1 union all select c.id, c.body_key from comments c join t on c.parent=t.id)`;
  const bl = [
    ...(await many(`${tree} select body_key from t where body_key is not null`, [r.id])).map((x) => ({ store: 'mongo', key: x.body_key })),
    ...(await many(`${tree} select ca.store, ca.blob_key from comment_audios ca join t on t.id=ca.comment_id`, [r.id])).map((x) => ({ store: x.store, key: x.blob_key })),
  ];
  await q('delete from comments where id=$1', [r.id]);
  await recount(r.post_id);
  await Promise.all(bl.map((b) => delAudio(b.store, b.key)));
  return { ok: true };
});

route('POST', /^\/comments\/(\d+)\/like$/, async (c, m) => {
  const u = c.need();
  await hit(`cl:${u.id}`, 120, 60);
  const r = await one('select id, post_id from comments where id=$1 and not pending', [m[1]]);
  if (!r) throw new ApiErr('not_found', 404);
  await openPost(r.post_id, c);
  return tx(async (t) => {
    const d = await t.query('delete from comment_likes where user_id=$1 and comment_id=$2', [u.id, r.id]);
    let liked;
    if (d.rowCount) { liked = false; await t.query('update comments set likes=greatest(0, likes-1) where id=$1', [r.id]); }
    else { liked = true; await t.query('insert into comment_likes(user_id, comment_id) values ($1,$2)', [u.id, r.id]); await t.query('update comments set likes=likes+1 where id=$1', [r.id]); }
    return { liked, likes: (await t.query('select likes from comments where id=$1', [r.id])).rows[0].likes };
  });
});


// ---------- Phipop (AI) ----------
const needAdmin = (c) => { const u = c.need(); if (u.role !== 'admin') throw new ApiErr('forbidden', 403); return u; };
const phStatus = async (u) => ({ ...PH.statusOf(await PH.accessOf(u.id), await one(`select 1 x from phipop_requests where user_id=$1 and status='pending'`, [u.id])), admin: u.role === 'admin' });

route('GET', /^\/phipop\/status$/, async (c) => ({ ok: true, ...(await phStatus(c.need())) }));

route('POST', /^\/phipop\/request$/, async (c) => {
  const u = c.need(); await hit(`phq:${u.id}`, 5, 3600);
  const why = okText(c.body.why).slice(0, 600);
  if (!why) throw new ApiErr('empty');
  if (await PH.accessOf(u.id)) throw new ApiErr('phipop_has', 409);
  if (await one(`select 1 x from phipop_requests where user_id=$1 and status='pending'`, [u.id])) throw new ApiErr('phipop_requested', 409);
  await q('insert into phipop_requests(user_id, why, created) values ($1,$2,$3)', [u.id, why, now()]);
  return { ok: true };
});

route('POST', /^\/phipop\/redeem$/, async (c) => {
  const u = c.need(); await hit(`phr:${u.id}`, 10, 3600);
  const code = String(c.body.code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (code.length !== 12) throw new ApiErr('phipop_code_bad', 400);
  const full = `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8)}`;
  await tx(async (t) => {
    if ((await t.query('select 1 from phipop_access where user_id=$1', [u.id])).rows.length) throw new ApiErr('phipop_has', 409);
    const r = await t.query('update phipop_codes set used_by=$1, used_at=$2 where code=$3 and to_user=$1 and used_by is null returning code', [u.id, now(), full]);
    if (!r.rows.length) throw new ApiErr('phipop_code_bad', 400);
    await t.query('insert into phipop_access(user_id, code, granted) values ($1,$2,$3)', [u.id, full, now()]);
  });
  return { ok: true, ...(await phStatus(u)) };
});

const chatRow = (r) => ({ id: Number(r.id), role: r.role, text: r.body, created: Number(r.created), status: r.status, steps: r.steps || [], links: r.links || [],
  ...(r.rp_id ? { reply: { id: Number(r.rp_id), role: r.rp_role, text: String(r.rp_body || '').slice(0, 140) } } : {}) });
const CHAT_SQL = 'select c.id, c.role, c.body, c.created, c.status, c.steps, c.links, p.id rp_id, p.role rp_role, p.body rp_body from phipop_chat c left join phipop_chat p on p.id=c.reply_to and p.user_id=c.user_id';
route('GET', /^\/phipop\/chat$/, async (c) => {
  const u = c.need();
  if (!(await PH.accessOf(u.id))) throw new ApiErr('phipop_locked', 403);
  await PH.reapChat(u.id);
  const rows = await many(CHAT_SQL + ' where c.user_id=$1 order by c.id desc limit 40', [u.id]);
  return { ok: true, items: rows.reverse().map(chatRow), ...(await phStatus(u)) };
});
/** Progres satu jawaban (di-poll saat Phipop sedang mencari). */
route('GET', /^\/phipop\/chat\/(\d+)$/, async (c, m) => {
  const u = c.need();
  await PH.reapChat(u.id);
  const r = await one(CHAT_SQL + ' where c.id=$1 and c.user_id=$2', [m[1], u.id]);
  if (!r) throw new ApiErr('not_found', 404);
  return { ok: true, item: chatRow(r), ...(r.status !== 'run' ? await phStatus(u) : {}) };
});
route('POST', /^\/phipop\/chat$/, async (c) => {
  const u = c.need(); await hit(`phc:${u.id}`, 30, 600);
  const txt = okText(c.body.text);
  const ctx = await PH.buildContext(txt.slice(0, PH.PH_MAX_IN));
  if (c.body.async === true) { // klien baru: balik cepat, progres di-poll lewat GET /phipop/chat/:id
    let replyTo = 0;
    if (c.body.reply_to) { const rp = await one('select id from phipop_chat where id=$1 and user_id=$2', [Number(c.body.reply_to) || 0, u.id]); if (rp) replyTo = Number(rp.id); }
    const j = await PH.chatStart(u.id, txt, ctx, replyTo, `@${u.username}${u.name ? ` (nama tampil: ${String(u.name).slice(0, 40)})` : ''}`); await PH.later(j.job);
    const rows = await many(CHAT_SQL + ' where c.user_id=$1 order by c.id desc limit 2', [u.id]);
    return { ok: true, id: j.id, items: rows.reverse().map(chatRow), ...(await phStatus(u)) };
  }
  const r = await PH.askFull(u.id, txt, { chat: true, ctx });
  return { ok: true, reply: r.reply, links: r.links, ...(await phStatus(u)) };
});
route('DELETE', /^\/phipop\/chat$/, async (c) => { const u = c.need(); await q('delete from phipop_chat where user_id=$1', [u.id]); return { ok: true }; }); // memori jangka panjang tetap ada

// admin (hanya akun ber-role admin): tinjau permintaan, kirim kode lewat notifikasi, atur pengecualian batas
/** Phipop memposting sendiri (cron 07.00/21.00 WIB atau perintah qih). Tanpa audio, hanya teks + URL sumber. */
async function phipopPublish(ph, p) {
  const text = okText(p.text), media = okMedia(p.media);
  const { body, key } = await putText(text);
  const mentions = [...new Set((text.match(/@([a-z0-9_]{3,20})/g) || []).map((x) => x.slice(1)))].filter((x) => x !== PH.PH_USER).slice(0, 10);
  const id = await tx(async (t) => Number((await t.query(`insert into audios(owner, descr, secs, rand, pprof, created, body, body_key, body_len, in_rand, in_hups, n_audio, pending, bgm, mentions, bgm_idx, media) values ($1,$2,0,'public',true,$3,$4,$5,$6,true,true,0,false,false,$7,0,$8::jsonb) returning id`,
    [ph.id, cutPreview(text), now(), body, key, text.length, mentions.join(','), JSON.stringify(media)])).rows[0].id));
  await mentionNotify(id, ph.id);
  return id;
}
async function phipopAutoPost(slot, hint = '', log = true) {
  const ph = await PH.phipopUser(); if (!ph) throw new ApiErr('not_found', 404);
  const wib = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  let logId = null;
  if (log) { const r = await one('insert into phipop_posts(day, slot, created) values ($1,$2,$3) on conflict do nothing returning id', [wib, slot, now()]); if (!r) return { ok: true, skipped: true }; logId = r.id; }
  let draft = null;
  try { draft = await PH.composePost(slot, hint); } catch (e) { console.error('phipop post', e?.message); }
  if (!draft) { if (logId) await q('delete from phipop_posts where id=$1', [logId]); throw new ApiErr('phipop_busy', 503); }
  const id = await phipopPublish(ph, draft);
  if (logId) await q('update phipop_posts set post_id=$2 where id=$1', [logId, id]);
  return { ok: true, id };
}
route('GET', /^\/phipop\/admin\/posts$/, async (c) => {
  needAdmin(c);
  const ph = await PH.phipopUser();
  const rows = await many(`select a.id, a.descr, a.body, a.body_key, a.body_len, a.created, a.likes, a.comments, a.media from audios a where a.owner=$1 order by a.id desc limit 30`, [ph.id]);
  return { items: await Promise.all(rows.map(async (r) => ({ id: Number(r.id), text: r.body_key ? await PH.postBody(r) : (r.body ?? r.descr), created: Number(r.created), likes: r.likes, comments: r.comments, media: r.media || [] }))) };
});
route('POST', /^\/phipop\/admin\/post$/, async (c) => {
  needAdmin(c); await hit(`phpost:${c.me.id}`, 12, 3600);
  const text = okText(c.body.text);
  if (text) { const ph = await PH.phipopUser(); return { ok: true, id: await phipopPublish(ph, { text, media: c.body.media }) }; }
  return phipopAutoPost('pm', String(c.body.hint ?? ''), false);
});
route('POST', /^\/phipop\/admin\/posts\/(\d+)\/replace$/, async (c, m) => {
  needAdmin(c); await hit(`phrep:${c.me.id}`, 20, 3600);
  const ph = await PH.phipopUser();
  const old = await one('select id, body_key from audios where id=$1 and owner=$2', [m[1], ph.id]);
  if (!old) throw new ApiErr('not_found', 404);
  let text = okText(c.body.text), media = okMedia(c.body.media);
  if (!text) { const d = await PH.composePost('pm', String(c.body.hint ?? '')); if (!d) throw new ApiErr('phipop_busy', 503); text = d.text; media = d.media; }
  const { body, key } = await putText(text);
  await q('update audios set descr=$2, body=$3, body_key=$4, body_len=$5, media=$6::jsonb where id=$1', [old.id, cutPreview(text), body, key, text.length, JSON.stringify(media)]);
  if (old.body_key) await delAudio('mongo', old.body_key);
  return { ok: true, id: Number(old.id) };
});
route('DELETE', /^\/phipop\/admin\/posts\/(\d+)$/, async (c, m) => {
  needAdmin(c);
  const ph = await PH.phipopUser();
  const own = await one('select id from audios where id=$1 and owner=$2', [m[1], ph.id]);
  if (!own) throw new ApiErr('not_found', 404);
  const bl = await blobsOf('a.id=$1', 'c.post_id=$1', [own.id]);
  await q('delete from audios where id=$1', [own.id]);
  await Promise.all(bl.map((b) => delAudio(b.store, b.key)));
  return { ok: true };
});
route('GET', /^\/phipop\/admin$/, async (c) => {
  needAdmin(c);
  const reqs = await many(`select r.id, r.why, r.status, r.created, u.username, u.name from phipop_requests r join users u on u.id=r.user_id order by (r.status='pending') desc, r.created desc limit 100`);
  const acc = await many(`select u.username, u.name, a.exempt, a.lim, a.used, a.win_start, a.code is not null has_code from phipop_access a join users u on u.id=a.user_id order by a.granted desc limit 200`);
  return { requests: reqs.map((r) => ({ id: Number(r.id), username: r.username, name: r.name, why: r.why, status: r.status, created: Number(r.created) })),
    access: acc.map((a) => ({ username: a.username, name: a.name, exempt: a.exempt, lim: a.lim, used: a.used, has_code: a.has_code })) };
});
route('POST', /^\/phipop\/admin\/send$/, async (c) => {
  needAdmin(c);
  const ph = await PH.phipopUser(); if (!ph) throw new ApiErr('not_found', 404);
  let uname = String(c.body.username ?? '').toLowerCase();
  const rid = Number(c.body.request_id) || null;
  if (!uname && rid) uname = (await one('select u.username from phipop_requests r join users u on u.id=r.user_id where r.id=$1', [rid]))?.username ?? '';
  const o = await one(`select id, username from users where username=$1 and status='active'`, [uname]);
  if (!o) throw new ApiErr('not_found', 404);
  if (await PH.accessOf(o.id)) throw new ApiErr('phipop_has', 409);
  await q('delete from phipop_codes where to_user=$1 and used_by is null', [o.id]); // kode lama yang belum dipakai hangus
  const code = await PH.newCode(o.id);
  await tx(async (t) => {
    await t.query(`insert into notifs(to_user, type, actor, extra, created) values ($1,'phipop_code',$2,$3,$4)`, [o.id, ph.id, code, now()]);
    await t.query(`update phipop_requests set status='sent' where user_id=$1 and status='pending'`, [o.id]);
  });
  pushLater(Number(o.id), 'phipop_code', Number(ph.id), '');
  return { ok: true, username: o.username, code };
});
route('POST', /^\/phipop\/admin\/reject$/, async (c) => { needAdmin(c); await q(`update phipop_requests set status='rejected' where id=$1 and status='pending'`, [Number(c.body.request_id) || 0]); return { ok: true }; });
route('POST', /^\/phipop\/admin\/grant$/, async (c) => {
  needAdmin(c);
  const o = await one(`select id from users where username=$1 and status='active'`, [String(c.body.username ?? '').toLowerCase()]);
  if (!o) throw new ApiErr('not_found', 404);
  if (c.body.revoke === true) { await q('delete from phipop_access where user_id=$1', [o.id]); return { ok: true }; }
  const lim = c.body.lim === null || c.body.lim === undefined || c.body.lim === '' ? null : Math.max(1, Math.min(10000, Number(c.body.lim) | 0));
  await q(`insert into phipop_access(user_id, granted, exempt, lim) values ($1,$2,$3,$4) on conflict (user_id) do update set exempt=$3, lim=$4`, [o.id, now(), c.body.exempt === true, lim]);
  return { ok: true };
});

/** Tag @phipop di post/komentar: jawab sebagai komentar (hanya bila pengirim punya akses). */
const PH_TAG = /(^|[^a-z0-9_])@phipop(?![a-z0-9_])/i;
async function phipopReply(u, postId, parentId, text, free = false) {
  let ph = null, cid = 0;
  try {
    ph = await PH.phipopUser(); if (!ph || Number(u.id) === Number(ph.id)) return;
    const post = await one(`select a.id, a.rand, a.body, a.body_key, a.descr, o.username ou from audios a join users o on o.id=a.owner where a.id=$1`, [postId]);
    if (!post) return;
    const clean = String(text).replace(/@phipop(?![a-z0-9_])/ig, '').trim() || 'halo';
    // balasan langsung muncul sebagai komentar "sedang mikir/mencari" (animasi), lalu diisi saat jawaban jadi
    cid = Number((await one(`insert into comments(post_id, owner, parent, body, body_len, pending, n_audio, created, ph_state) values ($1,$2,$3,'',0,false,0,$4,'run:mikir') returning id`, [postId, ph.id, parentId, now()])).id);
    const label = (st) => { const x = st[st.length - 1]; return x ? `run:${x.k}|${x.t}`.slice(0, 120) : 'run:mikir'; };
    const ctx = [await PH.buildThread(Number(postId)), await PH.buildContext(clean.slice(0, PH.PH_MAX_IN))].filter(Boolean).join('\n');
    const priv = !String(post.rand || 'public').split(',').includes('public');
    let reply, links = [];
    try {
      const r = await PH.askFull(u.id, clean, { ctx, allowId: Number(postId), who: `@${u.username}`, where: 'komentar', priv, free, onStep: (st) => { q('update comments set ph_state=$2 where id=$1', [cid, label(st)]).catch(() => {}); } });
      reply = r.reply; links = r.links;
    } catch (e) { if (e.code === 'phipop_limit') reply = 'jatah lu abis dulu. nunggu reset, sabar dikit napa.'; else throw e; }
    const web = links.filter((x) => !/hulhup\.my\.id\/p\//.test(x)), hul = links.find((x) => /hulhup\.my\.id\/p\//.test(x));
    const body = (reply + (hul && !priv && /\b(post|ini|itu)\b/i.test(reply) ? `\n${hul}` : '') + (web.length ? '\n' + web.slice(0, 3).join('\n') : '')).slice(0, 4000);
    await tx(async (t) => {
      await t.query(`update comments set body=$2, body_len=$3, ph_state='', created=$4 where id=$1`, [cid, body, body.length, now()]);
      await notify(t, Number(u.id), parentId ? 'reply' : 'comment', Number(ph.id), Number(postId), reply.slice(0, 80));
    });
    await recount(postId);
  } catch (e) { if (cid) await q('delete from comments where id=$1', [cid]).catch(() => {}); }
}

/** Diagnostik internal hanya untuk pemegang CRON_SECRET. */
function cronOk(req, url) {
  const k = process.env.CRON_SECRET; if (!k) return false;
  const got = Buffer.from(String(req.headers.authorization || '').replace('Bearer ', '') || String(url.searchParams.get('key') || ''));
  const ka = Buffer.from(k);
  return got.length === ka.length && timingSafeEqual(got, ka);
}

export async function handle(req, url) {
  const m0 = req.method;
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (path === '/cron/phipop-post') {
    if (!cronOk(req, url)) throw new ApiErr('unauthorized', 401);
    return phipopAutoPost(url.searchParams.get('slot') === 'pm' ? 'pm' : 'am');
  }
  if (path === '/cron/reminder') {
    const k = process.env.CRON_SECRET, got = String(req.headers.authorization || '').replace('Bearer ', '') || url.searchParams.get('key');
    const ga = Buffer.from(String(got)), ka = Buffer.from(String(k || ''));
    if (!k || ga.length !== ka.length || !timingSafeEqual(ga, ka)) throw new ApiErr('unauthorized', 401);
    return { ok: true, ...(await pushReminders()) };
  }
  if (path === '/' || path === '/health') { if (url.searchParams.get('warm')) await one('select 1 as x'); if (url.searchParams.get('push') && cronOk(req, url)) return { ok: true, push: await pushDiag() }; return { ok: true, service: 'hulhup-api' }; }
  if (path === '/deks/selftest') { if (!cronOk(req, url)) throw new ApiErr('not_found', 404); return runSelfTest(); }
  await ensureOfficial();
  const me = await authUser(req);
  const ip = ipOf(req);
  if (!/^\/users\/[a-z0-9_]+\/(avatar|cover)$/.test(path)) await hit(`ip:${ip}`, 600, 60); // foto profil di-cache lama; tidak dihitung agar daftar panjang tidak terblokir
  const query = Object.fromEntries(url.searchParams);
  const ctx = { req, me, ip, query, today: todayOf(req), body: {}, need() { if (!me) throw new ApiErr('unauthorized', 401); return me; } };
  for (const [method, re, fn] of routes) {
    if (method !== m0) continue;
    const m = re.exec(path);
    if (!m) continue;
    if (['POST', 'PATCH'].includes(m0) && String(req.headers['content-type'] || '').includes('json')) {
      const raw = await readBody(req, /^\/(posts|comments)/.test(path) ? 1024 * 1024 : 64 * 1024);
      try { ctx.body = raw.length ? JSON.parse(raw.toString('utf8')) : {}; } catch { throw new ApiErr('bad_file'); }
      if (typeof ctx.body !== 'object' || ctx.body === null || Array.isArray(ctx.body)) ctx.body = {};
    }
    try { return await fn(ctx, m); } catch (e) {
      if (e && typeof e.code === 'string' && /^22/.test(e.code)) throw new ApiErr('bad_request', 400); // masukan tak valid untuk tipe kolom
      throw e;
    }
  }
  throw new ApiErr('not_found', 404);
}
