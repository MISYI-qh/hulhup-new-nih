// Terjemahan extra.dart (linkRe, trimLink, linkUri) dan linkcard.dart (firstUrl, kindOfUrl, proxied).
import { API } from './api';
export const linkReSrc = String.raw`(?<![@\w./-])((?:https?:\/\/)[^\s<>"]+|(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:com|id|net|org|io|app|dev|co|me|xyz|link|site|online|tv|ai|gg|ly|info|biz|my\.id|web\.id|co\.id|go\.id|ac\.id|sch\.id)(?::\d+)?(?:\/[^\s<>"]*)?)`;
export const linkRe = () => new RegExp(linkReSrc, 'gi');
export function trimLink(s: string) { let t = s; while (t && `.,;:!?)]}'"`.includes(t[t.length - 1])) t = t.slice(0, -1); return t; }
export function linkUri(raw: string): URL | null {
  const t = raw.trim();
  try { const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`); return u.hostname && (u.protocol === 'http:' || u.protocol === 'https:') ? u : null; } catch { return null; }
}
export function firstUrl(text: string): string | null {
  for (const m of text.matchAll(linkRe())) { const u = trimLink(m[0]); if (!u || u.startsWith('@')) continue; const uri = linkUri(u); if (uri) return uri.toString(); }
  return null;
}
export type UrlKind = 'image' | 'video' | 'audio' | 'page';
export function kindOfUrl(url: string): UrlKind {
  let p = ''; try { p = new URL(url).pathname; } catch {}
  if (/\.(jpe?g|png|gif|webp|avif|bmp|svg)$/i.test(p)) return 'image';
  if (/\.(mp4|webm|mov|m4v|ogv)$/i.test(p)) return 'video';
  if (/\.(mp3|m4a|aac|ogg|oga|opus|wav|flac)$/i.test(p)) return 'audio';
  return 'page';
}
/** Gambar dari situs luar dimuat lewat server Hulhup (alamat bertanda tangan), supaya situs asal tidak melihat IP pengguna. */
export const proxied = (s: string) => (s.startsWith('/') ? API + s : s);
export const mediaUrl = (u: string) => (u.startsWith('/') ? API + u : u);
/** Kode pendek post: /p/<kode>. */
import { dec } from './code';
export { enc as postCode, dec as postId } from './code';
export const ORIGIN_URL = 'https://hulhup.my.id';

/** Post Hulhup yang ditempel sebagai tautan (hulhup.my.id/p/<kode> atau id angka): tampil sebagai kutipan, bukan tautan. Hanya yang pertama. */
export type QuoteRef = { id: number; at: number; len: number };
export function quoteRef(text: string): QuoteRef | null {
  if (!text || !/hulhup\.my\.id\/p\//i.test(text)) return null;
  for (const m of text.matchAll(linkRe())) {
    const raw = trimLink(m[0]); const u = linkUri(raw); if (!u) continue;
    const h = u.hostname.toLowerCase(); if (h !== 'hulhup.my.id' && h !== 'www.hulhup.my.id') continue;
    const seg = u.pathname.split('/').filter(Boolean); if (seg[0] !== 'p' || seg.length !== 2) continue;
    const id = /^\d{1,10}$/.test(seg[1]) ? Number(seg[1]) : /^[0-9A-Za-z]{7}$/.test(seg[1]) ? dec(seg[1]) : null;
    if (id && id > 0) return { id, at: m.index!, len: raw.length };
  }
  return null;
}
