'use client';
import { useEffect, useState } from 'react';
import { NeedLogin, Screen, useNav, useReady } from './shell';
import { Loader, PBtn, confirmDlg, toast } from './ui';
import { Icon } from './Icon';
import { Api, useStore } from '@/lib/store';
import { badgeColor } from './rich';

const BADGES: [string | null, string][] = [[null, 'Tanpa'], ['purple', 'Ungu'], ['blue', 'Biru'], ['orange', 'Oranye']];
const COL: Record<string, string> = { purple: '#8B5CF6', blue: 'var(--blue)', orange: '#FF7A1A' };
const card = { background: 'var(--soft)', borderRadius: 22, padding: 14, marginBottom: 10 } as const;

/** Dasbor admin: hanya akun hulhup. Laporan & take down, centang, Phipop. */
export function AdminScreen() {
  const s = useStore(); const ready = useReady(); const n = useNav();
  const [tab, setTab] = useState(0);
  if (!ready) return <Screen title="Admin"><Loader k="form" /></Screen>;
  if (!s.me) return <Screen title="Admin"><NeedLogin /></Screen>;
  if (s.me.username !== 'hulhup') return <Screen title="Admin"><div className="pad" style={{ color: 'var(--sub)' }}>Khusus akun @hulhup.</div></Screen>;
  const tabs = ['Ringkasan', 'Laporan', 'Pin', 'Centang', 'Phipop'];
  return <Screen title="Admin"><div className="pad" style={{ paddingBottom: 40 }}>
    <div style={{ display: 'flex', background: 'var(--soft)', borderRadius: 26, padding: 4, marginBottom: 14 }}>
      {tabs.map((t, i) => <button key={t} className="tap" onClick={() => setTab(i)} style={{ flex: 1, height: 40, borderRadius: 22, fontWeight: 800, fontSize: 13.5, background: tab === i ? 'var(--ink)' : 'transparent', color: tab === i ? 'var(--bg)' : 'var(--ink)' }}>{t}</button>)}
    </div>
    {tab === 0 ? <Overview /> : tab === 1 ? <Reports /> : tab === 2 ? <Pins /> : tab === 3 ? <Badges /> : <div>
      <div style={card}><b>Phipop</b><div style={{ color: 'var(--sub)', margin: '6px 0 10px', lineHeight: 1.4 }}>Jatah (10 jam / 24 jam; pesan biasa 1 jam, post kecil 1 jam, sedang 1,5 jam, panjang 3 jam), pemegang akses, kode, dan post Phipop (otomatis 1x per 2 hari).</div><PBtn onClick={() => n.push('/phipop/admin')}>Buka kelola Phipop</PBtn></div></div>}
  </div></Screen>;
}

function useLoad<T>(path: string, dep: any = ''): [T | null, () => void] {
  const [d, setD] = useState<T | null>(null); const s = useStore();
  const load = () => { Api.req('GET', path).then(setD).catch((e) => toast(s.err(e), { bad: true })); };
  useEffect(load, [path, dep]);
  return [d, load];
}

function Overview() {
  const [d] = useLoad<any>('/admin/overview');
  if (!d) return <Loader k="form" />;
  const row = (k: string, v: any) => <div className="row2" style={{ padding: '8px 0' }}><span style={{ flex: 1, color: 'var(--sub)' }}>{k}</span><b>{v}</b></div>;
  return <div style={card}>
    {row('Pengguna aktif', d.users)}{row('Total post', d.posts)}
    {row('Centang ungu / biru / oranye', `${d.badges.purple ?? 0} / ${d.badges.blue ?? 0} / ${d.badges.orange ?? 0}`)}
    {row('Pemegang akses Phipop', d.ai_holders)}{row('Permintaan akses menunggu', d.ai_pending)}
    {row('Post otomatis Phipop terakhir', d.ai_last_post ? new Date(d.ai_last_post).toLocaleString() : '-')}{row('Jatah AI default', `${d.ai_default_limit} jam / ${d.ai_window_hours} jam`)}
  </div>;
}

/** Take down: alasan wajib; pemilik otomatis dapat notifikasi. */
async function takedown(body: any, done: () => void, s: any) {
  const reason = (window.prompt('Alasan take down (dikirim ke pemilik lewat notifikasi):') || '').trim();
  if (!reason) return;
  if (!(await confirmDlg('Take down', 'Turunkan konten ini dan beri tahu pemiliknya?', 'Take down', true))) return;
  try { await Api.req('POST', '/admin/takedown', { ...body, reason }); toast('Diturunkan, pemilik diberi tahu'); done(); } catch (e) { toast(s.err(e), { bad: true }); }
}

