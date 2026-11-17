'use client';
import { useEffect, useRef } from 'react';
import { kMarkAnims, markMotion, paintPeek } from '@/lib/markMotion';

type Props = { width: number; auto?: boolean; loop?: boolean; slow?: boolean; tapPlay?: boolean; first?: number; ms?: number; colors?: [string, string, string]; label?: string };

/** Logo hidup: memainkan 50 animasi bergantian acak (terjemahan AnimMark). */
export default function AnimMark({ width, auto, loop, slow, tapPlay, first, ms = 1700, colors, label }: Props) {
  const cv = useRef<HTMLCanvasElement>(null), st = useRef({ v: first ?? Math.floor(Math.random() * kMarkAnims), last: -1, t0: 0, run: false, raf: 0, timer: 0 as any });
  const H = width * .5 / .72;
  useEffect(() => {
    const c = cv.current!, ctx = c.getContext('2d')!, s = st.current, dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = width * dpr * 1.6; c.height = H * dpr * 1.6; // ruang ekstra untuk lompat/putar
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dark = () => matchMedia('(prefers-color-scheme: dark)').matches;
    const cols = (): [string, string, string] => colors || (dark() ? ['#fff', '#5B47F5', '#5B47F5'] : ['#5B47F5', '#fff', '#4330D0']);
    const draw = (t: number) => {
      const m = markMotion(s.v, t);
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height);
      ctx.translate(c.width / 2, c.height / 2); ctx.scale(dpr, dpr);
      ctx.translate(m.dx * width / 100, m.dy * width / 100); ctx.rotate(m.rot); ctx.scale(m.sc, m.sc);
      ctx.translate(-width / 2, -H / 2);
      paintPeek(ctx, width, H, cols(), m);
    };
    const play = (n?: number) => {
      if (still) return; clearTimeout(s.timer);
      let x = n ?? Math.floor(Math.random() * kMarkAnims);
      if (n == null && x === s.last) x = (x + 1 + Math.floor(Math.random() * (kMarkAnims - 1))) % kMarkAnims;
      s.v = s.last = x; s.t0 = performance.now(); s.run = true;
      const tick = (now: number) => {
        const t = Math.min(1, (now - s.t0) / ms); draw(t);
        if (t < 1) { s.raf = requestAnimationFrame(tick); return; }
        s.run = false;
        if (auto) { if (loop) play(); else s.timer = setTimeout(() => play(), slow ? 5000 + Math.random() * 7000 : 700 + Math.random() * 1300); }
      };
      s.raf = requestAnimationFrame(tick);
    };
    (c as any)._play = play;
    draw(1);
    if (auto && !still) s.timer = setTimeout(() => play(), loop ? 0 : 500);
    // jeda saat tab tersembunyi atau logo di luar layar; lanjut saat terlihat lagi
    let inView = true; const halt = () => { cancelAnimationFrame(s.raf); clearTimeout(s.timer); s.run = false; };
    const resume = () => { if (auto && !still && inView && document.visibilityState === 'visible' && !s.run) s.timer = setTimeout(() => play(), 300); };
    const io = new IntersectionObserver(([e]) => { inView = e.isIntersecting; inView ? resume() : halt(); });
    io.observe(c);
    const vis = () => (document.visibilityState === 'visible' ? resume() : halt());
    document.addEventListener('visibilitychange', vis);
    return () => { halt(); io.disconnect(); document.removeEventListener('visibilitychange', vis); };
  }, [width, auto, loop, slow, ms, colors]);
  const box = { display: 'block', flex: 'none', maxWidth: 'none', minWidth: width * 1.6, width: width * 1.6, height: H * 1.6, margin: `${-H * .3}px ${-width * .3}px` } as const;
  return <canvas ref={cv} role="img" aria-label={label || 'Hulhup'} style={{ ...box, cursor: tapPlay ? 'pointer' : undefined }} onClick={tapPlay ? () => (cv.current as any)?._play?.() : undefined} />;
}
