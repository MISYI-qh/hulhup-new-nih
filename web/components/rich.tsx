'use client';
import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Icon, HIcon } from './Icon';
import { Api, store, useStore } from '@/lib/store';
import { toast, PBtn } from './ui';
import { useRouter } from 'next/navigation';
import { firstUrl, kindOfUrl, linkRe, linkUri, proxied, trimLink, mediaUrl, quoteRef, mediaRef, mediaRefs, embedOf, socialHost, postCode } from '@/lib/links';
import { A } from '@/lib/store';
import { FileBar, fileKey } from './post';
import { VPlayer } from './vplayer';

export function Avatar({ url, name, size }: { url?: string | null; name: string; size: number }) {
  const [bad, setBad] = useState(false);
  const init = (name || '?').trim().charAt(0).toUpperCase() || '?';
  const off = !!url && /\/users\/(phipop|misyi|hulhup)\/avatar/.test(url);
  return <span className="avatar" style={{ width: size, height: size, fontSize: size * .42, ...(off ? { background: 'var(--bg)' } : {}) }}>
    {url && !bad ? <img src={mediaUrl(url)} alt="" width={size} height={size} loading="lazy" decoding="async" style={off ? { objectFit: 'contain' } : undefined} onError={() => setBad(true)} /> : init}</span>;
}
/** Warna centang dari server (GET /badges): ungu = segelintir akun, biru = organisasi/perusahaan >2 orang, oranye = pengguna biasa. */
const BADGE_MAP: Record<string, string> = {};
const BADGE_COL: Record<string, string> = { purple: '#8B5CF6', blue: 'var(--blue)', orange: '#FF7A1A' };
if (typeof window !== 'undefined') Api.req('GET', '/badges').then((j: any) => { Object.assign(BADGE_MAP, j.badges || {}); store.poke(); }).catch(() => {});
export const badgeColor = (u?: string) => BADGE_COL[BADGE_MAP[`${u}`]] || '#FF7A1A';
export const Verified = ({ size = 15, u }: { size?: number; u?: string }) => <Icon n="verified_rounded" size={size} color={badgeColor(u)} style={{ marginLeft: 4 }} />;

export function AiTag({ label }: { label: string }) { return <div className="aitag"><Icon n="auto_awesome_rounded" size={13} color="#d6336c" />{label}</div>; }

/** Buka tautan: halaman Hulhup dibuka di dalam situs, situs lain di tab baru. */
export function openLink(raw: string, push: (p: string) => void) {
  const u = linkUri(raw); if (!u) return;
  const h = u.hostname.toLowerCase();
  if (h === 'hulhup.my.id' || h === 'www.hulhup.my.id') { push((u.pathname || '/') + u.search); return; }
  window.open(u.toString(), '_blank', 'noopener,noreferrer');
}

