const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS' };
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json', ...CORS } });
const E = (e, s = 400) => J({ error: e }, s);
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const unhex = (h) => new Uint8Array(h.match(/../g).map((x) => parseInt(x, 16)));
const rand = (n = 16) => hex(crypto.getRandomValues(new Uint8Array(n)));
const now = () => Date.now();
const AUDIO_TYPES = { m4a: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/aac', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', opus: 'audio/ogg', webm: 'audio/webm', flac: 'audio/flac' };
const MAX_AUDIO = 3 * 1024 * 1024, MAX_IMG = 3 * 1024 * 1024;

async function hash(pw, salt) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unhex(salt), iterations: 100000 }, k, 256));
}
const furl = (o, k) => (k ? `${o}/api/file/${k}` : null);

async function userView(env, u, me, o) {
  const [a, b, c] = await env.DB.batch([
    env.DB.prepare('SELECT COUNT(*) n FROM follows WHERE followee=?').bind(u.id),
    env.DB.prepare('SELECT COUNT(*) n FROM follows WHERE follower=?').bind(u.id),
    env.DB.prepare('SELECT COUNT(*) n FROM audios WHERE owner_id=?').bind(u.id),
  ]);
  let isf = false;
  if (me && me.id !== u.id) isf = !!(await env.DB.prepare('SELECT 1 x FROM follows WHERE follower=? AND followee=?').bind(me.id, u.id).first());
  const mine = !!me && me.id === u.id;
  return { username: u.username, name: u.name, bio: u.bio, age: mine ? u.age : 0, avatar: furl(o, u.avatar), cover: furl(o, u.cover), followers: a.results[0].n, following: b.results[0].n, audios: c.results[0].n, is_following: isf, is_me: mine };
}
const AQ = `SELECT a.*, u.username, u.name, u.avatar AS uav,
 (SELECT COUNT(*) FROM likes l WHERE l.audio_id=a.id) AS likes,
 (SELECT 1 FROM likes l WHERE l.audio_id=a.id AND l.user_id=?) AS liked
 FROM audios a JOIN users u ON u.id=a.owner_id`;
const audioView = (r, o) => ({ id: r.id, desc: r.descr, secs: r.secs, popup: !!r.popup, vis: r.vis, url: furl(o, r.key), likes: r.likes, liked: !!r.liked, owner: r.username, owner_name: r.name, owner_avatar: furl(o, r.uav) });

