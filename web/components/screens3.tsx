'use client';
import { useState } from 'react';
import { Screen } from './shell';
import { Empty } from './ui';
import { useStore } from '@/lib/store';
import legal from '@/content/legal.json';

/** Halaman teks (Tentang, Ketentuan, Privasi). */
export function TextScreen({ k }: { k: 'about' | 'policy' | 'privacy' }) {
  const s = useStore();
  return <Screen title={s.t(k)}><div style={{ padding: '8px 24px 40px' }}><div className="rise" style={{ fontSize: 16, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{s.t(`${k}_t`)}</div></div></Screen>;
}
export function FaqScreen() {
  const s = useStore(); const [open, setOpen] = useState(-1);
  const qa = (legal.faq as Record<string, string[][]>)[s.lang] ?? legal.faq.id;
  return <Screen title="FAQ"><div style={{ padding: '4px 18px 40px' }}>
    {qa.map(([q, a], i) => <div key={i} style={{ marginBottom: 10, background: 'var(--soft)', borderRadius: 22 }}>
      <button className="tap" aria-expanded={open === i} style={{ width: '100%', textAlign: 'left', padding: '16px 18px', fontWeight: 700, fontSize: 15.5, display: 'flex', gap: 10 }} onClick={() => setOpen(open === i ? -1 : i)}><span style={{ flex: 1 }}>{q}</span><span aria-hidden style={{ color: 'var(--sub)', transform: open === i ? 'rotate(180deg)' : undefined, transition: 'transform .2s' }}>⌄</span></button>
      {open === i ? <div style={{ padding: '0 18px 16px', color: 'var(--sub)', lineHeight: 1.5, fontSize: 14.5 }}>{a}</div> : null}</div>)}</div></Screen>;
}
export function NotFoundScreen() { const s = useStore(); return <Screen title="Hulhup"><Empty icon="search_off_rounded" text={s.t('not_found')} /></Screen>; }
