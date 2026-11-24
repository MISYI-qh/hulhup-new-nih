'use client';
import { useEffect } from 'react';
import { hardRefresh } from '@/components/fresh';
import { reportErr } from '@/lib/report';

/** Error di tingkat paling atas (layout/boot): laporkan, lalu muat ulang otomatis sekali supaya pengunjung tidak melihat layar error bawaan. */
export default function GlobalErr({ error }: { error: Error }) {
  useEffect(() => { reportErr(error); hardRefresh('gerr-' + (process.env.NEXT_PUBLIC_BUILD ?? '')); }, [error]);
  return <html lang="id"><body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', display: 'grid', placeItems: 'center', minHeight: '100vh', textAlign: 'center' }}>
    <div><p style={{ fontWeight: 700 }}>Memuat ulang…</p>
      <button onClick={() => { try { sessionStorage.removeItem('hh_fresh'); } catch {} location.reload(); }} style={{ padding: '10px 20px', borderRadius: 20, fontWeight: 700, border: 0, background: '#111', color: '#fff' }}>Muat ulang</button></div></body></html>;
}
