'use client';
import { useEffect } from 'react';

const BUILD = process.env.NEXT_PUBLIC_BUILD ?? '';
/** Segarkan paksa: hapus cache peramban lalu muat ulang (maksimal sekali per versi supaya tidak berputar). */
export async function hardRefresh(tag: string) {
  try { if (sessionStorage.getItem('hh_fresh') === tag) return; sessionStorage.setItem('hh_fresh', tag); } catch {}
  try { const ks = await caches.keys(); await Promise.all(ks.map((k) => caches.delete(k))); } catch {}
  try { const rs = await navigator.serviceWorker?.getRegistrations(); await Promise.all((rs ?? []).map((r) => r.unregister())); } catch {}
  location.reload();
}
const isChunk = (m: string) => /ChunkLoadError|Loading chunk|Loading CSS chunk|Failed to fetch dynamically imported|error loading dynamically/i.test(m);

/** Cek versi saat dibuka, saat kembali ke tab, dan berkala; kalau server sudah punya versi baru, pengguna otomatis dapat yang baru. */
export function Fresh() {
  useEffect(() => {
    if (!BUILD) return; let last = 0;
    const check = async () => {
      if (Date.now() - last < 15000) return; last = Date.now();
      try { const r = await fetch('/api/build', { cache: 'no-store' }); const j = await r.json(); if (j?.b && j.b !== BUILD) await hardRefresh(j.b); } catch {}
    };
    const vis = () => { if (document.visibilityState === 'visible') check(); };
    const er = (e: ErrorEvent) => { if (isChunk(String(e.message))) check(); };
    const pr = (e: PromiseRejectionEvent) => { if (isChunk(String((e.reason as any)?.message ?? e.reason))) check(); };
    check(); const t = setInterval(check, 120000);
    document.addEventListener('visibilitychange', vis); window.addEventListener('focus', vis); window.addEventListener('error', er); window.addEventListener('unhandledrejection', pr);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); window.removeEventListener('focus', vis); window.removeEventListener('error', er); window.removeEventListener('unhandledrejection', pr); };
  }, []);
  return null;
}