function Reports() {
  const s = useStore(); const [d, load] = useLoad<any>('/admin/reports'); const [ref, setRef] = useState('');
  if (!d) return <Loader k="form" />;
  return <div>
    <div style={card}><b>Take down langsung</b>
      <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Tempel link atau kode post publik" style={{ width: '100%', margin: '8px 0', padding: '12px 14px', borderRadius: 16, background: 'var(--bg)' }} />
      <PBtn onClick={ref.trim() ? () => takedown({ ref: ref.trim() }, () => { setRef(''); load(); }, s) : undefined}>Take down post</PBtn></div>
    <Content onDone={load} />
    {!d.reports.length ? <div style={{ color: 'var(--sub)', padding: '10px 0' }}>Tidak ada laporan terbuka.</div> : null}
    {d.reports.map((r: any) => <div key={r.id} style={card}>
      <div className="row2" style={{ gap: 8 }}><b style={{ flex: 1 }}>{r.comment ? 'Komentar' : r.post ? 'Postingan' : 'Akun'} @{r.target}</b><span style={{ color: 'var(--sub)', fontSize: 12 }}>dari @{r.reporter ?? '?'}</span></div>
      <div style={{ margin: '6px 0', lineHeight: 1.4, wordBreak: 'break-word' }}>{r.comment_text ?? r.post_text ?? ''}</div>
      <div style={{ color: 'var(--sub)', fontSize: 13, marginBottom: 10 }}>Alasan lapor: {r.reason}</div>
      <div className="row2" style={{ gap: 8 }}>
        {r.comment || r.post ? <div style={{ flex: 1 }}><PBtn onClick={() => takedown(r.comment ? { comment: r.comment } : { audio: r.post }, load, s)}>Take down</PBtn></div> : null}
        <div style={{ flex: 1 }}><PBtn ghost onClick={async () => { try { await Api.req('POST', `/admin/reports/${r.id}/dismiss`); load(); } catch (e) { toast(s.err(e), { bad: true }); } }}>Abaikan</PBtn></div></div>
    </div>)}
  </div>;
}

const PIN_PRESETS: [number, string][] = [[60, '1 jam'], [360, '6 jam'], [1440, '1 hari'], [4320, '3 hari'], [10080, '7 hari']];
const UNITS = { min: 1, hour: 60, day: 1440 } as const;
/** Sematkan post publik di Hups dengan lama bebas; daftar pin aktif + lepas pin. */
function Pins() {
  const s = useStore(); const [d, load] = useLoad<any>('/admin/pins'); const [ref, setRef] = useState('');
  const [mins, setMins] = useState(1440); const [custom, setCustom] = useState(false); const [num, setNum] = useState('1'); const [unit, setUnit] = useState<keyof typeof UNITS>('day');
  const total = custom ? Math.round(Number(num.replace(',', '.')) * UNITS[unit]) : mins;
  const left = (until: number) => { const m = Math.max(1, Math.round((until - Date.now()) / 60000)); return m >= 1440 ? `${Math.round(m / 1440)} hari` : m >= 60 ? `${Math.round(m / 60)} jam` : `${m} menit`; };
  const pin = async () => {
    if (!ref.trim() || !(total > 0)) { toast('Isi link/kode post dan lama pin', { bad: true }); return; }
    try { await Api.req('POST', '/admin/pin', { ref: ref.trim(), minutes: total }); setRef(''); load(); toast('Post disematkan'); } catch (e) { toast(s.err(e), { bad: true }); }
  };
  const chip = (on: boolean) => ({ padding: '8px 13px', borderRadius: 999, fontWeight: 800, fontSize: 13, background: on ? 'var(--ink)' : 'var(--bg)', color: on ? 'var(--bg)' : 'var(--ink)' }) as const;
  return <div>
    <div style={card}><b>Sematkan post di Hups</b>
      <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Tempel link atau kode post publik" style={{ width: '100%', margin: '8px 0', padding: '12px 14px', borderRadius: 16, background: 'var(--bg)' }} />
      <div className="row2" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {PIN_PRESETS.map(([m, l]) => <button key={m} className="tap" onClick={() => { setCustom(false); setMins(m); }} style={chip(!custom && mins === m)}>{l}</button>)}
        <button className="tap" onClick={() => setCustom(true)} style={chip(custom)}>Custom</button></div>
      {custom ? <div className="row2" style={{ gap: 6, marginBottom: 10 }}>
        <input inputMode="decimal" value={num} onChange={(e) => setNum(e.target.value.replace(/[^0-9.,]/g, ''))} style={{ width: 80, padding: '10px 12px', borderRadius: 14, background: 'var(--bg)', textAlign: 'center', fontWeight: 800 }} />
        {(['min', 'hour', 'day'] as const).map((u) => <button key={u} className="tap" onClick={() => setUnit(u)} style={chip(unit === u)}>{{ min: 'menit', hour: 'jam', day: 'hari' }[u]}</button>)}</div> : null}
      <PBtn onClick={pin}>Sematkan</PBtn></div>
    {!d ? <Loader k="form" /> : !d.items.length ? <div style={{ color: 'var(--sub)', padding: '10px 0' }}>Belum ada post yang disematkan.</div> : d.items.map((x: any) => <div key={x.id} style={card}>
      <div className="row2" style={{ gap: 8 }}><b style={{ flex: 1 }}>@{x.owner}</b><span style={{ color: 'var(--sub)', fontSize: 12.5 }}>sisa {left(x.pin_until)}</span></div>
      <div style={{ margin: '6px 0 10px', lineHeight: 1.4, wordBreak: 'break-word', color: 'var(--sub)' }}>{x.desc || '(audio)'}</div>
      <PBtn ghost onClick={async () => { try { await Api.req('POST', '/admin/pin', { audio: x.id, unpin: true }); load(); toast('Pin dilepas'); } catch (e) { toast(s.err(e), { bad: true }); } }}>Lepas pin</PBtn></div>)}
  </div>;
}

