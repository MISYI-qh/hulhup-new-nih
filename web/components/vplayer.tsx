'use client';
import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';

const SPEEDS = [1, 1.5, 2];
const fmt = (n: number) => { if (!isFinite(n) || n < 0) n = 0; const m = Math.floor(n / 60), s = Math.floor(n % 60); return `${m}:${String(s).padStart(2, '0')}`; };

/** Pemutar video Hulhup: tanpa menu unduh / kecepatan / PiP bawaan peramban. Ukuran mengikuti video (tanpa bilah hitam). */
export function VPlayer({ url, poster, onBad, maxH = 460 }: { url: string; poster?: string; onBad: () => void; maxH?: number }) {
  const v = useRef<HTMLVideoElement>(null), box = useRef<HTMLDivElement>(null), hideT = useRef<any>(null);
  const [ratio, setRatio] = useState(0), [fs, setFs] = useState(false), [play, setPlay] = useState(true), [cur, setCur] = useState(0), [dur, setDur] = useState(0), [wait, setWait] = useState(true);
  const [muted, setMuted] = useState(false), [sp, setSp] = useState(1), [ui, setUi] = useState(true), [drag, setDrag] = useState(false);
  const poke = () => { setUi(true); clearTimeout(hideT.current); hideT.current = setTimeout(() => setUi(false), 2400); };
  useEffect(() => { poke(); return () => clearTimeout(hideT.current); }, []);
  const toggle = () => { const e = v.current; if (!e) return; if (e.paused) e.play().catch(() => {}); else e.pause(); poke(); };
  const seekTo = (x: number, el: HTMLElement) => { const e = v.current; if (!e || !dur) return; const r = el.getBoundingClientRect(); e.currentTime = Math.max(0, Math.min(1, (x - r.left) / r.width)) * dur; setCur(e.currentTime); };
  useEffect(() => { const f = () => setFs(document.fullscreenElement === box.current || (document as any).webkitFullscreenElement === box.current); document.addEventListener('fullscreenchange', f); document.addEventListener('webkitfullscreenchange', f); return () => { document.removeEventListener('fullscreenchange', f); document.removeEventListener('webkitfullscreenchange', f); }; }, []);
  const full = () => {
    const el: any = box.current, vv: any = v.current; if (!el) return; poke();
    if (fs) { (document.exitFullscreen ?? (document as any).webkitExitFullscreen)?.call(document); return; }
    const go = el.requestFullscreen ?? el.webkitRequestFullscreen;
    if (go) go.call(el); else vv?.webkitEnterFullscreen?.();
  };
  // keluar dari layar -> jeda (kecuali sedang layar penuh)
  useEffect(() => {
    const el = box.current; if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([x]) => { if (!x.isIntersecting && !document.fullscreenElement && !(document as any).webkitFullscreenElement) v.current?.pause(); }, { threshold: 0.15 });
    io.observe(el); return () => io.disconnect();
  }, []);
  const shown = ui || !play || drag;
  return <div ref={box} className="vp" style={fs || !ratio ? undefined : { width: `min(100%, ${maxH * ratio}px)` }} onClick={(e) => { e.stopPropagation(); if ((e.target as HTMLElement).closest('.vpc')) return; shown && play ? toggle() : (poke(), play || toggle()); }} onMouseMove={poke}>
    <video ref={v} src={url} poster={poster} autoPlay loop playsInline controlsList="nodownload noplaybackrate noremoteplayback" disablePictureInPicture disableRemotePlayback onContextMenu={(e) => e.preventDefault()}
      onError={onBad} onPlay={() => setPlay(true)} onPause={() => setPlay(false)} onWaiting={() => setWait(true)} onPlaying={() => setWait(false)} onCanPlay={() => setWait(false)}
      onLoadedMetadata={(e) => { const t = e.target as HTMLVideoElement; setDur(t.duration); if (t.videoWidth && t.videoHeight) setRatio(t.videoWidth / t.videoHeight); }} onTimeUpdate={(e) => { if (!drag) setCur((e.target as HTMLVideoElement).currentTime); }} />
    {wait && play ? <div className="vp-spin" /> : null}
    {!play ? <button className="vp-big tap" aria-label="Putar" onClick={(e) => { e.stopPropagation(); toggle(); }}><Icon n="play_arrow_rounded" size={40} /></button> : null}
    <div className={'vpc' + (shown ? ' on' : '')} onClick={(e) => e.stopPropagation()}>
      <button className="vp-b tap" aria-label={play ? 'Jeda' : 'Putar'} onClick={toggle}><Icon n={play ? 'pause_rounded' : 'play_arrow_rounded'} size={22} /></button>
      <span className="vp-t">{fmt(cur)}</span>
      <div className="vp-seek" onPointerDown={(e) => { setDrag(true); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); seekTo(e.clientX, e.currentTarget); }}
        onPointerMove={(e) => { if (drag) seekTo(e.clientX, e.currentTarget); }} onPointerUp={() => { setDrag(false); poke(); }} onPointerCancel={() => setDrag(false)}>
        <div className="vp-trk"><i style={{ width: dur ? `${(cur / dur) * 100}%` : 0 }} /></div>
      </div>
      <span className="vp-t end">{fmt(dur)}</span>
      <button className="vp-sp tap" aria-label="Kecepatan" onClick={() => { const n = SPEEDS[(SPEEDS.indexOf(sp) + 1) % SPEEDS.length]; setSp(n); if (v.current) v.current.playbackRate = n; poke(); }}>{sp}×</button>
      <button className="vp-b tap" aria-label="Suara" onClick={() => { const m = !muted; setMuted(m); if (v.current) v.current.muted = m; poke(); }}><Icon n={muted ? 'volume_off_rounded' : 'volume_up_rounded'} size={20} /></button>
      <button className="vp-b tap" aria-label="Layar penuh" onClick={full}><Icon n={fs ? 'fullscreen_exit_rounded' : 'fullscreen_rounded'} size={22} /></button>
    </div>
  </div>;
}
