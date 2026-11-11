// Hulhup API: akun, audio acak dengan filter ketat, hubungan dua pihak, notifikasi.
// Semua izin ditegakkan di sini. Tidak ada endpoint admin: moderasi hanya lewat database.
import { q, one, many, tx } from './db.js';
import { ApiErr, now, sha, token, hashPw, checkPw, dayStr, okBirth, ageOf, imageMime, audioMime, readBody } from './util.js';
import { storeFor, putAudio, getAudio, delAudio } from './blobs.js';
import { randomInt } from 'node:crypto';
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
const MAX_TEXT = 200000, MAX_POST_TEXT = 1000, INLINE_TEXT = 3000, PREVIEW = 300; // post: 1 audio wajib + teks maks 1000; komentar: teks saja, panjang bebas
const FILTERS = ['public', 'followers', 'following', 'both', 'friend', 'best', 'partner', 'family', 'relations', 'me'];
const REL_TYPES = ['friend', 'best', 'partner', 'family'];
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
  const out = [...new Set(raw.map((e) => String(e).trim()).filter((e) => ok.has(e)))];
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
    default: return 'false';
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
  const relMode = modes.filter((e) => ['friend', 'best', 'partner', 'family', 'relations'].includes(e));
  if (relMode.length) {
    const r = await one(`select type from rels where status='active' and ((a=$1 and b=$2) or (a=$2 and b=$1))`, [viewerId, ownerId]);
    if (r && (relMode.includes('relations') || relMode.includes(r.type))) return true;
  }
  if (modes.some((e) => ['followers', 'following', 'both'].includes(e))) {
    const r = await one(`select ${FOLLOW('$1', '$2')} as fol, ${FOLLOW('$2', '$1')} as ing`, [viewerId, ownerId]);
    if (modes.includes('followers') && r.fol) return true;
    if (modes.includes('following') && r.ing) return true;
    if (modes.includes('both') && (r.fol || r.ing)) return true;
  }
  return false;
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
    avatar: avUrl(u), avatar_ai: u.av_ver > 0 && u.av_ai === true, avatar_ai_kind: u.av_ver > 0 && u.av_ai === true ? (u.av_ai_kind || 'made') : '', cover: cvUrl(u), taps: mine ? Number(u.taps) : 0, pvis: mine ? u.pvis : '', rvis: mine ? (u.rvis || 'public') : '',
    streak: streakOf(u, today), days: mine ? u.days : 0,
    followers: u.followers, following: u.following, audios: r.audios, is_following: r.isf, is_me: mine, verified: u.verified,
  };
}

const AUD_SQL = `select a.id, a.descr, a.secs, a.pprof, a.rand, a.created, a.likes, a.owner, a.body_len, a.in_rand, a.in_hups, a.n_audio, a.comments, a.bgm, a.bgm_idx, a.ai, a.ai_kind, a.body btext, u.username ou, u.name oname, u.av_ver oav, u.av_ai oai, u.av_ai_kind oaik, u.verified ov, u.pvis opvis,
  exists(select 1 from likes l where l.audio_id=a.id and l.user_id=$1) liked, exists(select 1 from saves sv where sv.post_id=a.id and sv.user_id=$1) saved from audios a join users u on u.id=a.owner`;

