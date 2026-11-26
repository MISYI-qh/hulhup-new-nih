'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon, HIcon } from './Icon';
import { Api, store, useStore, type A } from '@/lib/store';
import { PBtn, IconBtn, sheet, toast, confirmDlg } from './ui';
import { AudChip, reportSheet } from './aud';
import { Avatar, AiTag, LinkEmbed, PostMedia, QuoteCard, MentionText, Verified, firstUrl, quoteRef } from './rich';
import { postCode, ORIGIN_URL } from '@/lib/links';

export const postLink = (id: number) => `${ORIGIN_URL}/p/${postCode(id)}`;
export const commentLink = (post: number, c: number) => `${ORIGIN_URL}/p/${postCode(post)}/c/${c}`;

export async function shareUrl(u: string) {
  try { if (navigator.share) { await navigator.share({ url: u, title: 'Hulhup' }); return; } throw 0; } catch (e) {
    if ((e as any)?.name === 'AbortError') return;
    try { await navigator.clipboard.writeText(u); } catch {} toast(store.t('link_copied'));
  }
}
export async function sharePost(a: A) {
  const head = a.desc.trim() ? `${a.desc.trim()}${a.long ? '…' : ''}\n\n` : '';
  try { if (navigator.share) { await navigator.share({ text: `${head}${postLink(a.id)}`, title: 'Hulhup' }); return; } throw 0; } catch (e) {
    if ((e as any)?.name === 'AbortError') return;
    try { await navigator.clipboard.writeText(postLink(a.id)); } catch {} toast(store.t('link_copied'));
  }
}
export async function savePost(a: A) {
  if (!store.me) { toast(store.t('need_login')); return; }
  try { const j = await Api.req('POST', `/audios/${a.id}/save`); a.saved = j.saved === true; store.poke(); toast(store.t(a.saved ? 'saved_post' : 'unsaved_post')); if (a.url && a.saved !== store.isOffline(a.id)) store.toggleOffline(a).catch(() => {}); /* simpan = juga tersedia offline */ } catch (e) { toast(store.err(e), { bad: true }); }
}
export async function likeAudio(a: A) {
  if (!store.me) { toast(store.t('need_login')); return; }
  try { await store.like(a); } catch (e) { toast(store.err(e), { bad: true }); }
}
export async function toggleOfflinePost(a: A) {
  const was = store.isOffline(a.id);
  try { await store.toggleOffline(a); toast(store.t(was ? 'removed_off' : 'saved_off')); } catch { toast(store.t('off_fail'), { bad: true }); }
}
export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/* ───── gelombang suara (WavePainter) ───── */
export function waveShape(seed: number, n: number): number[] {
  const M = BigInt(0x7fffffff);
  let x = BigInt.asUintN(64, BigInt(seed) * 2654435761n + 40503n) & M;
  const rnd = () => { x = (x * 1103515245n + 12345n) & M; return Number(x) / 0x7fffffff; };
  const raw = Array.from({ length: n }, () => rnd());
  return raw.map((a, i) => { const b = raw[(i + 1) % n], c = raw[(i + n - 1) % n], env = .55 + .45 * Math.sin(Math.PI * (i + .5) / n); return (.18 + .82 * (a * .6 + b * .2 + c * .2)) * env; });
}
/** Satu loop rAF yang menulis langsung ke DOM (tanpa setState) selama audio `on` diputar. */
export function useRaf(on: boolean, fallbackMs: number, f: (ms: number, dur: number) => void) {
  const fr = useRef(f); fr.current = f;
  useEffect(() => {
    if (!on) { fr.current(0, fallbackMs); return; }
    let r = 0; const loop = () => { fr.current(store.nowSmooth, store.dur > 0 ? store.dur : fallbackMs); r = requestAnimationFrame(loop); };
    r = requestAnimationFrame(loop); return () => cancelAnimationFrame(r);
  }, [on, fallbackMs]);
}
/** Gelombang: gambar sekali (dua kanvas), kemajuan lewat clip-path yang diubah lewat ref. */
export function Wave({ seed, on = false, totalMs = 15000, height = 32 }: { seed: number; on?: boolean; totalMs?: number; height?: number }) {
  const base = useRef<HTMLCanvasElement>(null), top = useRef<HTMLCanvasElement>(null), mover = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const w = base.current!.clientWidth, h = height, dpr = Math.min(devicePixelRatio || 1, 2);
    const cs = getComputedStyle(base.current!), ink = cs.getPropertyValue('--ink').trim() || '#111';
    const rest = `color-mix(in srgb, ${ink} 20%, transparent)`;
    const gap = 3, bw = 3, n = Math.min(80, Math.max(8, Math.floor((w + gap) / (bw + gap)))), hs = waveShape(seed, n);
    for (const [c, col] of [[base.current!, rest], [top.current!, ink]] as const) {
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
      const g = c.getContext('2d')!; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h); g.fillStyle = col;
      for (let i = 0; i < n; i++) { const bh = Math.min(h, Math.max(4, h * hs[i])); g.beginPath(); (g as any).roundRect(i * (bw + gap), (h - bh) / 2, bw, bh, 2); g.fill(); }
    }
  }, [seed, height]);
  // kemajuan hanya lewat transform (dua lapis saling berlawanan): tidak memicu layout maupun paint ulang kanvas
  useRaf(on, totalMs, (ms, dur) => { const m = mover.current, t = top.current; if (!m || !t) return; const q = (1 - Math.min(1, Math.max(0, ms / dur))) * 100; m.style.transform = `translate3d(${-q}%,0,0)`; t.style.transform = `translate3d(${q}%,0,0)`; });
  return <div style={{ position: 'relative', width: '100%', height }} aria-hidden>
    <canvas ref={base} className="wave" style={{ position: 'absolute', inset: 0, width: '100%', height }} />
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}><div ref={mover} style={{ position: 'absolute', inset: 0, overflow: 'hidden', transform: 'translate3d(-100%,0,0)', willChange: 'transform' }}>
      <canvas ref={top} className="wave" style={{ position: 'absolute', inset: 0, width: '100%', height, transform: 'translate3d(100%,0,0)', willChange: 'transform' }} /></div></div></div>;
}
/** Teks waktu yang berubah sekali per detik langsung di DOM. */
export function TimeText({ on, secs, full = false }: { on: boolean; secs: number; full?: boolean }) {
  const el = useRef<HTMLSpanElement>(null), last = useRef(-1);
  const idle = secs > 0 ? mmss(secs) : '·';
  useRaf(on, 0, (ms) => { const e = el.current; if (!e) return; const sec = on ? Math.floor(ms / 1000) : -2; if (sec === last.current) return; last.current = sec; e.textContent = on ? (full ? `${mmss(sec)} / ${mmss(secs)}` : mmss(sec)) : idle; });
  return <span ref={el} style={{ fontVariantNumeric: 'tabular-nums' }}>{idle}</span>;
}
/** Batang kemajuan: hanya transform (scaleX) lewat ref. */
export function ProgBar({ on, totalMs }: { on: boolean; totalMs: number }) {
  const el = useRef<HTMLDivElement>(null);
  useRaf(on, totalMs, (ms, dur) => { const e = el.current; if (e) e.style.transform = `scaleX(${on ? Math.min(1, Math.max(0, ms / dur)) : 0})`; });
  return <div ref={el} style={{ height: '100%', background: 'var(--ink)', transformOrigin: 'left', transform: 'scaleX(0)', willChange: 'transform' }} />;
}

