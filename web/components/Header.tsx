'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import Logo from './Logo';
import { me as getMe, setSession, req, type Me } from '@/lib/client';

export default function Header() {
  const [u, setU] = useState<Me | null>(null);
  useEffect(() => {
    const f = () => setU(getMe());
    f(); window.addEventListener('hulhup-auth', f); return () => window.removeEventListener('hulhup-auth', f);
  }, []);
  return (
    <header className="top"><div className="wrap">
      <Link href="/" className="brand" aria-label="Hulhup, beranda"><Logo size={38} tile /> Hulhup</Link>
      <nav className="menu" aria-label="Menu utama">
        <Link href="/hups" className="pill">Hups</Link>
        <Link href="/search" className="pill" aria-label="Cari">Cari</Link>
        {u ? <>
          <Link href={`/@${u.username}`} className="pill">@{u.username}</Link>
          <button className="pill" onClick={() => { req('POST', '/logout').catch(() => {}); setSession('', null); }}>Keluar</button>
        </> : <Link href="/login" className="pill dark">Masuk</Link>}
      </nav>
    </div></header>
  );
}