async function notify(env, userId, type, actor, audioId) {
  if (userId === actor) return;
  await env.DB.prepare('INSERT INTO notifs(user_id,type,actor_id,audio_id,created) VALUES(?,?,?,?,?)').bind(userId, type, actor, audioId ?? null, now()).run();
}
async function session(env, user) {
  const token = rand(32);
  await env.DB.prepare('INSERT INTO sessions VALUES(?,?,?)').bind(token, user.id, now()).run();
  return token;
}
async function wipeUser(env, u) {
  const keys = (await env.DB.prepare('SELECT key FROM audios WHERE owner_id=?').bind(u.id).all()).results.map((r) => r.key);
  for (const k of [...keys, u.avatar, u.cover]) if (k) await env.BUCKET.delete(k);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM likes WHERE audio_id IN (SELECT id FROM audios WHERE owner_id=?) OR user_id=?').bind(u.id, u.id),
    env.DB.prepare('DELETE FROM notifs WHERE audio_id IN (SELECT id FROM audios WHERE owner_id=?) OR user_id=? OR actor_id=?').bind(u.id, u.id, u.id),
    env.DB.prepare('DELETE FROM audios WHERE owner_id=?').bind(u.id),
    env.DB.prepare('DELETE FROM follows WHERE follower=? OR followee=?').bind(u.id, u.id),
    env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(u.id),
    env.DB.prepare('DELETE FROM users WHERE id=?').bind(u.id),
  ]);
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const url = new URL(req.url), o = url.origin, p = url.pathname, m = req.method;
    try {
      // file (public)
      let x = p.match(/^\/api\/file\/(.+)$/);
      if (x && m === 'GET') {
        const obj = await env.BUCKET.get(x[1], { range: req.headers });
        if (!obj) return E('not_found', 404);
        const h = new Headers(CORS);
        obj.writeHttpMetadata(h);
        h.set('etag', obj.httpEtag); h.set('accept-ranges', 'bytes'); h.set('cache-control', 'public,max-age=31536000,immutable');
        if (obj.range && req.headers.get('range')) {
          const off = obj.range.offset ?? 0, len = obj.range.length ?? obj.size - off;
          h.set('content-range', `bytes ${off}-${off + len - 1}/${obj.size}`);
          return new Response(obj.body, { status: 206, headers: h });
        }
        return new Response(obj.body, { headers: h });
      }
      const body = async () => { try { return await req.json(); } catch { return {}; } };
      const tok = (req.headers.get('authorization') || '').replace('Bearer ', '');
      const me = tok ? await env.DB.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=?').bind(tok).first() : null;
      const need = () => { if (!me) throw { code: 'unauthorized', s: 401 }; };

      if (p === '/api/register' && m === 'POST') {
        const b = await body();
        const name = String(b.name || '').trim(), un = String(b.username || '').trim().toLowerCase(), pw = String(b.password || ''), age = parseInt(b.age, 10);
        if (!name || name.length > 40) return E('bad_name');
        if (!/^[a-z0-9_]{3,20}$/.test(un)) return E('bad_username');
        if (pw.length < 6 || pw.length > 100) return E('bad_password');
        if (!(age >= 1 && age <= 120)) return E('bad_age');
        if (await env.DB.prepare('SELECT 1 x FROM users WHERE username=?').bind(un).first()) return E('username_taken', 409);
        const salt = rand(16);
        const r = await env.DB.prepare('INSERT INTO users(username,name,age,salt,pass,created) VALUES(?,?,?,?,?,?)').bind(un, name, age, salt, await hash(pw, salt), now()).run();
        const u = await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(r.meta.last_row_id).first();
        return J({ token: await session(env, u), user: await userView(env, u, u, o) });
      }
      if (p === '/api/login' && m === 'POST') {
        const b = await body();
        const u = await env.DB.prepare('SELECT * FROM users WHERE username=?').bind(String(b.username || '').trim().toLowerCase()).first();
        if (!u || (await hash(String(b.password || ''), u.salt)) !== u.pass) return E('bad_credentials', 401);
        return J({ token: await session(env, u), user: await userView(env, u, u, o) });
      }
      if (p === '/api/stats' && m === 'GET') return J({ taps: (await env.DB.prepare("SELECT v FROM meta WHERE k='taps'").first()).v });
      if (p === '/api/random' && m === 'GET') {
        await env.DB.prepare("UPDATE meta SET v=v+1 WHERE k='taps'").run();
        const taps = (await env.DB.prepare("SELECT v FROM meta WHERE k='taps'").first()).v;
        const r = await env.DB.prepare(AQ + ' ORDER BY RANDOM() LIMIT 1').bind(me ? me.id : 0).first();
        return J({ taps, audio: r ? audioView(r, o) : null });
      }
      if (p === '/api/search' && m === 'GET') {
        const q = (url.searchParams.get('q') || '').trim().toLowerCase().replace(/[%_]/g, '');
        if (!q) return J({ users: [] });
        const rs = await env.DB.prepare('SELECT username,name,avatar FROM users WHERE username LIKE ? OR lower(name) LIKE ? ORDER BY username LIMIT 30').bind(q + '%', '%' + q + '%').all();
        return J({ users: rs.results.map((u) => ({ username: u.username, name: u.name, avatar: furl(o, u.avatar) })) });
      }

      need();
      if (p === '/api/logout' && m === 'POST') { await env.DB.prepare('DELETE FROM sessions WHERE token=?').bind(tok).run(); return J({ ok: true }); }
      if (p === '/api/me' && m === 'GET') {
        const n = (await env.DB.prepare('SELECT COUNT(*) n FROM notifs WHERE user_id=? AND seen=0').bind(me.id).first()).n;
        return J({ user: await userView(env, me, me, o), unread: n });
      }
      if (p === '/api/me' && m === 'PATCH') {
        const b = await body();
        const name = b.name === undefined ? me.name : String(b.name).trim();
        const bio = b.bio === undefined ? me.bio : String(b.bio).trim();
        const un = b.username === undefined ? me.username : String(b.username).trim().toLowerCase();
        const age = b.age === undefined ? me.age : parseInt(b.age, 10);
        if (!name || name.length > 40) return E('bad_name');
        if (bio.length > 300) return E('bad_bio');
        if (!/^[a-z0-9_]{3,20}$/.test(un)) return E('bad_username');
        if (!(age >= 1 && age <= 120)) return E('bad_age');
        if (un !== me.username && (await env.DB.prepare('SELECT 1 x FROM users WHERE username=?').bind(un).first())) return E('username_taken', 409);
        await env.DB.prepare('UPDATE users SET name=?,bio=?,username=?,age=? WHERE id=?').bind(name, bio, un, age, me.id).run();
        const u = await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(me.id).first();
        return J({ user: await userView(env, u, u, o) });
      }
      if (p === '/api/me/password' && m === 'POST') {
        const b = await body(), npw = String(b.new || '');
        if ((await hash(String(b.old || ''), me.salt)) !== me.pass) return E('bad_credentials', 401);
        if (npw.length < 6 || npw.length > 100) return E('bad_password');
        const salt = rand(16);
        await env.DB.prepare('UPDATE users SET salt=?,pass=? WHERE id=?').bind(salt, await hash(npw, salt), me.id).run();
        return J({ ok: true });
      }
      if (p === '/api/me' && m === 'DELETE') { await wipeUser(env, me); return J({ ok: true }); }
      x = p.match(/^\/api\/me\/(avatar|cover)$/);
      if (x && m === 'POST') {
        const type = req.headers.get('content-type') || '';
        if (!/^image\/(jpeg|png|webp)$/.test(type)) return E('bad_file');
        const buf = await req.arrayBuffer();
        if (buf.byteLength > MAX_IMG || buf.byteLength === 0) return E('too_big');
        const key = `img/${rand(16)}`;
        await env.BUCKET.put(key, buf, { httpMetadata: { contentType: type } });
        if (me[x[1]]) await env.BUCKET.delete(me[x[1]]);
        await env.DB.prepare(`UPDATE users SET ${x[1]}=? WHERE id=?`).bind(key, me.id).run();
        return J({ url: furl(o, key) });
      }
      if (p === '/api/me/liked' && m === 'GET') {
        const rs = await env.DB.prepare(AQ + ' WHERE a.id IN (SELECT audio_id FROM likes WHERE user_id=?) ORDER BY a.id DESC').bind(me.id, me.id).all();
        return J({ audios: rs.results.map((r) => audioView(r, o)) });
      }
      if (p === '/api/notifications' && m === 'GET') {
        const rs = await env.DB.prepare('SELECT n.type,n.created,n.seen,u.username,u.name,u.avatar,a.descr FROM notifs n JOIN users u ON u.id=n.actor_id LEFT JOIN audios a ON a.id=n.audio_id WHERE n.user_id=? ORDER BY n.id DESC LIMIT 60').bind(me.id).all();
        await env.DB.prepare('UPDATE notifs SET seen=1 WHERE user_id=?').bind(me.id).run();
        return J({ items: rs.results.map((r) => ({ type: r.type, created: r.created, seen: !!r.seen, username: r.username, name: r.name, avatar: furl(o, r.avatar), desc: r.descr || '' })) });
      }
      if (p === '/api/audios' && m === 'POST') {
        const f = await req.formData(), file = f.get('file');
        if (!file || typeof file === 'string') return E('bad_file');
        const ext = (file.name.split('.').pop() || '').toLowerCase();
        if (!AUDIO_TYPES[ext]) return E('bad_file');
        if (file.size > MAX_AUDIO || file.size === 0) return E('too_big');
        const secs = Math.max(1, Math.min(30, parseInt(f.get('secs'), 10) || 30));
        const descr = String(f.get('desc') || '').trim().slice(0, 500);
        const vis = ['all', 'followers', 'me'].includes(f.get('vis')) ? f.get('vis') : 'all';
        const key = `aud/${rand(16)}.${ext}`;
        await env.BUCKET.put(key, file.stream(), { httpMetadata: { contentType: AUDIO_TYPES[ext] } });
        await env.DB.prepare('INSERT INTO audios(owner_id,descr,secs,popup,vis,key,created) VALUES(?,?,?,?,?,?,?)').bind(me.id, descr, secs, f.get('popup') === '0' ? 0 : 1, vis, key, now()).run();
        return J({ ok: true });
      }
      x = p.match(/^\/api\/audios\/(\d+)$/);
      if (x && m === 'DELETE') {
        const a = await env.DB.prepare('SELECT * FROM audios WHERE id=? AND owner_id=?').bind(x[1], me.id).first();
        if (!a) return E('not_found', 404);
        await env.BUCKET.delete(a.key);
        await env.DB.batch([env.DB.prepare('DELETE FROM likes WHERE audio_id=?').bind(a.id), env.DB.prepare('DELETE FROM notifs WHERE audio_id=?').bind(a.id), env.DB.prepare('DELETE FROM audios WHERE id=?').bind(a.id)]);
        return J({ ok: true });
      }
      x = p.match(/^\/api\/audios\/(\d+)\/like$/);
      if (x && m === 'POST') {
        const a = await env.DB.prepare('SELECT * FROM audios WHERE id=?').bind(x[1]).first();
        if (!a) return E('not_found', 404);
        const had = await env.DB.prepare('SELECT 1 x FROM likes WHERE user_id=? AND audio_id=?').bind(me.id, a.id).first();
        if (had) await env.DB.prepare('DELETE FROM likes WHERE user_id=? AND audio_id=?').bind(me.id, a.id).run();
        else { await env.DB.prepare('INSERT INTO likes VALUES(?,?)').bind(me.id, a.id).run(); await notify(env, a.owner_id, 'like', me.id, a.id); }
        const n = (await env.DB.prepare('SELECT COUNT(*) n FROM likes WHERE audio_id=?').bind(a.id).first()).n;
        return J({ liked: !had, likes: n });
      }
      x = p.match(/^\/api\/users\/([a-z0-9_]+)(\/follow|\/follows)?$/);
      if (x) {
        const u = await env.DB.prepare('SELECT * FROM users WHERE username=?').bind(x[1]).first();
        if (!u) return E('not_found', 404);
        if (!x[2] && m === 'GET') {
          const isf = me.id !== u.id && !!(await env.DB.prepare('SELECT 1 x FROM follows WHERE follower=? AND followee=?').bind(me.id, u.id).first());
          const rs = await env.DB.prepare(AQ + ' WHERE a.owner_id=? AND (?=1 OR a.vis=\'all\' OR (a.vis=\'followers\' AND ?=1)) ORDER BY a.id DESC').bind(me.id, u.id, me.id === u.id ? 1 : 0, isf ? 1 : 0).all();
          return J({ user: await userView(env, u, me, o), audios: rs.results.map((r) => audioView(r, o)) });
        }
        if (x[2] === '/follow' && m === 'POST') {
          if (u.id === me.id) return E('forbidden', 403);
          const had = await env.DB.prepare('SELECT 1 x FROM follows WHERE follower=? AND followee=?').bind(me.id, u.id).first();
          if (had) await env.DB.prepare('DELETE FROM follows WHERE follower=? AND followee=?').bind(me.id, u.id).run();
          else { await env.DB.prepare('INSERT INTO follows VALUES(?,?)').bind(me.id, u.id).run(); await notify(env, u.id, 'follow', me.id, null); }
          const n = (await env.DB.prepare('SELECT COUNT(*) n FROM follows WHERE followee=?').bind(u.id).first()).n;
          return J({ following: !had, followers: n });
        }
        if (x[2] === '/follows' && m === 'GET') {
          const kind = url.searchParams.get('kind') === 'following' ? 'following' : 'followers';
          const sql = kind === 'followers' ? 'SELECT u.username,u.name,u.avatar FROM follows f JOIN users u ON u.id=f.follower WHERE f.followee=? LIMIT 200' : 'SELECT u.username,u.name,u.avatar FROM follows f JOIN users u ON u.id=f.followee WHERE f.follower=? LIMIT 200';
          const rs = await env.DB.prepare(sql).bind(u.id).all();
          return J({ users: rs.results.map((r) => ({ username: r.username, name: r.name, avatar: furl(o, r.avatar) })) });
        }
      }
      return E('not_found', 404);
    } catch (e) {
      if (e && e.code) return E(e.code, e.s || 400);
      return E('server', 500);
    }
  },
};
