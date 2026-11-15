'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import AnimMark from './AnimMark';
import { Icon, HIcon } from './Icon';
import { Brand, useNav } from './shell';
import { IconBtn, PBtn, TopBar, sheet, toast } from './ui';
import { audIcon, audSplit, audText, filterAud, multiSheet, withLabels, reportSheet } from './aud';
import { HupsFeed } from './feed';
import { LinkEmbed, MentionText, Avatar, Verified, firstUrl } from './rich';
import { PostActions, toggleOfflinePost } from './post';
import { postCode } from '@/lib/links';
import { mmss } from './post';
import { type A, store, useStore } from '@/lib/store';

function TapButton({ onTap }: { onTap: () => void }) {
  const [down, setDown] = useState(false); const [burst, setBurst] = useState(0); const mark = useRef<HTMLDivElement>(null);
  return <div style={{ width: 330, height: 330, position: 'relative', display: 'grid', placeItems: 'center', maxWidth: '100%' }}>
    {burst ? [0, 1, 2].map((i) => <span key={`${burst}${i}`} style={{ position: 'absolute', width: 208, height: 208, borderRadius: '50%', border: `${2.2 - i * .5}px solid var(--ink)`, opacity: 0, animation: `ring3 1s ${i * .18}s cubic-bezier(.2,.8,.2,1) both`, pointerEvents: 'none' }} />) : null}
    <button className="tap" aria-label={store.t('rand_tab')} onPointerDown={() => setDown(true)} onPointerUp={() => setDown(false)} onPointerLeave={() => setDown(false)}
      onClick={() => { setBurst((b) => b + 1); (mark.current?.firstElementChild as any)?.__play?.(); try { navigator.vibrate?.(12); } catch {} onTap(); }}
      style={{ width: 204, height: 204, borderRadius: '50%', background: 'var(--brand)', display: 'grid', placeItems: 'center', transform: `scale(${down ? .94 : 1})`, transition: 'transform .15s ease-out, box-shadow .15s', boxShadow: `0 ${down ? 10 : 26}px ${down ? 24 : 52}px rgba(91,71,245,${down ? .22 : .38})` }}>
      <div ref={mark}><AnimMark width={104} auto ms={1500} first={0} colors={['#fff', '#5b47f5', '#4330d0']} /></div>
    </button></div>;
}

const RATES = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
const rl = (r: number) => (Number.isInteger(r) ? `${r}×` : `${String(r).replace(/0+$/, '')}×`);
/** Pemilih kecepatan putar buatan sendiri. */
export function SpeedRow() {
  const s = useStore();
  return <div className="row2" style={{ gap: 8 }}><Icon n="speed_rounded" size={18} color="var(--sub)" />
    <div style={{ flex: 1, display: 'flex', background: 'var(--soft)', borderRadius: 18, padding: 3 }}>
      {RATES.map((r) => <button key={r} className="tap" onClick={() => s.setRate(r)} style={{ flex: 1, height: 32, borderRadius: 15, fontSize: 12.5, fontWeight: 800, background: s.rate === r ? 'var(--ink)' : 'transparent', color: s.rate === r ? 'var(--bg)' : 'var(--sub)', transition: 'all .2s' }}>{rl(r)}</button>)}
    </div></div>;
}

