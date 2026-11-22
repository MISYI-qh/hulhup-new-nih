'use client';
import { useEffect } from 'react';
import { hardRefresh } from '@/components/fresh';

/** Kalau halaman error (biasanya karena file lama di cache), segarkan otomatis sekali; kalau masih error tampilkan tombol. */
export default function Err({ reset }: { error: Error; reset: () => void }) {
  useEffect(() => { hardRefresh('err-' + (process.env.NEXT_PUBLIC_BUILD ?? '')); }, []);
  return <div style={{ padding: 32, textAlign: 'center' }}>
    <p style={{ fontWeight: 700 }}>Ada yang error. Coba lagi ya.</p>
    <button onClick={() => { try { sessionStorage.removeItem('hh_fresh'); } catch {} location.reload(); }} style={{ padding: '10px 20px', borderRadius: 20, fontWeight: 700 }}>Muat ulang</button>
    <div style={{ height: 8 }} /><button onClick={reset} style={{ padding: 8, color: 'gray' }}>Coba tanpa muat ulang</button></div>;
}