/** Teks dengan @nama dan tautan yang bisa diketuk. */
/** Tag khusus @phipop (ala Meta AI di Threads): hanya untuk akun yang punya akses. */
export const PhTag = () => <Link href="/@phipop" className="phtag" onClick={(e) => e.stopPropagation()}><img src="/phipop.png" alt="" width={18} height={18} />Phipop</Link>;
/** Baris "Phipop lagi mikir/nyari" (animasi). label = "run:<jenis>|<teks>". */
export function PhRun({ label, size = 26 }: { label?: string; size?: number }) {
  const m = /^run:([a-z]+)(?:\|(.*))?$/.exec(label ?? ''); const k = m?.[1] ?? 'mikir'; const t = m?.[2] || 'mikir…';
  const ic = k === 'web' ? 'language_rounded' : k === 'page' ? 'link_rounded' : k === 'media' ? 'headphones_rounded' : null;
  return <div className="phrun"><span className="phlogo" style={{ width: size, height: size }}><img src="/phipop.png" alt="" width={size} height={size} /></span>{ic ? <Icon n={ic} size={16} color="var(--sub)" /> : null}<span className="phl">{t}</span><i /><i /><i /></div>;
}
export function MentionText({ text, className, style, clamp, hideQuote, ptag }: { text: string; className?: string; style?: React.CSSProperties; clamp?: number; hideQuote?: boolean; ptag?: boolean }) {
  const out: React.ReactNode[] = []; let last = 0, k = 0; const qr = hideQuote ? quoteRef(text) : null; const hid = hideQuote ? (qr ? [qr] : mediaRefs(text, !!store.me)) : []; const hat = new Set(hid.map((x) => x.at)); const q = hid.length ? hid[0] : null;
  const re = new RegExp(`${linkRe().source}|@([a-z0-9_]{3,20})`, 'gi');
  for (const m of text.matchAll(re)) {
    const raw = m[0], tag = m[2] != null, shown = tag ? raw : trimLink(raw);
    if (!shown) continue;
    const at = m.index!;
    if (hat.size && !tag && hat.has(at)) { if (at > last) out.push(text.slice(last, at).replace(/\s+$/, '')); last = at + shown.length; continue; }
    if (at > last) out.push(text.slice(last, at));
    out.push(tag && ptag && m[2].toLowerCase() === 'phipop' ? <PhTag key={k++} />
      : tag
      ? <Link key={k++} href={`/@${m[2].toLowerCase()}`} className="mention" onClick={(e) => e.stopPropagation()}>{shown}</Link>
      : <a key={k++} className="hlink" href={linkUri(shown)?.toString() ?? '#'} target="_blank" rel="noopener noreferrer nofollow ugc" onClick={(e) => e.stopPropagation()}>{shown}</a>);
    last = at + shown.length;
  }
  if (last < text.length) out.push(q ? text.slice(last).replace(/^\s+/, '') : text.slice(last));
  if (q && !out.some((x) => typeof x !== 'string' || x.trim())) return null;
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
    t.current = setTimeout(async () => { try { const j = await Api.req('GET', `/search?q=${encodeURIComponent(nq)}&m=1`); if (my === seq.current) setUsers((j.users as any[]).slice(0, 6)); } catch {} }, 280);
  }, [value]);
  useEffect(() => () => clearTimeout(t.current), []);
  if (!users.length) return null;
  return <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6 }}>{users.map((u) => (
    <button key={u.username} className="tap chip" style={{ padding: '4px 14px 4px 6px', flex: 'none' }} onClick={() => { const m = /@([a-z0-9_]{1,20})$/.exec(value); if (m) { onPick(`${value.slice(0, m.index)}@${u.username} `); setUsers([]); } }}>
      <Avatar url={u.avatar} name={u.name} size={28} /><span style={{ fontWeight: 700 }}>@{u.username}</span></button>))}</div>;
}

const quotes = new Map<string, Promise<A | null>>();
function fetchQuote(id: number) {
  const key = `${id}:${store.me?.username ?? ''}`; let p = quotes.get(key);
  if (!p) { p = Api.req('GET', `/posts/${id}`).then((j) => (j.post ? new A(j.post) : null)).catch((e) => { const c = `${e?.code ?? e?.message ?? ''}`; if (/server|network|offline|fetch/i.test(c)) quotes.delete(key); return null; }); quotes.set(key, p); }
  return p;
}

/** Kutipan post Hulhup di dalam post lain (seperti Threads): langsung tampil, tanpa mengetuk. Dimuat saat mendekati layar. */
export function QuoteCard({ id }: { id: number }) {
  const s = useStore(); const r = useRouter(); const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false); const [a, setA] = useState<A | null | undefined>(undefined);
  useEffect(() => {
    const el = ref.current; if (!el || seen) return;
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { io.disconnect(); setSeen(true); } }, { rootMargin: '500px 0px' });
    io.observe(el); return () => io.disconnect();
  }, [seen]);
  useEffect(() => { if (!seen) return; let on = true; setA(undefined); fetchQuote(id).then((x) => on && setA(x)); return () => { on = false; }; }, [seen, id, s.me?.username]);
  if (a === undefined) return <div ref={ref} className="embed quote"><div className="sk" style={{ height: 112, borderRadius: 0 }} /></div>;
  if (a === null) return <div ref={ref} className="embed quote na" onClick={(e) => e.stopPropagation()}><Icon n="lock_outline_rounded" size={18} color="var(--sub)" /><span>{s.t('quote_na')}</span></div>;
  const text = (a.text ?? a.desc ?? '').trim(); const go = (e: React.SyntheticEvent) => { e.stopPropagation(); r.push(`/p/${postCode(a.id)}`); };
  return <div ref={ref} className="embed quote tap" role="link" tabIndex={0} onClick={go} onKeyDown={(e) => { if (e.key === 'Enter') go(e); }}>
    {a.pprof ? <div className="qh"><Avatar url={a.ownerAvatar} name={a.ownerName} size={26} />
      <b>{a.ownerName}</b>{a.ownerVerified ? <Verified size={14} u={a.owner} /> : null}<span className="qs">{a.owner} · {s.when(a.created)}</span></div> : null}
    {text ? <div className="qt"><MentionText text={text.replace(/\s+$/, '')} hideQuote ptag={a.ptag} /></div> : null}
    {quoteRef(text) ? <MediaStrip items={a.media ?? []} /> : <div className="qm"><PostMedia text={text} media={a.media} /></div>}
    {a.files.length && !a.bgm ? <div style={{ padding: '4px 0 0' }}><FileBar keyId={fileKey(a, 0)} url={a.files[0].url} secs={a.files[0].secs ?? 0} onStart={() => store.countPlay(a)} /></div> : null}
    <div className="qf"><span><HIcon k="sorot" size={16} />{a.likes}</span><span><HIcon k="comment" size={16} />{a.comments}</span></div>
  </div>;
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
  const s = useStore(); const [p, setP] = useState<any | null>(null); const [done, setDone] = useState(false);
  const k = kindOfUrl(url), fr = embedOf(url);
  useEffect(() => { let on = true; if (!fr && (k === 'page' || k === 'image')) fetchPreview(url).then((x) => { if (on) { setP(x); setDone(true); } }); return () => { on = false; }; }, [url, k, s.me?.username]);
  if (fr) return <FrameEmbedView e={fr} url={url} />;
  if (k === 'video') return <VideoEmbed url={url} />;
  if (k === 'audio') return <AudioEmbed url={url} host={host(url)} />;
  if (!p) return done && socialHost(url) ? <OpenCard url={url} /> : null;
  if (p.video) return <VideoEmbed url={`${p.video}`} poster={p.image ? proxied(`${p.image}`) : undefined} tall={socialHost(url)} orig={url} />;
  switch (`${p.kind}`) {
    case 'image': return <ImageEmbed src={proxied(`${p.src}`)} orig={`${p.url}`} />;
    case 'video': return <VideoEmbed url={`${p.url}`} />;
    case 'audio': return <AudioEmbed url={`${p.url}`} host={host(url)} />;
  }
  return <PageCard url={url} p={p} />;
}