export function PopupBody({ a, close }: { a: A; close: () => void }) {
  const s = useStore(); const n = useNav(); const on = s.playing === a.id;
  const total = Math.max(1, s.dur > 0 ? s.dur : a.secs * 1000);
  const off = s.isOffline(a.id), url = firstUrl(a.desc);
  const open = (p: string) => { close(); n.push(p); };
  return <div className="stack" style={{ gap: 0 }}>
    {a.pprof ? <button className="tap row2" style={{ textAlign: 'left' }} onClick={() => open(`/@${a.owner}`)}>
      <Avatar url={a.ownerAvatar} name={a.ownerName} size={46} />
      <div style={{ flex: 1, minWidth: 0 }}><div style={{ display: 'flex', alignItems: 'center' }}><b style={{ fontSize: 16, fontWeight: 800 }}>{a.ownerName}</b>{a.ownerVerified ? <Verified /> : null}</div>
        <div className="hsub">{a.owner}{a.created > 0 ? ` · ${s.when(a.created)}` : ''}</div></div>
      <Icon n="chevron_right_rounded" color="var(--sub)" /></button>
      : a.created > 0 ? <div className="hsub" style={{ marginBottom: 6 }}>{s.when(a.created)}</div> : null}
    {a.desc.trim() ? <div style={{ paddingTop: a.pprof ? 12 : 0, cursor: 'pointer' }} onClick={() => open(`/p/${postCode(a.id)}`)}>
      <MentionText text={a.desc.trim()} clamp={6} style={{ fontSize: 15.5, lineHeight: 1.45 }} />{a.long ? <span className="more">…{s.t('read_more')}</span> : null}</div> : null}
    {url ? <LinkEmbed url={url} /> : null}
    <div style={{ height: a.pprof || a.desc.trim() ? 14 : 4 }} />
    {a.url ? <div className="row2" style={{ background: 'var(--soft)', borderRadius: 26, padding: '8px 6px 8px 8px' }}>
      <button className={`tap pbtn2${on ? ' on' : ''}`} style={{ width: 44, height: 44, borderRadius: on ? 13 : 22 }} aria-label={on ? 'Jeda' : 'Putar'} onClick={() => s.play(a).catch(() => toast(s.t('e_server'), { bad: true }))}><Icon n={on ? 'pause_rounded' : 'play_arrow_rounded'} size={26} /></button>
      <div style={{ flex: 1, margin: '0 12px', height: 6, borderRadius: 4, background: 'color-mix(in srgb, var(--ink) 12%, transparent)', overflow: 'hidden' }}><div style={{ height: '100%', width: `${on ? Math.min(100, s.pos / total * 100) : 0}%`, background: 'var(--ink)' }} /></div>
      <span style={{ fontSize: 13, fontWeight: 700, color: on ? 'var(--ink)' : 'var(--sub)' }}>{mmss(on ? Math.floor(s.pos / 1000) : 0)} / {mmss(a.secs)}</span></div> : null}
    {a.url ? <div style={{ marginTop: 10 }}><SpeedRow /></div> : null}
    <div style={{ height: 6 }} />
    <PostActions a={a} onComments={() => open(`/p/${postCode(a.id)}`)} />
    <PBtn ghost icon={off ? 'offline_pin_rounded' : 'download_for_offline_outlined'} onClick={() => toggleOfflinePost(a)}>{off ? s.t('is_offline') : s.t('mk_offline')}</PBtn>
    {s.me && s.me.username !== a.owner ? <button className="tap row2" style={{ justifyContent: 'center', padding: '12px 0 2px', color: 'var(--sub)', fontSize: 13, fontWeight: 600 }} onClick={() => reportSheet({ audio: a.id })}><Icon n="flag_outlined" size={16} />{s.t('report')}</button> : null}
  </div>;
}

function SideMenu({ open, close }: { open: boolean; close: () => void }) {
  const s = useStore(); const n = useNav(); const [more, setMore] = useState(false);
  const item = (icon: string, k: string, href: string, net = false) => <Link href={href} className="tap mi" style={{ textDecoration: 'none' }} onClick={(e) => { if (net && !s.needNet()) { e.preventDefault(); return; } close(); }}><Icon n={icon} size={24} />{s.t(k)}</Link>;
  return <div className={`side${open ? ' open' : ''}`} aria-hidden={!open}>
    <div className="scrim" onClick={close} />
    <nav className="panel" style={{ borderRadius: '0 36px 36px 0', display: 'flex', flexDirection: 'column' }} aria-label="Menu">
      <div style={{ padding: '4px 10px 22px' }}><Brand /></div>
      <div style={{ padding: '0 10px 8px' }}><PBtn icon="add_rounded" onClick={() => { if (!s.needNet()) return; close(); n.push(s.me ? '/new' : '/login'); }}>{s.t('create')}</PBtn></div>
      {item('tune_rounded', 'settings', '/settings', true)}
      {s.me ? item('send_outlined', 'sent_title', '/sent') : null}
      {item('download_done_rounded', 'offline_t', '/offline')}
      <button className="tap mi" onClick={() => setMore(!more)}><Icon n="more_horiz_rounded" size={24} /><span style={{ flex: 1 }}>{s.t('more')}</span><Icon n="expand_more_rounded" size={22} color="var(--sub)" style={{ transform: more ? "rotate(180deg)" : undefined, transition: "transform .2s" }} /></button>
      <div style={{ paddingLeft: 16, display: more ? 'block' : 'none' }}>
        {item('info_outline_rounded', 'about', '/about')}{item('help_outline_rounded', 'faq', '/faq')}{item('rule_rounded', 'policy', '/policy')}{item('lock_outline_rounded', 'privacy', '/privacy')}
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ padding: '0 10px' }}>
        {!s.me ? <PBtn icon="login_rounded" onClick={() => { close(); n.push('/login'); }}>{s.t('login')}</PBtn>
          : <PBtn ghost icon="logout_rounded" fg="var(--heart)" onClick={async () => { close(); await s.logout(); }}>{s.t('logout')}</PBtn>}
        <div style={{ textAlign: 'center', color: 'var(--sub)', fontWeight: 700, letterSpacing: 1.2, fontSize: 12, margin: '14px 0' }}>Misyi · v1.3.0</div>
      </div>
    </nav></div>;
}