function Badges() {
  const s = useStore(); const [q, setQ] = useState(''); const [d, load] = useLoad<any>(`/admin/users?q=${encodeURIComponent(q)}`, q);
  const set = async (username: string, badge: string | null) => { try { await Api.req('PUT', '/admin/badge', { username, badge }); load(); toast('Centang diperbarui'); } catch (e) { toast(s.err(e), { bad: true }); } };
  return <div>
    <div style={{ color: 'var(--sub)', fontSize: 13, lineHeight: 1.4, marginBottom: 10 }}>Ungu: segelintir akun. Biru: organisasi/perusahaan dipakai lebih dari 2 orang. Oranye: pengguna biasa yang pantas.</div>
    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari akun" style={{ width: '100%', marginBottom: 10, padding: '12px 14px', borderRadius: 16, background: 'var(--soft)' }} />
    {!d ? <Loader k="form" /> : d.users.map((u: any) => <div key={u.username} style={card}>
      <div className="row2" style={{ gap: 6 }}><b>{u.name}</b><span style={{ color: 'var(--sub)' }}>@{u.username}</span>{u.badge ? <Icon n="verified_rounded" size={16} color={COL[u.badge]} /> : null}</div>
      <div className="row2" style={{ gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
        {BADGES.map(([k, l]) => <button key={l} className="tap" onClick={() => (u.badge ?? null) !== k && set(u.username, k)} style={{ padding: '8px 14px', borderRadius: 999, fontWeight: 800, fontSize: 13, background: (u.badge ?? null) === k ? (k ? COL[k] : 'var(--ink)') : 'var(--bg)', color: (u.badge ?? null) === k ? '#fff' : 'var(--ink)' }}>{l}</button>)}
      </div>
      {u.role !== 'admin' ? <button className="tap" onClick={async () => {
        const reason = u.banned ? '' : (window.prompt('Alasan ban akun:') || '').trim(); if (!u.banned && !reason) return;
        try { await Api.req('POST', '/admin/ban', { username: u.username, reason, unban: !!u.banned }); load(); toast(u.banned ? 'Ban dibuka' : 'Akun di-ban'); } catch (e) { toast(s.err(e), { bad: true }); }
      }} style={{ marginTop: 10, padding: '8px 14px', borderRadius: 999, fontWeight: 800, fontSize: 13, background: 'var(--bg)', color: u.banned ? 'var(--ink)' : '#E5484D' }}>{u.banned ? 'Buka ban' : 'Ban akun'}</button> : null}
    </div>)}
  </div>;
}

function Content({ onDone }: { onDone: () => void }) {
  const s = useStore(); const [kind, setKind] = useState<'post' | 'comment'>('post'); const [q, setQ] = useState('');
  const [d, load] = useLoad<any>(`/admin/content?kind=${kind}&q=${encodeURIComponent(q)}`, `${kind}${q}`);
  return <div style={card}><b>Cari konten (tanpa laporan)</b>
    <div className="row2" style={{ gap: 6, margin: '8px 0' }}>{(['post', 'comment'] as const).map((k) => <button key={k} className="tap" onClick={() => setKind(k)} style={{ padding: '7px 14px', borderRadius: 999, fontWeight: 800, fontSize: 13, background: kind === k ? 'var(--ink)' : 'var(--bg)', color: kind === k ? 'var(--bg)' : 'var(--ink)' }}>{k === 'post' ? 'Postingan' : 'Komentar'}</button>)}</div>
    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Kata atau @akun" style={{ width: '100%', marginBottom: 8, padding: '12px 14px', borderRadius: 16, background: 'var(--bg)' }} />
    {!d ? <Loader k="form" /> : d.items.map((x: any) => <div key={x.id} className="row2" style={{ gap: 8, padding: '8px 0', borderTop: '1px solid var(--line, rgba(128,128,128,.2))' }}>
      <div style={{ flex: 1, minWidth: 0 }}><b>@{x.user}</b><div style={{ color: 'var(--sub)', fontSize: 13, wordBreak: 'break-word' }}>{x.text || '(audio)'}</div></div>
      {x.taken_down ? <span style={{ color: 'var(--sub)', fontSize: 12 }}>diturunkan</span> : <button className="tap" onClick={() => takedown(kind === 'post' ? { audio: x.id } : { comment: x.id }, () => { load(); onDone(); }, s)} style={{ padding: '8px 12px', borderRadius: 999, fontWeight: 800, fontSize: 13, background: 'var(--bg)', color: '#E5484D' }}>Take down</button>}
    </div>)}
  </div>;
}