const rateText = (r: number) => (Number.isInteger(r) ? `${r}×` : `${String(r).replace(/0+$/, '')}×`);
/** Pemutar satu audio: tombol putar, gelombang suara, waktu, dan kecepatan (0.5×–2×). */
export function FileBar({ keyId, url, secs, scope, onStart }: { keyId: number; url: string; secs: number; scope?: unknown; onStart?: () => void }) {
  const s = useStore(); const on = s.playing === keyId;
  const total = Math.max(1, on && s.dur > 0 ? s.dur : secs > 0 ? secs * 1000 : 15000);
  return <div className={`fbar${on ? ' on' : ''}`} onClick={(e) => e.stopPropagation()}>
    <button className={`tap pbtn2${on ? ' on' : ''}`} aria-label={on ? 'Jeda' : 'Putar'} onClick={() => { if (!on) onStart?.(); s.playUrl(keyId, url, { scope }).catch(() => toast(s.t('e_server'), { bad: true })); }}><Icon n={on ? 'pause_rounded' : 'play_arrow_rounded'} size={24} /></button>
    <div style={{ flex: 1, minWidth: 0 }}><Wave seed={keyId} on={on} totalMs={total} /></div>
    <span style={{ fontSize: 12.5, fontWeight: 700, color: on ? 'var(--ink)' : 'var(--sub)' }}><TimeText on={on} secs={secs} /></span>
    <button className="tap rate" onClick={() => s.cycleRate()} style={{ color: s.rate === 1 ? 'var(--sub)' : 'var(--acc)' }}>{rateText(s.rate)}</button>
  </div>;
}
export const fileKey = (a: A, i: number) => (i === 0 ? a.id : -(a.id * 20 + i));
export const bgmUrl = (a: A) => a.files[Math.min(a.files.length - 1, Math.max(0, a.bgmIdx))].url;
/** Foto/video post: berkas diambil dengan sesi login, video senyap berulang, ketuk untuk bunyi/jeda. */
export function MediaView({ a }: { a: A }) {
  const [src, setSrc] = useState<string | null>(null); const [err, setErr] = useState(false);
  useEffect(() => { let u = ''; let live = true; Api.bytes(a.files[0]?.url ?? a.url).then((b) => { if (!live) return; if (b) { u = URL.createObjectURL(b); setSrc(u); } else setErr(true); }).catch(() => live && setErr(true)); return () => { live = false; if (u) URL.revokeObjectURL(u); }; }, [a.id]);
  const box = { borderRadius: 18, overflow: 'hidden', background: 'var(--soft)', minHeight: 120, marginTop: 6 } as const;
  if (err) return <div style={{ ...box, display: 'grid', placeItems: 'center', color: 'var(--sub)' }}><Icon n="broken_image_outlined" size={28} /></div>;
  if (!src) return <div style={{ ...box, aspectRatio: '4/3' }} />;
  return <div style={box} onClick={(e) => e.stopPropagation()}>{a.kind === 'video'
    ? <video src={src} muted loop autoPlay playsInline controls={false} onClick={(e) => { const v = e.currentTarget; if (v.muted) v.muted = false; else v.paused ? v.play() : v.pause(); }} style={{ width: '100%', display: 'block', maxHeight: 520 }} />
    : <img src={src} alt="" style={{ width: '100%', display: 'block', maxHeight: 520, objectFit: 'cover' }} />}
    {a.ai ? <div style={{ padding: '6px 10px' }}><AiTag label={store.t(a.aiKind === 'edited' ? 'ai_photo_edit' : 'ai_photo')} /></div> : null}</div>;
}
export function AudioBars({ a, scope }: { a: A; scope?: unknown }) {
  if (a.kind === 'image' || a.kind === 'video') return <MediaView a={a} />;
  return <div>{a.files.map((f, i) => <FileBar key={i} keyId={fileKey(a, i)} url={f.url} secs={f.secs ?? 0} scope={scope} onStart={() => store.countPlay(a)} />)}
    {a.ai ? <AiTag label={store.t(a.aiKind === 'edited' ? 'ai_audio_edit' : 'ai_audio')} /> : null}</div>;
}
/** Penanda backsound: terputar otomatis saat post terlihat; pembaca bisa mematikannya. */
export function BgmBar({ a }: { a: A }) {
  const s = useStore(); const live = s.bgmKey === a.id && !s.bgmMuted;
  return <div className="bgm" onClick={(e) => e.stopPropagation()}>
    <Icon n="music_note_rounded" size={18} color={live ? 'var(--acc)' : 'var(--sub)'} />
    <span style={{ flex: 1, color: live ? 'var(--ink)' : 'var(--sub)' }}>{s.t('bgm_tag')}</span>
    <button className="tap" style={{ padding: 8 }} aria-label="Backsound" onClick={() => { s.setBgmMuted(!s.bgmMuted); if (s.bgmKey !== a.id && !s.bgmMuted && a.files.length) s.playBgm(a.id, bgmUrl(a)); }}><Icon n={s.bgmMuted ? 'volume_off_rounded' : 'volume_up_rounded'} size={20} color={live ? 'var(--ink)' : 'var(--sub)'} /></button>
  </div>;
}

