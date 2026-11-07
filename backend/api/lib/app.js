// Hulhup API: akun, audio acak dengan filter ketat, hubungan dua pihak, notifikasi.
// Semua izin ditegakkan di sini. Tidak ada endpoint admin: moderasi hanya lewat database.
import { q, one, many, tx } from './db.js';
import { ApiErr, now, sha, token, hashPw, checkPw, dayStr, okBirth, ageOf, imageMime, audioMime, readBody } from './util.js';
import { storeFor, putAudio, getAudio, delAudio } from './blobs.js';
import { randomInt } from 'node:crypto';
import { pushLater, pushDiag } from './push.js';

const MAX_IMG = 3 * 1024 * 1024, MAX_AUDIO = 3 * 1024 * 1024;
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

/** Syarat SQL audiens untuk filter acak. Alias audio = a, pemirsa = $1. Hanya audio yang rand-nya persis filter itu. */
function audCond(f) {
  switch (f) {
    case 'public': return `a.rand='public'`;
    case 'followers': return `a.rand='followers' and ${FOLLOW('$1', 'a.owner')}`;
    case 'following': return `a.rand='following' and ${FOLLOW('a.owner', '$1')}`;
    case 'both': return `a.rand='both' and (${FOLLOW('$1', 'a.owner')} or ${FOLLOW('a.owner', '$1')})`;
    case 'friend': case 'best': case 'partner': case 'family': return `a.rand='${f}' and ${REL('$1', 'a.owner', f)}`;
    case 'relations': return `a.rand='relations' and ${REL('$1', 'a.owner')}`;
    case 'me': return `a.rand='accounts' and exists(select 1 from audio_to t where t.audio_id=a.id and t.user_id=$1)`;
    default: return 'false';
  }
}

/** Apakah pemirsa boleh melihat sesuatu berdasarkan mode audiens pemilik (untuk visibilitas profil). */
async function canSee(mode, ownerId, viewerId, self = true) {
  if (mode === 'public') return true;
  viewerId = Number(viewerId) || 0; ownerId = Number(ownerId);
  if (!viewerId) return false;
  if (viewerId === ownerId) return self;
  if (mode === 'me' || mode === 'accounts') return false;
  if (['friend', 'best', 'partner', 'family', 'relations'].includes(mode)) {
    const r = await one(`select type from rels where status='active' and ((a=$1 and b=$2) or (a=$2 and b=$1))`, [viewerId, ownerId]);
    return !!r && (mode === 'relations' || r.type === mode);
  }
  const r = await one(`select ${FOLLOW('$1', '$2')} as fol, ${FOLLOW('$2', '$1')} as ing`, [viewerId, ownerId]);
  if (mode === 'followers') return r.fol;
  if (mode === 'following') return r.ing;
  if (mode === 'both') return r.fol || r.ing;
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
    `select (select count(*) from audios where owner=$1 and not hidden)::int as audios, ${me && !mine ? FOLLOW('$2', '$1') : 'false'} as isf`,
    me && !mine ? [u.id, me.id] : [u.id]);
  return {
    username: u.username, name: u.name, bio: u.bio, age: mine ? ageOf(u.birth) : 0, birth: mine ? u.birth : '',
    avatar: avUrl(u), cover: cvUrl(u), taps: mine ? Number(u.taps) : 0, pvis: mine ? u.pvis : '',
    streak: streakOf(u, today), days: mine ? u.days : 0,
    followers: u.followers, following: u.following, audios: r.audios, is_following: r.isf, is_me: mine, verified: u.verified,
  };
}

const AUD_SQL = `select a.id, a.descr, a.secs, a.pprof, a.rand, a.created, a.likes, a.owner, u.username ou, u.name oname, u.av_ver oav, u.verified ov,
  exists(select 1 from likes l where l.audio_id=a.id and l.user_id=$1) liked from audios a join users u on u.id=a.owner`;

