'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { A, Api, store, useStore } from '@/lib/store';
import { Empty, Loader, PBtn } from './ui';
import { PostCard, bgmUrl } from './post';
import { HIcon } from './Icon';
import LogoRefresh from './LogoRefresh';
import { PinPill } from './pollx';
import { sheet } from './ui';

/** Umpan Hups: muat awal, segarkan diam-diam tiap 6 dtk, muat lagi saat menggulir, backsound otomatis untuk post yang di tengah layar. */
/** Ingat daftar & posisi gulir: kembali dari profil/post (tombol back) mendarat di tempat terakhir, bukan dari atas. */
const pinCache = new Map<string, A[]>();
const feedCache = new Map<string, { items: A[]; next: number; y: number; t: number }>();
export function HupsFeed({ filter, base = '/hups', header }: { filter: string; base?: string; header?: React.ReactNode }) {
  const s = useStore();
  const [items, setItems] = useState<A[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const next = useRef(0), busy = useRef(false), more = useRef(false), scope = useRef({}), sc = useRef<HTMLDivElement>(null), alive = useRef(true), itemsRef = useRef<A[]>([]);
  itemsRef.current = items;
  const ck = `${base}|${filter}|${s.me?.username ?? ''}`;
  const [pins, setPins] = useState<A[]>(() => pinCache.get(ck) ?? []);
  const path = (extra = '') => `${base}?f=${encodeURIComponent(filter)}${extra}`;

  const load = useCallback(async () => {
    try { const j = await Api.req('GET', path()); setItems((j.items as any[]).map((e) => new A(e))); setPins(((j.pins ?? []) as any[]).map((e) => new A(e))); pinCache.set(ck, ((j.pins ?? []) as any[]).map((e) => new A(e))); next.current = Number(j.next) || 0; setError(null); } catch (e) { setError(store.err(e)); }
    setLoading(false);
  }, [filter, base]);
  useEffect(() => {
    alive.current = true;
    const c = feedCache.get(ck);
    if (c && Date.now() - c.t < 15 * 60000 && c.items.length) {
      setItems(c.items); next.current = c.next; setLoading(false);
      const go = () => window.scrollTo(0, c.y); setTimeout(go, 0); setTimeout(go, 120); setTimeout(go, 400);
    } else { setLoading(true); load(); }
    let y = c?.y ?? 0, tm = 0;
    const onScroll = () => { y = window.scrollY; if (!tm) tm = window.setTimeout(() => { tm = 0; if (itemsRef.current.length) feedCache.set(ck, { items: itemsRef.current, next: next.current, y, t: Date.now() }); }, 200); };
    addEventListener('scroll', onScroll, { passive: true });
    return () => { removeEventListener('scroll', onScroll); if (itemsRef.current.length) feedCache.set(ck, { items: itemsRef.current, next: next.current, y, t: Date.now() }); alive.current = false; store.leave(scope.current); store.leaveBgm(scope.current); };
  }, [load]);

  const silent = useCallback(async () => {
    if (document.visibilityState !== 'visible' || loading || busy.current || more.current) return;
    busy.current = true;
    try {
      const j = await Api.req('GET', path()); const fresh = (j.items as any[]).map((e) => new A(e)); if (!alive.current) return; if (j.pins) { const np = (j.pins as any[]).map((e) => new A(e)); setPins(np); pinCache.set(ck, np); }
      const atTop = window.scrollY < 60;
      if (atTop) { setItems(fresh); next.current = Number(j.next) || 0; }
      else { for (const f of fresh) for (const o of itemsRef.current) if (o.id === f.id) { o.likes = f.likes; o.comments = f.comments; o.liked = f.liked; o.saved = f.saved; o.poll = f.poll; } store.poke(); }
    } catch {}
    busy.current = false;
  }, [filter, base, loading]);
  useEffect(() => { const t = setInterval(silent, 6000); return () => clearInterval(t); }, [silent]);

  const loadMore = useCallback(async () => {
    if (more.current || !next.current || loading) return;
    more.current = true;
    try { const j = await Api.req('GET', path(`&next=${next.current}`)); setItems((cur) => { const have = new Set(cur.map((e) => e.id)); return [...cur, ...(j.items as any[]).map((e) => new A(e)).filter((e) => !have.has(e.id))]; }); next.current = Number(j.next) || 0; } catch {}
    more.current = false;
  }, [filter, base, loading]);
  useEffect(() => { const f = () => { if (window.innerHeight + window.scrollY > document.body.scrollHeight - 600) loadMore(); }; addEventListener('scroll', f, { passive: true }); return () => removeEventListener('scroll', f); }, [loadMore]);

  /** Post yang paling dekat tengah layar menjadi "fokus": bila backsound, otomatis diputar; bila bukan, dihentikan. */
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState !== 'visible' || !itemsRef.current.length) return;
      const mid = innerHeight / 2; let best: A | null = null, bd = Infinity;
      for (const a of itemsRef.current) {
        const el = sc.current?.querySelector(`[data-id="${a.id}"]`) as HTMLElement | null; if (!el) continue;
        const r = el.getBoundingClientRect(); if (r.top > innerHeight - 40 || r.bottom < 40) continue;
        const d = Math.abs((r.top + r.bottom) / 2 - mid); if (d < bd) { bd = d; best = a; }
      }
      if (best && best.bgm && best.files.length) store.playBgm(best.id, bgmUrl(best), scope.current);
      else if (store.bgmKey != null) store.leaveBgm(scope.current);
    }, 600);
    const vis = () => { if (document.visibilityState !== 'visible') store.leaveBgm(scope.current); };
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); };
  }, []);

  if (loading) return <Loader />;
  if (error) return <Empty icon="cloud_off_rounded" text={error} action={<div style={{ width: 160 }}><PBtn onClick={() => { setLoading(true); load(); }}>{s.t('retry')}</PBtn></div>} />;
  const openPins = () => sheet<void>((close) => <div style={{ padding: '0 4px 12px', maxHeight: '70vh', overflowY: 'auto' }}><div style={{ fontWeight: 800, fontSize: 18, padding: '2px 12px 10px' }}>{s.t('pin_title')}</div>
    {pins.map((a) => <PostCard key={a.id} a={a} scope={scope.current} onDeleted={() => { setPins((c) => c.filter((e) => e.id !== a.id)); setItems((c) => c.filter((e) => e.id !== a.id)); close(undefined as any); }} />)}</div>);
  return <LogoRefresh onRefresh={load}><div ref={sc} style={{ padding: '6px 16px 110px' }}>
    <PinPill n={pins.length} onOpen={openPins} />
    {pins.length ? <div style={{ height: 40 }} /> : null}
    {header}
    {!items.length ? <div style={{ paddingTop: 60 }}><div className="empty"><div className="ic"><HIcon k="hups" size={32} color="var(--sub)" /></div><div>{s.t('no_hups')}</div></div></div>
      : items.map((a, i) => <div key={a.id} className="rise" style={{ animationDelay: `${(i < 8 ? i : 0) * 80}ms` }}><PostCard a={a} scope={scope.current} onDeleted={() => setItems((c) => c.filter((e) => e.id !== a.id))} /></div>)}
  </div></LogoRefresh>;
}
