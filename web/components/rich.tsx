'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Icon } from './Icon';
import { Api, store, useStore } from '@/lib/store';
import { toast, PBtn } from './ui';
import { firstUrl, kindOfUrl, linkRe, linkUri, proxied, trimLink, mediaUrl } from '@/lib/links';
import { FileBar } from './post';

export function Avatar({ url, name, size }: { url?: string | null; name: string; size: number }) {
  const [bad, setBad] = useState(false);
  const init = (name || '?').trim().charAt(0).toUpperCase() || '?';
  return <span className="avatar" style={{ width: size, height: size, fontSize: size * .42, ...(url && !bad ? { background: 'var(--soft)' } : {}) }}>
    {url && !bad ? <img src={mediaUrl(url)} alt="" width={size} height={size} loading="lazy" decoding="async" onError={() => setBad(true)} /> : init}</span>;
}
export const Verified = ({ size = 15 }: { size?: number }) => <Icon n="verified_rounded" size={size} color="var(--blue)" style={{ marginLeft: 4 }} />;

export function AiTag({ label }: { label: string }) { return <div className="aitag"><Icon n="auto_awesome_rounded" size={13} color="#d6336c" />{label}</div>; }

/** Buka tautan: halaman Hulhup dibuka di dalam situs, situs lain di tab baru. */
export function openLink(raw: string, push: (p: string) => void) {
  const u = linkUri(raw); if (!u) return;
  const h = u.hostname.toLowerCase();
  if (h === 'hulhup.my.id' || h === 'www.hulhup.my.id') { push((u.pathname || '/') + u.search); return; }
  window.open(u.toString(), '_blank', 'noopener,noreferrer');
}

/** Teks dengan @nama dan tautan yang bisa diketuk. */
export function MentionText({ text, className, style, clamp }: { text: string; className?: string; style?: React.CSSProperties; clamp?: number }) {
  const out: React.ReactNode[] = []; let last = 0, k = 0;
  const re = new RegExp(`${linkRe().source}|@([a-z0-9_]{3,20})`, 'gi');
  for (const m of text.matchAll(re)) {
    const raw = m[0], tag = m[2] != null, shown = tag ? raw : trimLink(raw);
    if (!shown) continue;
    const at = m.index!;
    if (at > last) out.push(text.slice(last, at));
    out.push(tag
      ? <Link key={k++} href={`/@${m[2].toLowerCase()}`} className="mention" onClick={(e) => e.stopPropagation()}>{shown}</Link>
      : <a key={k++} className="hlink" href={linkUri(shown)?.toString() ?? '#'} target="_blank" rel="noopener noreferrer nofollow ugc" onClick={(e) => e.stopPropagation()}>{shown}</a>);
    last = at + shown.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <div className={className ?? 'htext'} style={{ ...(clamp ? { display: '-webkit-box', WebkitLineClamp: clamp, WebkitBoxOrient: 'vertical', overflow: 'hidden' } : {}), ...style }}>{out}</div>;
}

/** Saran akun saat mengetik @… di kolom teks. */
export function MentionBar({ value, onPick }: { value: string; onPick: (v: string) => void }) {
  const [users, setUsers] = useState<any[]>([]); const q = useRef(''); const seq = useRef(0); const t = useRef<any>(null);
  useEffect(() => {
    const m = /@([a-z0-9_]{1,20})$/.exec(value), nq = m?.[1] ?? '';
    if (nq === q.current) return; q.current = nq; clearTimeout(t.current);
    if (!nq) { setUsers([]); return; }
    const my = ++seq.current;
    t.current = setTimeout(async () => { try { const j = await Api.req('GET', `/search?q=${encodeURIComponent(nq)}`); if (my === seq.current) setUsers((j.users as any[]).slice(0, 6)); } catch {} }, 280);
  }, [value]);
  useEffect(() => () => clearTimeout(t.current), []);
  if (!users.length) return null;
  return <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6 }}>{users.map((u) => (
    <button key={u.username} className="tap chip" style={{ padding: '4px 14px 4px 6px', flex: 'none' }} onClick={() => { const m = /@([a-z0-9_]{1,20})$/.exec(value); if (m) { onPick(`${value.slice(0, m.index)}@${u.username} `); setUsers([]); } }}>
      <Avatar url={u.avatar} name={u.name} size={28} /><span style={{ fontWeight: 700 }}>@{u.username}</span></button>))}</div>;
}

const previews = new Map<string, Promise<any | null>>();
function fetchPreview(url: string) {
  if (!store.me) return Promise.resolve(null);
  let p = previews.get(url);
  if (!p) { p = Api.req('GET', `/preview?url=${encodeURIComponent(url)}`).then((j) => (j.preview && typeof j.preview === 'object' ? j.preview : null)).catch(() => { previews.delete(url); return null; }); previews.set(url, p); }
  return p;
}
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