export function OwnerRow({ a, more }: { a: A; more?: () => void }) {
  const s = useStore();
  return <div className="hrow">
    <Link href={`/@${a.owner}`} onClick={(e) => e.stopPropagation()}><Avatar url={a.ownerAvatar} name={a.ownerName} size={42} /></Link>
    <Link href={`/@${a.owner}`} onClick={(e) => e.stopPropagation()} style={{ flex: 1, minWidth: 0, textDecoration: 'none', color: 'inherit' }}>
      <div style={{ display: 'flex', alignItems: 'center' }}><span className="hname" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.ownerName}</span>{a.ownerVerified ? <Verified u={a.owner} /> : null}</div>
      <div className="hsub" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.owner} · {s.when(a.created)}</div></Link>
    {more ? <IconBtn n="more_horiz_rounded" color="var(--sub)" onClick={more} label="Menu" /> : null}
  </div>;
}

export function ActBtn({ k, onClick, on, count }: { k: 'sorot' | 'comment' | 'save' | 'share'; onClick: () => void; on?: boolean; count?: number }) {
  const label = { sorot: 'Sorot', comment: 'Komentar', save: 'Simpan', share: 'Bagikan' }[k];
  return <button className={`tap act${on ? ` on ${k}` : ''}`} aria-label={label} onClick={(e) => { e.stopPropagation(); onClick(); }}>
    <span key={String(on)} style={{ display: 'inline-flex', animation: on ? 'pop .5s cubic-bezier(.2,.8,.2,1)' : undefined }}><HIcon k={k} filled={on && (k === 'sorot' || k === 'save')} size={22} /></span>
    {count != null ? <span>{store.fmt(count)}</span> : null}</button>;
}
/** Aksi di bawah post: sorot, komentar, simpan, bagikan. */
export function PostActions({ a, onComments }: { a: A; onComments?: () => void }) {
  const s = useStore(); const r = useRouter();
  return <div>
    <div className="actrow">
      <ActBtn k="sorot" on={a.liked} count={a.likes} onClick={() => likeAudio(a)} />
      <ActBtn k="comment" count={a.comments} onClick={onComments ?? (() => r.push(`/p/${postCode(a.id)}`))} />
      <span style={{ flex: 1 }} />
      <ActBtn k="save" on={a.saved} onClick={() => savePost(a)} />
      <ActBtn k="share" onClick={() => sharePost(a)} />
    </div>
    <div className="cnts">{a.files.length && !a.bgm && a.kind !== 'image' && a.kind !== 'video' ? `${s.fmt(a.views)} ${s.t('views')} · ${s.fmt(a.plays)} ${s.t('plays')}` : `${s.fmt(a.views)} ${s.t('views')}`}</div>
  </div>;
}