export function FilterChip() {
  const s = useStore();
  const f = !s.me ? 'public' : s.filter;
  const pick = async () => {
    const r = await multiSheet(s.t('filter_title'), withLabels(filterAud), !s.me ? 'public' : s.filter, true);
    if (r == null) return;
    if (!s.me && r !== 'public') { toast(s.t('filter_login')); return; }
    s.setFilter(r);
  };
  return <button className="tap" onClick={pick} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'var(--soft)', borderRadius: 22, padding: '9px 14px', maxWidth: '100%' }}>
    <Icon n={audIcon(audSplit(f)[0], true)} size={16} /><span style={{ fontWeight: 700, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{audText(f, true)}</span><Icon n="keyboard_arrow_down_rounded" size={18} color="var(--sub)" /></button>;
}

export function HomeScreen({ mode0 = 0 }: { mode0?: 0 | 1 }) {
  const s = useStore(); const n = useNav();
  const [menu, setMenu] = useState(false); const [mode, setMode] = useState<number>(mode0); const busy = useRef(false);
  useEffect(() => { s.homeMode = mode; }, [mode]);
  useEffect(() => { if (s.ready && !s.online && mode === 1) setMode(0); }, [s.online, s.ready]);
  const setTab = (i: number) => { if (i === 1 && !s.needNet()) return; if (mode !== i) { setMode(i); s.homeMode = i; history.replaceState(null, '', i === 1 ? '/hups' : '/'); } };

  const tap = async () => {
    if (busy.current) return; busy.current = true;
    try {
      const a = await s.random();
      if (!a) { toast(s.t(s.fromOffline ? 'no_net_empty' : s.me && s.filter !== 'public' ? 'nofilter' : 'nobody')); return; }
      if (s.fromOffline) toast(s.t('no_net'));
      s.countView(a);
      if (a.url && !(a.bgm && s.bgmMuted)) s.play(a, { force: true }).catch(() => toast(s.t('e_server'), { bad: true }));
      sheet((close) => <PopupBody a={a} close={() => close()} />).then(() => { if (s.playing === a.id) s.stop(); });
    } catch (e) { toast(s.err(e), { bad: true }); } finally { busy.current = false; }
  };
  const f = !s.me ? 'public' : s.filter;
  const seg = (i: number, k: 'acak' | 'hups', label: string) => <button className="tap" onClick={() => setTab(i)} style={{ flex: 1, height: 44, borderRadius: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontWeight: 800, fontSize: 14, background: mode === i ? 'var(--ink)' : 'transparent', color: mode === i ? 'var(--bg)' : 'var(--sub)', transition: 'all .26s' }}><HIcon k={k} size={19} />{label}</button>;

  return <div className="app" style={{ height: '100dvh' }}>
    <TopBar lead={<IconBtn n="menu_rounded" onClick={() => setMenu(true)} label="Menu" />} center={<Brand />}
      actions={<><IconBtn n="search_rounded" label="Cari" onClick={() => { if (s.needNet()) n.push('/search'); }} /><IconBtn n="person_outline_rounded" label="Profil" dot={s.unread > 0} onClick={() => n.push(s.me ? `/@${s.me.username}` : '/me')} /></>} />
    <div style={{ flex: 1, minHeight: 0, overflow: mode === 1 ? 'auto' : 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>
      {mode === 0 ? <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <TapButton onTap={tap} />
        <div key={s.taps} className="bignum rise" style={{ marginTop: 20 }}>{s.fmt(s.taps)}</div>
        <div style={{ marginTop: 16 }}><FilterChip /></div>
        <h1 className="sr">Hulhup — ketuk, dengarkan suara acak</h1>
      </div> : <>
        <div style={{ padding: '0 0 8px', textAlign: 'center' }}><FilterChip /></div>
        <HupsFeed key={`hf_${f}${s.me?.username}`} filter={f} />
        <button className="tap fab" style={{ position: 'fixed', right: 'max(20px, calc(50vw - 240px))', bottom: 90 }} aria-label={s.t('create')} onClick={() => { if (s.needNet()) n.push(s.me ? '/new' : '/login'); }}><HIcon k="add" size={26} /></button>
      </>}
    </div>
    <div style={{ padding: '6px 60px 12px' }}><div style={{ display: 'flex', background: 'var(--soft)', borderRadius: 26, padding: 4 }}>{seg(0, 'acak', s.t('rand_tab'))}{seg(1, 'hups', s.t('hups'))}</div></div>
    <SideMenu open={menu} close={() => setMenu(false)} />
  </div>;
}