/** Pemutar sematan situs lain langsung tampil di dalam post (iframe resmi, dimuat malas saat mendekati layar). */
function FrameEmbedView({ e, url }: { e: import('@/lib/links').FrameEmbed; url: string }) {
  const ref = useRef<HTMLDivElement>(null); const [seen, setSeen] = useState(false);
  useEffect(() => { // dimuat saat mendekati layar; dilepas (berhenti memutar) saat sudah jauh keluar layar
    const el = ref.current; if (!el) return;
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return; }
    const io = new IntersectionObserver(([x]) => setSeen(x.isIntersecting), { rootMargin: '0px 0px' });
    io.observe(el); return () => io.disconnect();
  }, []);
  return <div ref={ref} className="embed frame" style={{ marginRight: 8, background: 'var(--soft)', position: 'relative', ...(e.ratio ? { aspectRatio: e.ratio, maxHeight: 560 } : { height: e.h }) }} onClick={(x) => x.stopPropagation()}>
    {seen ? <iframe src={e.src} title={e.host} loading="lazy" allow="autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }} /> : null}
    <a href={url} target="_blank" rel="noopener noreferrer nofollow ugc" aria-label={e.host} className="frame-open" onClick={(x) => x.stopPropagation()}><Icon n="open_in_new_rounded" size={16} /></a>
  </div>;
}

