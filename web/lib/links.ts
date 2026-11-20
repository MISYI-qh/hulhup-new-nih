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

/** Pemutar sematan situs populer (iframe resmi): YouTube, Instagram, TikTok, Vimeo, Spotify, SoundCloud. Tanpa mengunduh apa pun dari server Hulhup. */
export type FrameEmbed = { src: string; ratio?: string; h?: number; host: string };
export function embedOf(url: string): FrameEmbed | null {
  const u = linkUri(url); if (!u) return null;
  const h = u.hostname.toLowerCase().replace(/^(www|m|mobile|music)\./, ''); const seg = u.pathname.split('/').filter(Boolean);
  const idOk = (x?: string) => !!x && /^[\w-]{5,40}$/.test(x);
  if (h === 'youtu.be' && idOk(seg[0])) return { src: `https://www.youtube-nocookie.com/embed/${seg[0]}?rel=0&playsinline=1`, ratio: '16/9', host: 'YouTube' };
  if (h === 'youtube.com') {
    const v = u.searchParams.get('v');
    if (seg[0] === 'watch' && idOk(v ?? undefined)) return { src: `https://www.youtube-nocookie.com/embed/${v}?rel=0&playsinline=1`, ratio: '16/9', host: 'YouTube' };
    if ((seg[0] === 'shorts' || seg[0] === 'embed' || seg[0] === 'live') && idOk(seg[1])) return { src: `https://www.youtube-nocookie.com/embed/${seg[1]}?rel=0&playsinline=1`, ratio: seg[0] === 'shorts' ? '9/16' : '16/9', host: 'YouTube' };
  }
  if (h === 'instagram.com') {
    const i = seg[0] === 'p' || seg[0] === 'reel' || seg[0] === 'reels' || seg[0] === 'tv' ? 1 : seg[1] === 'p' || seg[1] === 'reel' ? 2 : -1;
    const kind = i === 1 ? seg[0] : i === 2 ? seg[1] : ''; const id = i > 0 ? seg[i] : undefined;
    if (idOk(id)) return { src: `https://www.instagram.com/${kind === 'reels' ? 'reel' : kind}/${id}/embed/`, h: 620, host: 'Instagram' };
  }
  if (h === 'tiktok.com') { const i = seg.indexOf('video'); const id = i >= 0 ? seg[i + 1] : undefined; if (id && /^\d{8,25}$/.test(id)) return { src: `https://www.tiktok.com/embed/v2/${id}`, h: 740, host: 'TikTok' }; }
  if (h === 'vimeo.com' && /^\d{5,12}$/.test(seg[0] ?? '')) return { src: `https://player.vimeo.com/video/${seg[0]}`, ratio: '16/9', host: 'Vimeo' };
  if (h === 'open.spotify.com') {
    const j = seg[0]?.startsWith('intl-') ? 1 : 0; const t = seg[j], id = seg[j + 1];
    if (['track', 'album', 'playlist', 'episode', 'show', 'artist'].includes(t) && idOk(id)) return { src: `https://open.spotify.com/embed/${t}/${id}`, h: t === 'track' || t === 'episode' ? 152 : 352, host: 'Spotify' };
  }
  if (h === 'soundcloud.com' && seg.length >= 2) return { src: `https://w.soundcloud.com/player/?url=${encodeURIComponent(u.origin + u.pathname)}&color=%236d4aff&visual=false`, h: 166, host: 'SoundCloud' };
  return null;
}
/** Tautan pertama di teks yang berupa media (foto/video/audio langsung atau sematan situs): posisinya disembunyikan karena medianya tampil langsung. */
export function mediaRef(text: string, images = true): { at: number; len: number } | null {
  for (const m of text.matchAll(linkRe())) {
    const raw = trimLink(m[0]); if (!raw || raw.startsWith('@')) continue;
    const uri = linkUri(raw); if (!uri) continue;
    const url = uri.toString();
    const k = kindOfUrl(url); if (k === 'image' && !images) return null;
    return k !== 'page' || embedOf(url) ? { at: m.index!, len: raw.length } : null;
  }
  return null;
}
