// Pratinjau tautan (judul, deskripsi, gambar) seperti Threads/X. Yang disimpan di post hanya URL-nya;
// pratinjau diambil saat dilihat dan disimpan sementara di tabel link_previews.
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';
import { createHash } from 'node:crypto';
import { q, one } from './db.js';

const MAX_BYTES = 700 * 1024, TIMEOUT = 6000, MAX_HOPS = 4;
let ready = null;
const ensure = () => ready ??= q(`create table if not exists link_previews (h text primary key, data jsonb, at bigint not null)`).catch((e) => { ready = null; throw e; });

export function privateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return privateIp(v.slice(7));
  return v === '::' || v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb') || v.startsWith('ff');
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
    if (net.isIP(u.hostname) && privateIp(u.hostname)) return reject(new Error('blocked'));
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

export async function preview(raw) {
  let u;
  try { u = new URL(raw); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  u.hash = '';
  const key = u.toString(), h = createHash('sha256').update(key).digest('hex');
  await ensure();
  const c = await one('select data, at from link_previews where h=$1', [h]);
  if (c && Date.now() - Number(c.at) < (c.data ? 86400e3 : 3600e3)) return c.data;
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
  return data;
}
