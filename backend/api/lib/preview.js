// Pratinjau tautan (judul, deskripsi, gambar) seperti Threads/X. Yang disimpan di post hanya URL-nya;
// pratinjau diambil saat dilihat dan disimpan sementara di tabel link_previews.
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { q, one } from './db.js';

const MAX_BYTES = 700 * 1024, TIMEOUT = 6000, MAX_HOPS = 4;
let ready = null;
const ensure = () => ready ??= q(`create table if not exists link_previews (h text primary key, data jsonb, at bigint not null)`).catch((e) => { ready = null; throw e; });

const BLOCK = new net.BlockList();
for (const [a, n] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]]) BLOCK.addSubnet(a, n, 'ipv4');
for (const [a, n] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8], ['2001:db8::', 32], ['2001::', 32], ['2002::', 16], ['64:ff9b::', 96], ['64:ff9b:1::', 48], ['100::', 64]]) BLOCK.addSubnet(a, n, 'ipv6');

/** Alamat yang tidak boleh dituju server (jaringan dalam/khusus). Bentuk ::ffff:a.b.c.d dan ::ffff:hhhh:hhhh dikembalikan ke IPv4. */
export function privateIp(ip) {
  let v = String(ip || '').trim().toLowerCase().replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  if (net.isIPv4(v)) return BLOCK.check(v, 'ipv4');
  if (!net.isIPv6(v)) return true;
  const mapped = v.match(/^(?:0{0,4}:){0,5}(?::)?ffff:(?:(\d+\.\d+\.\d+\.\d+)|([0-9a-f]{1,4}):([0-9a-f]{1,4}))$/);
  if (mapped) {
    if (mapped[1]) return privateIp(mapped[1]);
    const hi = parseInt(mapped[2], 16), lo = parseInt(mapped[3], 16);
    return privateIp(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  if (/^::ffff:/.test(v) || /^0*:0*:0*:0*:0*:ffff:/.test(v)) return true; // bentuk ::ffff: lain yang tidak bisa diurai: tolak
  return BLOCK.check(v, 'ipv6');
}

// Alamat diperiksa tepat saat koneksi dibuat, jadi tidak bisa dibelokkan ke jaringan dalam (SSRF / DNS rebinding).
const safeLookup = (host, opts, cb) => dns.lookup(host, { all: true }, (err, list) => {
  if (err) return cb(err);
  const ok = list.filter((x) => !privateIp(x.address));
  if (!ok.length) return cb(new Error('blocked'));
  if (opts && opts.all) return cb(null, ok);
  cb(null, ok[0].address, ok[0].family);
});

function get(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol) || u.username || u.password) return reject(new Error('bad_url'));
    if (u.port && u.port !== '80' && u.port !== '443') return reject(new Error('bad_port'));
    if (net.isIP(u.hostname.replace(/^\[|\]$/g, '')) && privateIp(u.hostname)) return reject(new Error('blocked'));
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(u, { method: 'GET', lookup: safeLookup, timeout: TIMEOUT, headers: { 'user-agent': 'Mozilla/5.0 (compatible; HulhupBot/1.0; +https://hulhup.my.id)', accept: 'text/html,application/xhtml+xml,image/*,video/*,audio/*;q=0.8', 'accept-language': 'id,en;q=0.8' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { res.resume(); return resolve({ redirect: new URL(res.headers.location, u).toString() }); }
      const type = String(res.headers['content-type'] || '');
      const mk = (type.match(/^(image|video|audio)\//i) || [])[1];
      if (res.statusCode === 200 && mk) { res.destroy(); return resolve({ media: mk.toLowerCase(), url: u.toString() }); }
      if (res.statusCode !== 200 || !/text\/html|application\/xhtml/i.test(type)) { res.resume(); return reject(new Error('not_html')); }
      const parts = []; let n = 0;
      res.on('data', (d) => { n += d.length; parts.push(d); if (n > MAX_BYTES) { res.destroy(); resolve({ body: Buffer.concat(parts).toString('utf8'), url: u.toString() }); } });
      res.on('end', () => resolve({ body: Buffer.concat(parts).toString('utf8'), url: u.toString() }));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end();
  });
}

const ent = (s) => String(s || '').replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos|nbsp);/gi, (m, e) => {
  const l = e.toLowerCase();
  if (l === 'amp') return '&'; if (l === 'lt') return '<'; if (l === 'gt') return '>'; if (l === 'quot') return '"'; if (l === 'apos') return "'"; if (l === 'nbsp') return ' ';
  const code = l[1] === 'x' ? parseInt(l.slice(2), 16) : parseInt(l.slice(1), 10);
  return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
}).replace(/\s+/g, ' ').trim();

export function parseMeta(html, base) {
  const head = html.slice(0, 300000);
  const meta = {};
  for (const m of head.matchAll(/<meta\s+([^>]*?)\/?>/gi)) {
    const a = {};
    for (const x of m[1].matchAll(/([a-zA-Z:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) a[x[1].toLowerCase()] = x[3] ?? x[4] ?? '';
    const k = (a.property || a.name || '').toLowerCase();
    if (k && a.content !== undefined && !(k in meta)) meta[k] = a.content;
  }
  const title = ent(meta['og:title'] || meta['twitter:title'] || (head.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
  const desc = ent(meta['og:description'] || meta['twitter:description'] || meta.description || '');
  const abs = (v) => { try { const x = new URL(ent(v), base); return /^https?:$/.test(x.protocol) ? x.toString() : ''; } catch { return ''; } };
  let image = abs(meta['og:image:secure_url'] || meta['og:image'] || meta['twitter:image'] || meta['twitter:image:src'] || '');
  let icon = '';
  for (const m of head.matchAll(/<link\s+([^>]*?)\/?>/gi)) {
    const rel = (m[1].match(/rel\s*=\s*["']([^"']*)["']/i) || [])[1] || '', href = (m[1].match(/href\s*=\s*["']([^"']*)["']/i) || [])[1];
    if (href && /icon/i.test(rel)) { icon = abs(href); if (/apple-touch/i.test(rel)) break; }
  }
  if (!icon) icon = abs('/favicon.ico');
  const host = new URL(base).hostname.replace(/^www\./, '');
  return { kind: 'page', url: base, title: title.slice(0, 200), desc: desc.slice(0, 300), image, icon, site: ent(meta['og:site_name'] || '').slice(0, 80) || host, host };
}

/** Gambar dan ikon diganti alamat proxy; video/audio tetap alamat aslinya (diputar langsung dari situs asal). */
function signed(d) {
  if (!d) return d;
  const o = { ...d };
  if (o.kind === 'image') { o.src = imgSrc(o.url); }
  if (o.image) o.image = imgSrc(o.image);
  if (o.icon) o.icon = imgSrc(o.icon);
  return o;
}

export async function preview(raw) {
  let u;
  try { u = new URL(raw); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  u.hash = '';
  const key = u.toString(), h = createHash('sha256').update(key).digest('hex');
  await ensure();
  const c = await one('select data, at from link_previews where h=$1', [h]);
  if (c && Date.now() - Number(c.at) < (c.data ? 86400e3 : 3600e3)) return signed(c.data);
  let data = null;
  try {
    let cur = key;
    for (let i = 0; i <= MAX_HOPS; i++) {
      const r = await get(cur);
      if (r.redirect) { cur = r.redirect; continue; }
      if (r.media) { data = { kind: r.media, url: r.url, host: new URL(r.url).hostname.replace(/^www\./, '') }; break; }
      const m = parseMeta(r.body, r.url);
      data = m.title || m.image ? m : null;
      break;
    }
  } catch { data = null; }
  await q('insert into link_previews (h, data, at) values ($1,$2,$3) on conflict (h) do update set data=$2, at=$3', [h, data ? JSON.stringify(data) : null, Date.now()]);
  return signed(data);
}

// ── Proxy gambar: gambar dari situs luar dimuat lewat server ini, sehingga situs asal tidak melihat IP pengguna. ──
const SECRET = () => createHmac('sha256', 'img-proxy').update(process.env.IMG_SECRET || process.env.DATABASE_URL || process.env.PGLITE || 'dev').digest();
const sig = (u) => createHmac('sha256', SECRET()).update(u).digest('base64url').slice(0, 22);
/** Alamat proxy bertanda tangan: hanya URL yang kami keluarkan sendiri yang dilayani (bukan proxy terbuka). */
export const imgSrc = (u) => (u ? `/img?u=${Buffer.from(u).toString('base64url')}&s=${sig(u)}` : '');
export function imgUrlOf(u64, s) {
  let u = '';
  try { u = Buffer.from(String(u64 || ''), 'base64url').toString('utf8'); } catch { return null; }
  const a = Buffer.from(sig(u)), b = Buffer.from(String(s || ''));
  return u && a.length === b.length && timingSafeEqual(a, b) ? u : null;
}

const IMG_MAX = 5 * 1024 * 1024;
function getImg(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol) || u.username || u.password || (u.port && u.port !== '80' && u.port !== '443')) return reject(new Error('bad_url'));
    if (net.isIP(u.hostname.replace(/^\[|\]$/g, '')) && privateIp(u.hostname)) return reject(new Error('blocked'));
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(u, { method: 'GET', lookup: safeLookup, timeout: 8000, headers: { 'user-agent': 'Mozilla/5.0 (compatible; HulhupBot/1.0; +https://hulhup.my.id)', accept: 'image/*' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { res.resume(); return resolve({ redirect: new URL(res.headers.location, u).toString() }); }
      const mime = String(res.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      if (res.statusCode !== 200 || !/^image\/(jpeg|png|gif|webp|avif|bmp|x-icon|vnd\.microsoft\.icon)$/.test(mime)) { res.resume(); return reject(new Error('not_image')); }
      const parts = []; let n = 0;
      res.on('data', (d) => { n += d.length; if (n > IMG_MAX) { res.destroy(new Error('too_big')); return; } parts.push(d); });
      res.on('end', () => resolve({ mime, buf: Buffer.concat(parts) }));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.end();
  });
}
export async function fetchImage(url) {
  let cur = url;
  for (let i = 0; i <= 3; i++) {
    const r = await getImg(cur);
    if (r.redirect) { cur = r.redirect; continue; }
    return r;
  }
  throw new Error('redirects');
}