/** Tampilan otomatis untuk tautan di post: gambar, video, audio, atau kartu halaman, tanpa mengetuk tautannya. */
export function LinkEmbed({ url }: { url: string }) {
  const s = useStore(); const [p, setP] = useState<any | null>(null);
  const k = kindOfUrl(url);
  useEffect(() => { let on = true; if (k === 'page' || k === 'image') fetchPreview(url).then((x) => on && setP(x)); return () => { on = false; }; }, [url, k, s.me?.username]);
  if (k === 'video') return <VideoEmbed url={url} />;
  if (k === 'audio') return <AudioEmbed url={url} host={host(url)} />;
  if (!p) return null;
  switch (`${p.kind}`) {
    case 'image': return <ImageEmbed src={proxied(`${p.src}`)} orig={`${p.url}`} />;
    case 'video': return <VideoEmbed url={`${p.url}`} />;
    case 'audio': return <AudioEmbed url={`${p.url}`} host={host(url)} />;
  }
  return <PageCard url={url} p={p} />;
}

function PageCard({ url, p }: { url: string; p: any }) {
  const img = proxied(`${p.image ?? ''}`), icon = proxied(`${p.icon ?? ''}`), site = `${p.site ?? ''}` || `${p.host ?? ''}`;
  const hide = (e: React.SyntheticEvent) => ((e.target as HTMLElement).style.display = 'none');
  return <a className="tap embed" style={{ display: 'block', marginRight: 8, textDecoration: 'none', color: 'inherit' }} href={linkUri(url)?.toString()} target="_blank" rel="noopener noreferrer nofollow ugc" onClick={(e) => e.stopPropagation()}>
    {img ? <img className="pimg" src={img} alt="" loading="lazy" decoding="async" onError={hide} /> : null}
    <div className="pg">
      <div className="site">{icon ? <img src={icon} alt="" width={14} height={14} style={{ borderRadius: 4, width: 14, height: 14, flex: 'none', background: 'none', objectFit: 'contain' }} onError={hide} /> : null}<span>{site}</span></div>
      {p.title ? <b>{p.title}</b> : null}
      {p.desc ? <div className="ds">{p.desc}</div> : null}
    </div></a>;
}
function ImageEmbed({ src, orig }: { src: string; orig: string }) {
  const [bad, setBad] = useState(false);
  if (bad) return <div className="embed" style={{ padding: 14, marginRight: 8, display: 'flex', gap: 10, color: 'var(--sub)' }}><Icon n="broken_image_outlined" />{host(orig || src)}</div>;
  return <a className="tap embed im" style={{ display: 'block', marginRight: 8 }} href={src} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}><img src={src} alt="" loading="lazy" decoding="async" onError={() => setBad(true)} /></a>;
}
/** Video dari URL: tidak diunduh sampai diketuk (hemat kuota), lalu langsung diputar di tempat. */
function VideoEmbed({ url }: { url: string }) {
  const [on, setOn] = useState(false), [bad, setBad] = useState(false);
  const note = store.t('ext_note').replace('{h}', host(url));
  if (bad) return <a className="embed" style={{ display: 'grid', placeItems: 'center', height: 120, marginRight: 8, background: '#000', color: '#fff' }} href={url} target="_blank" rel="noopener noreferrer"><Icon n="open_in_new_rounded" size={34} /></a>;
  return <div className="embed" style={{ marginRight: 8, background: '#000', position: 'relative' }} onClick={(e) => e.stopPropagation()}>
    {on ? <video src={url} controls autoPlay loop playsInline onError={() => setBad(true)} style={{ maxHeight: 420 }} /> : <div style={{ aspectRatio: '16/9', display: 'grid', placeItems: 'center', position: 'relative' }}>
      <button className="tap" aria-label="Putar" onClick={() => { store.stop(); setOn(true); }} style={{ width: 58, height: 58, borderRadius: '50%', background: 'rgba(255,255,255,.24)', display: 'grid', placeItems: 'center', color: '#fff' }}><Icon n="play_arrow_rounded" size={38} /></button>
      <div style={{ position: 'absolute', left: 14, right: 14, bottom: 10, textAlign: 'center', color: 'rgba(255,255,255,.6)', fontSize: 11.5 }}>{note}</div></div>}
  </div>;
}
function hashCode(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0; return h; }
function AudioEmbed({ url, host: h }: { url: string; host: string }) {
  const key = -(hashCode(url) & 0x3fffffff) - 1000;
  let name = h; try { name = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || h); } catch {}
  return <div style={{ paddingRight: 8 }}><FileBar keyId={key} url={url} secs={0} />
    <div style={{ padding: '4px 0 0 6px', color: 'var(--sub)', fontSize: 11.5 }}>{name} · {store.t('ext_note').replace('{h}', h)}</div></div>;
}
export { firstUrl };