/** Cadangan bila pratinjau situs sosial tidak bisa diambil: kartu kecil yang membuka tautan aslinya. */
function OpenCard({ url }: { url: string }) {
  return <a className="tap embed" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 14, marginRight: 8, textDecoration: 'none', color: 'inherit' }} href={linkUri(url)?.toString()} target="_blank" rel="noopener noreferrer nofollow ugc" onClick={(e) => e.stopPropagation()}>
    <Icon n="open_in_new_rounded" size={20} color="var(--sub)" /><span style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{host(url)}</span></a>;
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
  const [bad, setBad] = useState(false), [full, setFull] = useState(false);
  if (bad) return <div className="embed" style={{ padding: 14, marginRight: 8, display: 'flex', gap: 10, color: 'var(--sub)' }}><Icon n="broken_image_outlined" />{host(orig || src)}</div>;
  return <>
    <button className="tap embed im nat" style={{ display: 'block', marginRight: 8, padding: 0, width: '100%' }} aria-label="Perbesar" onClick={(e) => { e.stopPropagation(); setFull(true); }}><img src={src} alt="" loading="lazy" decoding="async" onError={() => setBad(true)} /></button>
    {full ? <Lightbox src={src} onClose={() => setFull(false)} /> : null}
  </>;
}
function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); const o = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { window.removeEventListener('keydown', k); document.body.style.overflow = o; }; }, []);
  return createPortal(<div className="lbx" onClick={(e) => { e.stopPropagation(); onClose(); }}><img src={src} alt="" onClick={(e) => e.stopPropagation()} /><button className="lbx-x tap" aria-label="Tutup" onClick={(e) => { e.stopPropagation(); onClose(); }}><Icon n="close_rounded" size={24} /></button></div>, document.body);
}
/** Video dari URL: tidak diunduh sampai diketuk (hemat kuota), lalu langsung diputar di tempat. */
function VideoEmbed({ url, poster, orig }: { url: string; poster?: string; tall?: boolean; orig?: string }) {
  const [on, setOn] = useState(false), [bad, setBad] = useState(false);
  if (bad) return <a className="embed" style={{ display: 'grid', placeItems: 'center', height: 120, marginRight: 8, background: 'var(--soft)', color: 'var(--ink)' }} href={orig ?? url} target="_blank" rel="noopener noreferrer"><Icon n="open_in_new_rounded" size={34} /></a>;
  return <div className="embed vemb" style={{ marginRight: 8 }} onClick={(e) => e.stopPropagation()}>
    {on ? <VPlayer url={url} poster={poster} onBad={() => setBad(true)} /> : <div className={'vpre' + (poster ? '' : ' np')}>
      {poster ? <img src={poster} alt="" loading="lazy" decoding="async" onError={() => setBad(true)} /> : null}
      <button className="vp-big tap" aria-label="Putar" onClick={() => { store.stop(); setOn(true); }}><Icon n="play_arrow_rounded" size={40} /></button></div>}
  </div>;
}
function hashCode(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0; return h; }
function AudioEmbed({ url, host: h }: { url: string; host: string }) {
  const key = -(hashCode(url) & 0x3fffffff) - 1000;
  let name = h; try { name = decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || h); } catch {}
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { // keluar dari layar -> hentikan audio ini
    const el = ref.current; if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([x]) => { if (!x.isIntersecting && store.playing === key) store.stop(); }, { threshold: 0 });
    io.observe(el); return () => io.disconnect();
  }, [key]);
  return <div ref={ref} style={{ paddingRight: 8 }}><FileBar keyId={key} url={url} secs={0} />
    <div style={{ padding: '4px 0 0 6px', color: 'var(--sub)', fontSize: 11.5 }}>{name} · {store.t('ext_note').replace('{h}', h)}</div></div>;
}
/** Deretan media dari URL: digeser ke samping seperti Threads, tiap item tampil langsung. */
export function PostMedia({ text, media }: { text: string; media?: string[] }) {
  const s = useStore(); const q = quoteRef(text);
  const list: string[] = [...(media ?? [])];
  if (!q) for (const r of mediaRefs(text, !!s.me)) if (!list.includes(r.url)) list.push(r.url);
  if (!q) { // tautan halaman biasa (kartu) menyusul di belakang media
    for (const m of text.matchAll(linkRe())) { const raw = trimLink(m[0]); if (!raw || raw.startsWith('@')) continue; const u = linkUri(raw)?.toString(); if (u && !list.includes(u)) list.push(u); }
  }
  return <>{q ? <QuoteCard id={q.id} /> : null}<MediaStrip items={list} /></>;
}
export function MediaStrip({ items }: { items: string[] }) {
  if (!items?.length) return null;
  const one = items.length === 1;
  return <div className="mstrip" onClick={(e) => e.stopPropagation()}>
    {items.map((u, i) => <div key={u + i} className="msi" style={one ? { width: '100%' } : undefined}><LinkEmbed url={u} /></div>)}
  </div>;
}
/** Kartu kutipan di penulis (ala Threads): tautan post Hulhup keluar dari kolom teks dan jadi kartu dengan tombol hapus. */
export function QuoteSlot({ url, onClear }: { url: string; onClear: () => void }) {
  const q = quoteRef(url); if (!q) return null;
  return <div className="qslot"><QuoteCard id={q.id} /><button className="tap" aria-label="Hapus kutipan" onClick={onClear}><Icon n="close_rounded" size={16} /></button></div>;
}
/** Pisahkan tautan post Hulhup pertama dari teks (kalau belum ada kutipan terpasang). */
export function pullQuote(text: string): { text: string; quote: string | null } {
  const q = quoteRef(text); if (!q) return { text, quote: null };
  const url = text.slice(q.at, q.at + q.len);
  return { text: (text.slice(0, q.at) + text.slice(q.at + q.len)).replace(/[ \t]+\n/g, '\n').replace(/^\s+/, '').replace(/ {2,}/g, ' '), quote: url };
}
export { firstUrl, quoteRef };
