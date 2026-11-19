'use client';
import { useEffect, useRef } from 'react';
import AnimMark from './AnimMark';

/** Tarik-untuk-muat dengan logo Hulhup. Angka-angkanya tertulis di LOADING_SPEC.md dan harus sama dengan aplikasi Android. */
const MAXO = 88, K = 120, ARM = 56, HOLD = 56, LOGO = 34, MIN_MS = 700;
const EASE = 'cubic-bezier(.2,.8,.2,1)';
const rubber = (dy: number) => MAXO * (1 - Math.exp(-dy / K));

export default function LogoRefresh({ onRefresh, children }: { onRefresh: () => Promise<unknown> | void; children: React.ReactNode }) {
  const body = useRef<HTMLDivElement>(null), logo = useRef<HTMLDivElement>(null), cb = useRef(onRefresh);
  cb.current = onRefresh;
  useEffect(() => {
    const b = body.current!, l = logo.current!;
    const st = { y0: 0, x0: 0, on: false, dead: false, busy: false, off: 0 };
    const paint = (off: number, anim: boolean) => {
      st.off = off;
      const t = anim ? `transform .26s ${EASE}, opacity .18s linear` : 'none';
      b.style.transition = anim ? `transform .26s ${EASE}` : 'none'; b.style.transform = off > 0 ? `translate3d(0,${off}px,0)` : '';
      const k = Math.min(1, off / 24), sc = .6 + .4 * Math.min(1, off / ARM);
      l.style.transition = t; l.style.opacity = String(k);
      l.style.transform = `translate3d(0,${Math.max(0, off / 2 - LOGO / 2)}px,0) scale(${sc})`;
    };
    const end = () => { b.style.transition = ''; if (st.off === 0) { b.style.transform = ''; b.style.willChange = ''; } };
    b.addEventListener('transitionend', end);
    const ts = (e: TouchEvent) => { if (st.busy || e.touches.length !== 1) return; st.dead = window.scrollY > 0; st.on = false; st.y0 = e.touches[0].clientY; st.x0 = e.touches[0].clientX; };
    const tm = (e: TouchEvent) => {
      if (st.busy || st.dead || e.touches.length !== 1) return;
      const dy = e.touches[0].clientY - st.y0, dx = e.touches[0].clientX - st.x0;
      if (!st.on) {
        if (window.scrollY > 0) { st.y0 = e.touches[0].clientY; return; }
        if (dy < 8) { if (dy < -8) st.dead = true; return; }
        if (Math.abs(dx) > dy) { st.dead = true; return; }
        st.on = true; st.y0 = e.touches[0].clientY - 0; b.style.willChange = 'transform'; return;
      }
      if (e.cancelable) e.preventDefault();
      paint(rubber(Math.max(0, e.touches[0].clientY - st.y0)), false);
    };
    const te = async () => {
      if (!st.on) return; st.on = false;
      if (st.off >= ARM) {
        st.busy = true; paint(HOLD, true); const t0 = performance.now();
        try { await cb.current(); } catch {}
        const w = MIN_MS - (performance.now() - t0); if (w > 0) await new Promise((r) => setTimeout(r, w));
        st.busy = false;
      }
      paint(0, true);
    };
    addEventListener('touchstart', ts, { passive: true }); addEventListener('touchmove', tm, { passive: false });
    addEventListener('touchend', te); addEventListener('touchcancel', te);
    const root = document.documentElement, prev = root.style.overscrollBehaviorY; root.style.overscrollBehaviorY = 'contain';
    return () => { removeEventListener('touchstart', ts); removeEventListener('touchmove', tm); removeEventListener('touchend', te); removeEventListener('touchcancel', te); b.removeEventListener('transitionend', end); root.style.overscrollBehaviorY = prev; };
  }, []);
  return <div style={{ position: 'relative' }}>
    <div ref={logo} aria-hidden="true" style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', justifyContent: 'center', pointerEvents: 'none', opacity: 0, transformOrigin: '50% 0' }}>
      <AnimMark width={LOGO} auto loop first={0} ms={1500} /></div>
    <div ref={body}>{children}</div>
  </div>;
}