function av(a) {
  const na = a.n_audio ?? 1;
  const files = Array.from({ length: na }, (_, i) => ({ url: `/audios/${a.id}/file${i ? `?i=${i}` : ''}`, secs: i === 0 ? a.secs : 0 }));
  return {
    id: Number(a.id), desc: a.descr, secs: a.secs, popup: true, vis: 'public', url: files.length ? files[0].url : '', pprof: a.pprof, rand: a.rand,
    created: Number(a.created), likes: a.likes, liked: a.liked, owner: a.ou, owner_name: a.oname,
    owner_avatar: a.oav > 0 ? `/users/${a.ou}/avatar?v=${a.oav}` : null, owner_avatar_ai: a.oav > 0 && a.oai === true, owner_avatar_ai_kind: a.oav > 0 && a.oai === true ? (a.oaik || 'made') : '', ai: a.ai === true, ai_kind: a.ai === true ? (a.ai_kind || 'made') : '', owner_verified: a.ov,
    long: Number(a.body_len || 0) > String(a.descr || '').length, in_rand: a.in_rand !== false, in_hups: a.in_hups === true,
    files, comments: a.comments || 0, saved: a.saved === true,
    bgm: a.bgm === true, bgm_idx: a.bgm_idx || 0, text: a.btext ?? null,
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
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'x';
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
  if (!u || !(await checkPw(String(c.body.password ?? '').trim(), u.pass_salt, u.pass_hash))) throw new ApiErr('bad_credentials', 401);
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
  if (!u || !u.rec_hash || code.length !== 12 || !(await checkPw(code, u.rec_salt, u.rec_hash))) throw new ApiErr('bad_recovery', 401);
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

route('GET', /^\/stats$/, async (c) => ({ taps: c.me ? Number(c.me.taps) : 0, tapf: c.me ? (c.me.tapf || {}) : {} }));

route('GET', /^\/random$/, async (c) => {
  await hit(`rnd:${c.me ? 'u' + c.me.id : c.ip}`, 120, 60);
  const f = filterOf(c.query.f);
  const vid = c.me ? c.me.id : 0, last = Number(c.query.last) || 0;
  const base = `from audios a join users u on u.id=a.owner where not a.hidden and not a.pending and a.in_rand and a.n_audio>0 and u.status='active' and (${audCond(f)} or (a.owner=$1 and ${HAS('public')} and '${f}'='public'))`;
  let n = (await one(`select count(*)::int n ${base} and a.id<>$2`, [vid, last])).n;
  let excl = true;
  if (n === 0) { n = (await one(`select count(*)::int n ${base} and ($2=$2)`, [vid, last])).n; excl = false; }
  let taps = c.me ? Number((c.me.tapf || {})[f] || 0) : 0;
  if (n === 0) return { taps, audio: null }; // belum ada audio: angka tidak bertambah
  const off = randomInt(n); // acak sungguhan (CSPRNG), peluang sama
  const row = await one(`select a.id ${base} and ${excl ? 'a.id<>$2' : '$2=$2'} order by a.id offset ${off} limit 1`, [vid, last]);
  const a = await one(`${AUD_SQL} where a.id=$2`, [vid, row.id]);
  if (c.me) {
    const r = await one(`update users set taps=taps+1, tapf=jsonb_set(tapf, array[$2::text], to_jsonb(coalesce((tapf->>$2::text)::int,0)+1), true) where id=$1 returning tapf`, [c.me.id, f]);
    taps = Number(r.tapf[f]);
  }
  return { taps, audio: av(a) };
});

route('GET', /^\/search$/, async (c) => {
  await hit(`srch:${c.me ? 'u' + c.me.id : c.ip}`, 60, 60);
  const s = String(c.query.q ?? '').trim().toLowerCase().slice(0, 50);
  if (!s) return { users: [], audios: [] };
  const esc = s.replace(/[\\%_]/g, (m) => '\\' + m);
  const users = await many(`select * from users where status='active' and (username like $1 or lower(name) like $2) order by username limit 30`, [esc + '%', '%' + esc + '%']);
  const vid = c.me ? Number(c.me.id) : 0;
  const rows = await many(`${AUD_SQL} where not a.hidden and not a.pending and u.status='active' and (lower(a.descr) like $2 or lower(coalesce(a.body,'')) like $2) order by a.id desc limit 80`, [vid, '%' + esc + '%']);
  const audios = [];
  for (const a of rows) {
    if (await canOpen({ id: a.id, owner: a.owner, rand: a.rand, hidden: false, pending: false, ostatus: 'active', pvis: a.opvis }, vid)) audios.push(av(a));
    if (audios.length >= 30) break;
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

route('GET', /^\/users\/([a-z0-9_]+)\/(avatar|cover)$/, async (c, m) => {
  const r = await one(`select p.mime, p.data from photos p join users u on u.id=p.user_id where u.username=$1 and p.kind=$2 and u.status='active'`, [m[1], m[2]]);
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
const relRow = (o, type) => ({ username: o.username, name: o.name, avatar: avUrl(o), type, verified: o.verified });

route('POST', /^\/relations$/, async (c) => {
  const u = c.need();
  await hit(`rel:${u.id}`, 30, 3600);
  const t = String(c.body.type), o = await one('select * from users where username=$1 and status=$2', [String(c.body.to ?? '').toLowerCase(), 'active']);
  if (!REL_TYPES.includes(t)) throw new ApiErr('bad_file');
  if (!o) throw new ApiErr('not_found', 404);
  if (o.id === u.id) throw new ApiErr('forbidden', 403);
  await tx(async (c2) => {
    const ex = await c2.query(`select 1 from rels where (a=$1 and b=$2) or (a=$2 and b=$1)`, [u.id, o.id]);
    if (ex.rows.length) throw new ApiErr('rel_exists', 409);
    await c2.query(`insert into rels(a, b, type, status, created) values ($1,$2,$3,'pending',$4)`, [u.id, o.id, t, now()]);
    await notify(c2, Number(o.id), 'rel_req', u.id, null, t);
  });
  return { ok: true };
});

route('GET', /^\/me\/relations$/, async (c) => {
  const u = c.need();
  const rows = await many(`select r.*, o.username, o.name, o.av_ver, o.verified from rels r join users o on o.id = case when r.a=$1 then r.b else r.a end where r.a=$1 or r.b=$1 order by r.created desc`, [u.id]);
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
  const rows = await many(`select r.type, f.username, f.name, f.av_ver, f.verified from rels r join users f on f.id = case when r.a=$1 then r.b else r.a end where r.status='active' and (r.a=$1 or r.b=$1) and f.status='active' order by r.since desc nulls last limit 200`, [o.id]);
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
      await t.query(`update rels set status='active', since=$3 where a=$1 and b=$2`, [r.a, r.b, now()]);
      await notify(t, Number(o.id), 'rel_ok', u.id, null, r.type);
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
  const rows = locked ? [] : await many(`${AUD_SQL} where a.owner=$2 and not a.pending ${mine ? '' : `and not a.hidden and (${audCond(FILTERS.join(','))})`} order by a.id desc limit 200`, [vid, uid]);
  let rel = { status: 'none', type: '' };
  if (vid && !mine) {
    const r = await one(`select * from rels where (a=$1 and b=$2) or (a=$2 and b=$1)`, [vid, uid]);
    if (r) rel = { status: r.status === 'active' ? 'active' : Number(r.a) === Number(vid) ? 'out' : 'in', type: r.type };
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
  await q('update audios set comments=(select count(*) from comments where post_id=$1 and not pending) where id=$1', [postId]);
}

route('POST', /^\/posts$/, async (c) => {
  const u = c.need();
  await hit(`post:${u.id}`, 40, 3600);
  const b = c.body, text = okText(b.text);
  if (text.length > MAX_POST_TEXT) throw new ApiErr('too_long', 413);
  if (parseInt(b.audios, 10) !== 1) throw new ApiErr('need_audio'); // post wajib tepat 1 audio
  const n = 1, bgm = false, bgmIdx = 0, inRand = true, inHups = true; // satu post tampil di Acak dan di Hups
  const rnd = parseAud(b.rand, false, true) ?? 'public';
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
      const r = await t.query(`insert into audios(owner, descr, secs, rand, pprof, created, body, body_key, body_len, in_rand, in_hups, n_audio, pending, bgm, mentions, bgm_idx) values ($1,$2,0,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning id`,
        [u.id, cutPreview(text), rnd, b.pprof !== false, now(), body, key, text.length, inRand, inHups, n, n > 0, bgm, mentions.join(','), bgmIdx]);
      for (const x of to) await t.query('insert into audio_to(audio_id, user_id) values ($1,$2)', [r.rows[0].id, x]);
      return Number(r.rows[0].id);
    });
  } catch (e) { if (key) await delAudio('mongo', key); throw e; }
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
  // Peringkat Hups: sorot + komentar (komentar lebih berat) dibagi usia post; makin baru makin besar peluang di atas.
  const score = `((a.likes * 2.0 + a.comments * 3.0 + 1.0) / power(((${now()} - a.created) / 3600000.0) + 2.0, 1.45))`;
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
    pinned: r.pinned === true,
  };
}
const CMT_SQL = `select c.id, c.parent, c.owner, c.body, c.body_key, c.likes, c.created, c.pinned, u.username, u.name, u.av_ver, u.verified,
  exists(select 1 from comment_likes l where l.comment_id=c.id and l.user_id=$2) liked from comments c join users u on u.id=c.owner`;

route('GET', /^\/posts\/(\d+)\/comments$/, async (c, m) => {
  await openPost(m[1], c);
  const rows = await many(`${CMT_SQL} where c.post_id=$1 and not c.pending and u.status='active' order by c.id asc limit 500`, [m[1], c.me ? c.me.id : 0]);
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

export async function handle(req, url) {
  const m0 = req.method;
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (path === '/cron/reminder') {
    const k = process.env.CRON_SECRET, got = String(req.headers.authorization || '').replace('Bearer ', '') || url.searchParams.get('key');
    if (!k || got !== k) throw new ApiErr('unauthorized', 401);
    return { ok: true, ...(await pushReminders()) };
  }
  if (path === '/' || path === '/health') { if (url.searchParams.get('warm')) await one('select 1 as x'); if (url.searchParams.get('push')) return { ok: true, push: await pushDiag() }; return { ok: true, service: 'hulhup-api' }; }
  if (path === '/deks/selftest') return runSelfTest();
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
    return fn(ctx, m);
  }
  throw new ApiErr('not_found', 404);
}
