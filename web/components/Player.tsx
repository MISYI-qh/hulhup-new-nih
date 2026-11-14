'use client';
import { useEffect, useRef, useState } from 'react';
import { API } from '@/lib/api';
import { req, token } from '@/lib/client';

let current: { stop: () => void } | null = null;

/** Pemutar audio Hulhup: satu suara pada satu waktu; hitungan "diputar" dikirim sekali per akun. */
export default function Player({ id, url, secs, count = true }: { id: number; url: string; secs: number; count?: boolean }) {
  const a = useRef<HTMLAudioElement | null>(null);
  const [on, setOn] = useState(false);
  const [pct, setPct] = useState(0);
  const counted = useRef(false);
  const src = useRef('');

  useEffect(() => () => { a.current?.pause(); if (src.current.startsWith('blob:')) URL.revokeObjectURL(src.current); }, []);

  async function toggle() {
    const el = a.current!;
    if (on) { el.pause(); return; }
    current?.stop();
    if (!el.src) {
      const t = token();
      if (t) {
        const r = await fetch(API + url, { headers: { authorization: `Bearer ${t}` } });
        if (r.ok) { src.current = URL.createObjectURL(await r.blob()); el.src = src.current; }
      }
      if (!el.src) el.src = API + url;
    }
    current = { stop: () => el.pause() };
    await el.play().catch(() => {});
    if (count && !counted.current && token()) { counted.current = true; req('POST', `/audios/${id}/play`).catch(() => { counted.current = false; }); }
  }

  return (
    <div className="player">
      <button className="play" onClick={toggle} aria-label={on ? 'Jeda' : 'Putar'}>{on ? '❚❚' : '▶'}</button>
      <div className="bar"><i style={{ width: `${pct}%` }} /></div>
      <span className="muted" style={{ fontSize: 13 }}>{secs}s</span>
      <audio ref={a} preload="none" onPlay={() => setOn(true)} onPause={() => setOn(false)} onEnded={() => { setOn(false); setPct(0); }}
        onTimeUpdate={(e) => setPct(((e.currentTarget.currentTime || 0) / (e.currentTarget.duration || secs || 1)) * 100)} />
    </div>
  );
}
