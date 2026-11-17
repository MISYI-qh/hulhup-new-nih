'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AnimMark from './AnimMark';
import { Overlays, TopBar, Loader, Empty, toast } from './ui';
import { store, useStore } from '@/lib/store';

/** Mulai penyimpanan (sesi, tema, bahasa, offline, hitungan tertunda) sekali di sisi klien. */
export function Boot() {
  const ready = useStore().ready;
  const hide = () => {
    const el = document.getElementById('splash'); if (!el || el.classList.contains('out')) return;
    // satu frame setelah konten siap, supaya fade-out tidak bertabrakan dengan paint pertama
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.classList.add('out');
      const rm = () => el.remove();
      el.addEventListener('transitionend', rm, { once: true }); setTimeout(rm, 900);
    }));
  };
  useEffect(() => { store.banner = (m) => toast(m); store.init(); const t = setTimeout(hide, 3000); return () => clearTimeout(t); }, []);
  useEffect(() => { if (!ready) return; const t = setTimeout(hide, 220); return () => clearTimeout(t); }, [ready]);
  return <Overlays />;
}
export function Brand({ onClick }: { onClick?: () => void }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 10 }} onClick={onClick}>
    <AnimMark width={40} auto slow tapPlay />
    <span style={{ fontWeight: 800, fontSize: 21, letterSpacing: -.4 }}>Hulhup</span></div>;
}
export const useNav = () => { const r = useRouter(); return { push: (p: string) => r.push(p), replace: (p: string) => r.replace(p), back: () => (history.length > 1 ? r.back() : r.push('/')) }; };

/** Halaman biasa: bilah atas + isi. */
export function Screen({ title, back = true, actions, center, children }: { title?: string; back?: boolean; actions?: React.ReactNode; center?: React.ReactNode; children: React.ReactNode }) {
  useStore();
  return <div className="app"><TopBar title={title} back={back} actions={actions} center={center} />{children}</div>;
}
/** Tunggu penyimpanan siap (agar sesi dari localStorage terbaca) sebelum menampilkan layar yang butuh akun. */
export function useReady() { const s = useStore(); return s.ready; }
export function NeedLogin() {
  const s = useStore(); const n = useNav();
  return <Empty icon="person_outline_rounded" text={`${s.t('guest')}\n${s.t('guest_note')}`} action={<button className="tap pbtn" style={{ width: 200 }} onClick={() => n.push('/login')}>{s.t('login')}</button>} />;
}
export { Loader };