function av(a) {
  return {
    id: Number(a.id), desc: a.descr, secs: a.secs, popup: true, vis: 'public', url: `/audios/${a.id}/file`, pprof: a.pprof, rand: a.rand,
    created: Number(a.created), likes: a.likes, liked: a.liked, owner: a.ou, owner_name: a.oname,
    owner_avatar: a.oav > 0 ? `/users/${a.ou}/avatar?v=${a.oav}` : null, owner_verified: a.ov,
  };
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
  return { token: await newSession(u.id, c.req), user: await uv(u, u, c.today) };
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

route('POST', /^\/logout$/, async (c) => {
  const h = c.req.headers.authorization || '';
  if (h.startsWith('Bearer ')) await q('delete from sessions where token_hash=$1', [sha(h.slice(7))]);
  return { ok: true };
});

route('GET', /^\/stats$/, async (c) => ({ taps: c.me ? Number(c.me.taps) : 0, tapf: c.me ? (c.me.tapf || {}) : {} }));

route('GET', /^\/random$/, async (c) => {
  await hit(`rnd:${c.me ? 'u' + c.me.id : c.ip}`, 120, 60);
  const f = FILTERS.includes(c.query.f) ? c.query.f : 'public';
  const vid = c.me ? c.me.id : 0, last = Number(c.query.last) || 0;
  const base = `from audios a join users u on u.id=a.owner where not a.hidden and u.status='active' and (${audCond(f)} or (a.owner=$1 and a.rand='public' and '${f}'='public'))`;
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
  const rows = await many(`${AUD_SQL} join users ou on ou.id=a.owner where not a.hidden and ou.status='active' and lower(a.descr) like $2 order by a.id desc limit 80`, [c.me ? c.me.id : 0, '%' + esc + '%']);
  const audios = [];
  const pv = new Map();
  for (const a of rows) {
    if (!pv.has(a.owner)) { const o = await one('select pvis from users where id=$1', [a.owner]); pv.set(a.owner, await canSee(o.pvis, Number(a.owner), c.me ? c.me.id : 0)); }
    if (pv.get(a.owner)) audios.push(av(a));
    if (audios.length >= 30) break;
  }
  return { users: users.map(mini), audios };
});

async function unreadCounts(id) {
  const r = await one(`select count(*)::int u, count(*) filter (where type in ('like','follow','rel_req','rel_ok'))::int s from notifs where to_user=$1 and not seen`, [id]);
  return { unread: r.u, unread_social: r.s };
}

route('GET', /^\/me$/, async (c) => ({ user: await uv(c.need(), c.me, c.today), ...(await unreadCounts(c.me.id)) }));

route('PATCH', /^\/me\/settings$/, async (c) => {
  const u = c.need();
  if (!FILTERS.includes(c.body.pvis)) throw new ApiErr('bad_file');
  const r = await one('update users set pvis=$2 where id=$1 returning *', [u.id, c.body.pvis]);
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
  await q(`insert into push_tokens(token, user_id, lang, created) values ($1,$2,$3,$4) on conflict (token) do update set user_id=$2, lang=$3`, [t, u.id, c.body.lang === 'en' ? 'en' : 'id', now()]);
  return { ok: true };
});

// ---------- laporan ----------
const REASONS = ['abuse', 'sexual', 'violence', 'spam', 'impersonate', 'other'];
route('POST', /^\/reports$/, async (c) => {
  const u = c.need();
  await hit(`rep:${u.id}`, 20, 3600);
  const reason = REASONS.includes(c.body.reason) ? c.body.reason : 'other';
  const note = String(c.body.note ?? '').trim().slice(0, 300);
  const aid = Number(c.body.audio) || null;
  let tu = null, ta = null;
  if (aid) {
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
  const dup = await one(`select 1 from reports where reporter=$1 and target_user=$2 and target_audio is not distinct from $3 and status='open'`, [u.id, tu, ta]);
  if (!dup) {
    await q('insert into reports(reporter, target_user, target_audio, reason, created) values ($1,$2,$3,$4,$5)', [u.id, tu, ta, (reason + (note ? ': ' + note : '')).slice(0, 320), now()]);
  }
  return { ok: true };
});

route('DELETE', /^\/me$/, async (c) => {
  const u = c.need();
  const as = await many('select store, blob_key from audios where owner=$1', [u.id]);
  await q('delete from users where id=$1', [u.id]); // semua data terkait ikut terhapus (CASCADE)
  await Promise.all(as.map((a) => delAudio(a.store, a.blob_key)));
  return { ok: true };
});

route('GET', /^\/me\/liked$/, async (c) => {
  const u = c.need();
  const rows = await many(`${AUD_SQL} where not a.hidden and exists(select 1 from likes l where l.audio_id=a.id and l.user_id=$1) order by a.id desc limit 200`, [u.id]);
  return { audios: rows.map(av) };
});

route('GET', /^\/notifications$/, async (c) => {
  const u = c.need();
  const rows = await many(
    `select n.type, n.created, n.seen, n.n, n.extra, n.actor, a.username, a.name, a.av_ver, au.descr from notifs n
     left join users a on a.id=n.actor left join audios au on au.id=n.audio where n.to_user=$1 order by n.created desc, n.id desc limit 60`, [u.id]);
  const items = rows.filter((r) => r.actor === null || r.username).map((r) => (r.actor === null
    ? { type: r.type, created: Number(r.created), seen: r.seen, n: r.n, username: '', name: 'Hulhup', avatar: null, desc: '' }
    : { type: r.type, created: Number(r.created), seen: r.seen, username: r.username, name: r.name, avatar: r.av_ver > 0 ? `/users/${r.username}/avatar?v=${r.av_ver}` : null, desc: r.descr ?? '', extra: r.extra }));
  await q('update notifs set seen=true where to_user=$1 and not seen', [u.id]);
  return { items };
});

route('DELETE', /^\/audios\/(\d+)$/, async (c, m) => {
  const u = c.need();
  const a = await one('delete from audios where id=$1 and owner=$2 returning store, blob_key', [m[1], u.id]);
  if (!a) throw new ApiErr('not_found', 404);
  await delAudio(a.store, a.blob_key);
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
  const rnd = f.rand === 'accounts' ? 'accounts' : (FILTERS.filter((e) => e !== 'me').includes(f.rand) ? f.rand : 'public');
  let to = [];
  if (rnd === 'accounts') {
    const names = String(f.to ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean).slice(0, 200);
    const us = names.length ? await many('select id from users where username = any($1) and id<>$2 and status=$3', [names, u.id, 'active']) : [];
    to = us.map((r) => r.id);
    if (!to.length) throw new ApiErr('need_accounts');
  }
  const secs = Math.min(15, Math.max(1, parseInt(f.secs, 10) || 15));
  const desc = String(f.desc ?? '').trim().slice(0, 200);
  const store = storeFor(secs);
  const key = await putAudio(store, body, mime);
  try {
    await tx(async (t) => {
      const r = await t.query(`insert into audios(owner, descr, secs, store, blob_key, mime, rand, pprof, created) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
        [u.id, desc, secs, store, key, mime, rnd, f.pprof !== '0', now()]);
      for (const id of to) await t.query('insert into audio_to(audio_id, user_id) values ($1,$2)', [r.rows[0].id, id]);
    });
  } catch (e) { await delAudio(store, key); throw e; }
  return { ok: true };
});

route('GET', /^\/audios\/(\d+)\/file$/, async (c, m) => {
  const a = await one(`select a.*, u.pvis, u.status ostatus from audios a join users u on u.id=a.owner where a.id=$1`, [m[1]]);
  if (!a) throw new ApiErr('not_found', 404);
  const vid = c.me ? Number(c.me.id) : 0, owner = Number(a.owner);
  let ok = vid === owner;
  if (!ok && !a.hidden && a.ostatus === 'active') {
    if (a.rand === 'accounts') ok = !!vid && !!(await one('select 1 from audio_to where audio_id=$1 and user_id=$2', [a.id, vid]));
    else ok = await canSee(a.rand, owner, vid, false);
    if (!ok) ok = await canSee(a.pvis, owner, vid, false); // terlihat di profil pemilik
    if (!ok && vid) ok = !!(await one('select 1 from likes where audio_id=$1 and user_id=$2', [a.id, vid]));
  }
  if (!ok) throw new ApiErr('not_found', 404);
  const b = await getAudio(a.store, a.blob_key);
  if (!b) throw new ApiErr('not_found', 404);
  return { binary: b, mime: a.mime, cache: 'private, max-age=86400' };
});

route('GET', /^\/users\/([a-z0-9_]+)\/(avatar|cover)$/, async (c, m) => {
  const r = await one(`select p.mime, p.data from photos p join users u on u.id=p.user_id where u.username=$1 and p.kind=$2 and u.status='active'`, [m[1], m[2]]);
  if (!r) throw new ApiErr('not_found', 404);
  return { binary: r.data, mime: r.mime, cache: 'public, max-age=31536000, immutable' };
});

route('POST', /^\/me\/(avatar|cover)$/, async (c, m) => {
  const u = c.need();
  await hit(`img:${u.id}`, 20, 3600);
  const body = await readBody(c.req, MAX_IMG + 1024).catch((e) => { throw e.code === 'too_big' ? new ApiErr('too_big_img', 413) : e; });
  if (!body.length) throw new ApiErr('bad_file');
  if (body.length > MAX_IMG) throw new ApiErr('too_big_img', 413);
  const mime = imageMime(body);
  if (!mime || mime === 'image/gif') throw new ApiErr('bad_file');
  const col = m[1] === 'avatar' ? 'av_ver' : 'cv_ver';
  await tx(async (t) => {
    await t.query(`insert into photos(user_id, kind, mime, data) values ($1,$2,$3,$4) on conflict (user_id, kind) do update set mime=excluded.mime, data=excluded.data`, [u.id, m[1], mime, body]);
    await t.query(`update users set ${col}=$2 where id=$1`, [u.id, now()]);
  });
  return { ok: true };
});

route('DELETE', /^\/me\/(avatar|cover)$/, async (c, m) => {
  const u = c.need();
  const col = m[1] === 'avatar' ? 'av_ver' : 'cv_ver';
  await tx(async (t) => {
    await t.query('delete from photos where user_id=$1 and kind=$2', [u.id, m[1]]);
    await t.query(`update users set ${col}=0 where id=$1`, [u.id]);
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
  const o = await one(`select id from users where username=$1 and status='active'`, [m[1]]);
  if (!o) throw new ApiErr('not_found', 404);
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
  const rows = locked ? [] : await many(`${AUD_SQL} where a.owner=$2 ${mine ? '' : 'and not a.hidden'} order by a.id desc limit 200`, [vid, uid]);
  let rel = { status: 'none', type: '' };
  if (vid && !mine) {
    const r = await one(`select * from rels where (a=$1 and b=$2) or (a=$2 and b=$1)`, [vid, uid]);
    if (r) rel = { status: r.status === 'active' ? 'active' : Number(r.a) === Number(vid) ? 'out' : 'in', type: r.type };
  }
  return { user: await uv(u, c.me, c.today), audios: rows.map(av), locked, rel };
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

export async function handle(req, url) {
  const m0 = req.method;
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (path === '/' || path === '/health') { if (url.searchParams.get('warm')) await one('select 1 as x'); if (url.searchParams.get('push')) return { ok: true, push: await pushDiag() }; return { ok: true, service: 'hulhup-api' }; }
  const me = await authUser(req);
  const ip = ipOf(req);
  await hit(`ip:${ip}`, 600, 60);
  const query = Object.fromEntries(url.searchParams);
  const ctx = { req, me, ip, query, today: todayOf(req), body: {}, need() { if (!me) throw new ApiErr('unauthorized', 401); return me; } };
  for (const [method, re, fn] of routes) {
    if (method !== m0) continue;
    const m = re.exec(path);
    if (!m) continue;
    if (['POST', 'PATCH'].includes(m0) && String(req.headers['content-type'] || '').includes('json')) {
      const raw = await readBody(req, 64 * 1024);
      try { ctx.body = raw.length ? JSON.parse(raw.toString('utf8')) : {}; } catch { throw new ApiErr('bad_file'); }
      if (typeof ctx.body !== 'object' || ctx.body === null || Array.isArray(ctx.body)) ctx.body = {};
    }
    return fn(ctx, m);
  }
  throw new ApiErr('not_found', 404);
}