export function postMenu(a: A, onDeleted?: () => void) {
  const s = store, mine = s.me?.username === a.owner;
  return sheet((close) => <div className="stack" style={{ gap: 10 }}>
    <PBtn ghost icon="ios_share_rounded" onClick={() => { close(); sharePost(a); }}>{s.t('share')}</PBtn>
    {s.me ? <PBtn ghost icon="format_quote_rounded" onClick={() => { close(); location.assign(`/new?quote=${encodeURIComponent(postLink(a.id))}`); }}>{s.t('quote_act')}</PBtn> : null}
    {mine ? <PBtn ghost icon="delete_outline_rounded" fg="var(--heart)" onClick={async () => {
      close();
      if (!(await confirmDlg(s.t('delete'), s.t('delete_audio_q'), s.t('delete'), true))) return;
      try { await Api.req('DELETE', `/audios/${a.id}`); onDeleted?.(); } catch (e) { toast(s.err(e), { bad: true }); }
    }}>{s.t('delete')}</PBtn> : s.me ? <PBtn ghost icon="flag_outlined" onClick={() => { close(); reportSheet({ audio: a.id }); }}>{s.t('report')}</PBtn> : null}
  </div>);
}

/** Kartu post (daftar Hups, profil): teks dipangkas 6 baris; teks lengkap di halaman post. */
const fullTexts = new Map<number, Promise<string | null>>();
const loadFullText = (id: number) => { let p = fullTexts.get(id); if (!p) { p = Api.req('GET', `/posts/${id}`).then((j) => (typeof j.text === 'string' ? j.text : null)).catch(() => { fullTexts.delete(id); return null; }); fullTexts.set(id, p); } return p; };
/** Di daftar Hups teks tampil penuh; post panjang diambil utuh saat kartu mendekati layar. */
export function PostCard({ a, scope, onDeleted }: { a: A; scope?: unknown; onDeleted?: () => void }) {
  const s = useStore(); const r = useRouter();
  const ref = useRef<HTMLDivElement>(null); const [full, setFull] = useState<string | null>(null);
  const text = (full ?? a.text ?? a.desc).trim();
  useEffect(() => { store.countView(a); }, [a.id]);
  useEffect(() => {
    if (!a.long || a.text || full != null) return; const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { io.disconnect(); loadFullText(a.id).then((t) => t != null && setFull(t)); } }, { rootMargin: '700px 0px' });
    io.observe(el); return () => io.disconnect();
  }, [a.id, a.long, a.text, full]);
  const q = quoteRef(text), url = q ? null : firstUrl(text);
  return <article ref={ref} className="hcard tap" style={{ display: 'block', cursor: 'pointer', textAlign: 'left' }} data-id={a.id} onClick={() => r.push(`/p/${postCode(a.id)}`)}
    itemScope itemType="https://schema.org/SocialMediaPosting">
    <OwnerRow a={a} more={() => postMenu(a, onDeleted)} />
    <div style={{ padding: '8px 8px 0 0' }}><AudChip rand={a.rand} to={a.to} /></div>
    {text ? <div style={{ padding: '10px 8px 0 0' }}><MentionText text={text} hideQuote ptag={a.ptag} /></div> : null}
    <PostMedia text={text} media={a.media} />
    {a.files.length ? <div style={{ paddingRight: 8 }}>{a.bgm ? <BgmBar a={a} /> : <AudioBars a={a} scope={scope} />}</div> : null}
    <div style={{ height: 4 }} />
    <PostActions a={a} />
  </article>;
}
