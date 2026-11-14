'use client';
import { useState } from 'react';
import Logo from './Logo';
import PostCard from './PostCard';
import { req } from '@/lib/client';
import type { Post } from '@/lib/api';

/** Tombol Acak: satu ketukan, satu post acak (suara atau tulisan). */
export default function AcakButton() {
  const [go, setGo] = useState(false);
  const [post, setPost] = useState<Post | null>(null);
  const [empty, setEmpty] = useState(false);
  const [last, setLast] = useState(0);

  async function tap() {
    setGo(false); requestAnimationFrame(() => setGo(true));
    try {
      const j = await req<{ audio: Post | null }>('GET', `/random?f=public${last ? `&last=${last}` : ''}`);
      if (!j.audio) { setEmpty(true); return; }
      setLast(j.audio.id); setPost(j.audio);
      req('POST', `/audios/${j.audio.id}/view`).catch(() => {});
    } catch { setEmpty(true); }
  }

  return (
    <>
      <button className={`acak${go ? ' go' : ''}`} onClick={tap} aria-label="Acak: dengarkan suara atau tulisan acak">
        <span className="ring" /><span className="ring b" />
        <Logo size={104} eyes="#fff" pupil="var(--brand)" wall="var(--deep)" anim />
      </button>
      <div style={{ fontWeight: 800, fontSize: 20 }}>Acak</div>
      {empty ? <p className="muted">Belum ada yang bisa ditampilkan. Coba lagi sebentar.</p> : null}
      {post ? (
        <div className="sheet" onClick={() => setPost(null)}>
          <div className="in" onClick={(e) => e.stopPropagation()}>
            <PostCard p={post} full />
            <button className="pill dark" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} onClick={tap}>Acak lagi</button>
          </div>
        </div>
      ) : null}
    </>
  );
}
