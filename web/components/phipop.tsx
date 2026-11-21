'use client';
import { useEffect, useRef, useState } from 'react';
import { NeedLogin, Screen, useNav, useReady } from './shell';
import { Icon } from './Icon';
import { Loader, PBtn, confirmDlg, toast } from './ui';
import { Api, useStore } from '@/lib/store';

type St = { has_access: boolean; requested: boolean; used: number; limit: number | null; left: number | null; reset_at: number; exempt: boolean; admin: boolean };
type Msg = { id: number; role: 'user' | 'phipop'; text: string; created: number };

const leftT = (ms: number) => { const m = Math.max(1, Math.ceil(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)}j ${m % 60}m` : `${m}m`; };
const Logo = ({ size }: { size: number }) => <img src="/phipop.png" alt="Phipop" width={size} height={size} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flex: 'none', background: '#fff' }} />;

export function PhipopScreen() {
  const s = useStore(); const ready = useReady(); const n = useNav();
  const [st, setSt] = useState<St | null>(null); const [msgs, setMsgs] = useState<Msg[]>([]); const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState(''), [code, setCode] = useState(''), [text, setText] = useState('');
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { try { const c = new URLSearchParams(location.search).get('code'); if (c) setCode(c.toUpperCase()); } catch {} }, []);
  const load = async () => {
    try {
      const j = await Api.req('GET', '/phipop/status'); setSt(j);
      if (j.has_access) { const c = await Api.req('GET', '/phipop/chat'); setMsgs(c.items); setSt(c); }
    } catch (e) { toast(s.err(e), { bad: true }); }
  };
  useEffect(() => { if (ready && s.me) load(); }, [ready, s.me?.username]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs.length, busy]);
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 30000); return () => clearInterval(t); }, []);
  if (!ready) return <Screen title="Phipop"><Loader k="form" /></Screen>;
  if (!s.me) return <Screen title="Phipop"><NeedLogin /></Screen>;
  if (!st) return <Screen title="Phipop"><Loader k="form" /></Screen>;
  const act = async (f: () => Promise<void>) => { if (busy) return; setBusy(true); try { await f(); } catch (e) { toast(s.err(e), { bad: true }); } finally { setBusy(false); } };

  if (!st.has_access) return <Screen title="Phipop">
    <div className="pad" style={{ paddingBottom: 40 }}>
      <div style={{ display: 'grid', placeItems: 'center', padding: '8px 0 14px' }}><Logo size={96} /></div>
      <p style={{ lineHeight: 1.5, margin: '0 0 14px' }}>{s.t('ph_intro')}</p>
      {[['person_outline_rounded', 'ph_s1', true], ['edit_rounded', 'ph_s2', st.requested], ['notifications_none_rounded', 'ph_s3', false]].map(([ic, k, done]) =>
        <div key={k as string} className="row2" style={{ gap: 12, padding: '10px 14px', background: 'var(--soft)', borderRadius: 20, marginBottom: 8 }}>
          <Icon n={done ? 'check_circle_rounded' : (ic as string)} size={22} color={done ? 'var(--brand)' : 'var(--sub)'} /><span style={{ flex: 1, fontWeight: 600 }}>{s.t(k as string)}</span></div>)}
      {st.requested ? <div style={{ margin: '14px 0', fontWeight: 700, color: 'var(--sub)' }}>{s.t('ph_req_sent')}</div> : <>
        <div className="sheetfield" style={{ marginTop: 14 }}><textarea rows={3} maxLength={600} value={why} placeholder={s.t('ph_why')} onChange={(e) => setWhy(e.target.value)} /></div>
        <div style={{ marginTop: 10 }}><PBtn loading={busy} onClick={why.trim() ? () => act(async () => { await Api.req('POST', '/phipop/request', { why }); toast(s.t('ph_req_sent')); await load(); }) : undefined}>{s.t('ph_send_req')}</PBtn></div></>}
      <div style={{ margin: '26px 0 8px', fontWeight: 800 }}>{s.t('ph_have_code')}</div>
      <div className="sheetfield"><input value={code} placeholder="XXXX-XXXX-XXXX" autoCapitalize="characters" autoCorrect="off" spellCheck={false} maxLength={14} style={{ letterSpacing: 2, fontWeight: 700 }}
        onChange={(e) => { const r = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12); setCode(r.replace(/(.{4})(?=.)/g, '$1-')); }} /></div>
      <div style={{ marginTop: 10 }}><PBtn ghost loading={busy} onClick={code.replace(/-/g, '').length === 12 ? () => act(async () => { await Api.req('POST', '/phipop/redeem', { code }); await load(); }) : undefined}>{s.t('ph_use_code')}</PBtn></div>
    </div></Screen>;

  const out = st.limit !== null && (st.left ?? 0) <= 0 && st.reset_at > Date.now();
  const send = () => act(async () => {
    const t = text.trim(); if (!t) return;
    setText(''); setMsgs((m) => [...m, { id: -Date.now(), role: 'user', text: t, created: Date.now() }]);
    try { const r = await Api.req('POST', '/phipop/chat', { text: t }); setSt(r); setMsgs((m) => [...m, { id: -Date.now() - 1, role: 'phipop', text: r.reply, created: Date.now() }]); }
    catch (e) { setMsgs((m) => m.slice(0, -1)); setText(t); throw e; }
  });
  const meter = st.limit === null ? s.t('ph_unlimited') : `${s.t('ph_left').replace('{n}', `${st.left}`).replace('{m}', `${st.limit}`)}${st.reset_at ? ' · ' + s.t('ph_reset').replace('{t}', leftT(st.reset_at - Date.now())) : ''}`;
  return <Screen title="Phipop" actions={<>
    {st.admin ? <button className="tap" style={{ padding: 10, fontWeight: 700 }} onClick={() => n.push('/phipop/admin')}>{s.t('ph_manage')}</button> : null}
    <button className="tap" aria-label={s.t('ph_clear')} style={{ padding: 10 }} onClick={async () => { if (await confirmDlg(s.t('ph_clear'), s.t('ph_clear') + '?', s.t('delete'), true)) { await Api.req('DELETE', '/phipop/chat'); setMsgs([]); } }}><Icon n="delete_outline_rounded" size={22} /></button></>}>
    <div style={{ padding: '0 20px 6px', color: 'var(--sub)', fontWeight: 700, fontSize: 12.5, textAlign: 'center' }}>{meter}</div>
    <div className="pad" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 12 }}>
      {!msgs.length ? <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--sub)' }}><Logo size={72} /><div style={{ marginTop: 10, fontWeight: 600 }}>{s.t('ph_empty_chat')}</div></div> : null}
      {msgs.map((m) => m.role === 'user'
        ? <div key={m.id} style={{ alignSelf: 'flex-end', maxWidth: '82%', background: 'var(--btn)', color: 'var(--cream)', padding: '10px 14px', borderRadius: '20px 20px 6px 20px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.4 }}>{m.text}</div>
        : <div key={m.id} className="row2" style={{ alignSelf: 'flex-start', maxWidth: '88%', gap: 8, alignItems: 'flex-end' }}><Logo size={30} />
          <div style={{ background: 'var(--soft)', padding: '10px 14px', borderRadius: '20px 20px 20px 6px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.4 }}>{m.text}</div></div>)}
      {busy ? <div className="row2" style={{ gap: 8, color: 'var(--sub)', fontWeight: 600, fontSize: 13 }}><Logo size={30} />{s.t('ph_typing')}</div> : null}
      <div ref={end} />
    </div>
    <div className="cmtbar">{out ? <div style={{ textAlign: 'center', color: 'var(--sub)', fontWeight: 700, padding: '10px 0' }}>{s.t('ph_limit_note').replace('{t}', leftT(st.reset_at - Date.now()))}</div>
      : <div className="row2" style={{ gap: 8 }}>
        <div className="sheetfield" style={{ flex: 1, margin: 0 }}><input value={text} maxLength={600} placeholder={s.t('ph_msg')} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} /></div>
        <button className="tap" aria-label="Kirim" disabled={busy || !text.trim()} onClick={send} style={{ width: 46, height: 46, borderRadius: 23, background: 'var(--btn)', color: 'var(--cream)', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon n="send_rounded" size={20} /></button></div>}</div>
  </Screen>;
}

export function PhipopAdmin() {
  const s = useStore(); const ready = useReady();
  const [d, setD] = useState<any>(null); const [u, setU] = useState(''), [lim, setLim] = useState(''), [ex, setEx] = useState(false);
  const load = async () => { try { setD(await Api.req('GET', '/phipop/admin')); } catch (e) { toast(s.err(e), { bad: true }); } };
  useEffect(() => { if (ready && s.me) load(); }, [ready, s.me?.username]);
  if (!ready || (s.me && !d)) return <Screen title={s.t('ph_admin_title')}><Loader k="form" /></Screen>;
  if (!s.me) return <Screen title={s.t('ph_admin_title')}><NeedLogin /></Screen>;
  const run = async (f: () => Promise<any>) => { try { const r = await f(); await load(); return r; } catch (e) { toast(s.err(e), { bad: true }); } };
  return <Screen title={s.t('ph_admin_title')}><div className="pad" style={{ paddingBottom: 40 }}>
    {!d.requests.length ? <div style={{ color: 'var(--sub)', padding: '10px 0' }}>{s.t('ph_no_req')}</div> : null}
    {d.requests.map((r: any) => <div key={r.id} style={{ background: 'var(--soft)', borderRadius: 22, padding: 14, marginBottom: 10, opacity: r.status === 'pending' ? 1 : .55 }}>
      <div className="row2" style={{ gap: 8 }}><b style={{ flex: 1 }}>{r.name} <span style={{ color: 'var(--sub)', fontWeight: 600 }}>@{r.username}</span></b><span style={{ color: 'var(--sub)', fontSize: 12 }}>{r.status}</span></div>
      <div style={{ margin: '6px 0 10px', lineHeight: 1.4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{r.why}</div>
      {r.status === 'pending' ? <div className="row2" style={{ gap: 8 }}>
        <div style={{ flex: 1 }}><PBtn onClick={() => run(async () => { const x = await Api.req('POST', '/phipop/admin/send', { request_id: r.id }); toast(s.t('ph_code_made').replace('{u}', x.username).replace('{c}', x.code)); })}>{s.t('ph_send_code')}</PBtn></div>
        <div style={{ flex: 1 }}><PBtn ghost onClick={() => run(() => Api.req('POST', '/phipop/admin/reject', { request_id: r.id }))}>{s.t('ph_reject')}</PBtn></div></div> : null}</div>)}
    <div style={{ margin: '22px 0 8px', fontWeight: 800 }}>{s.t('ph_grant')}</div>
    <div className="sheetfield"><input value={u} placeholder="username" autoCapitalize="none" autoCorrect="off" onChange={(e) => setU(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} /></div>
    <label className="row2" style={{ gap: 10, padding: '10px 4px', fontWeight: 600 }}><input type="checkbox" checked={ex} onChange={(e) => setEx(e.target.checked)} />{s.t('ph_unlim_sw')}</label>
    {!ex ? <div className="sheetfield"><input value={lim} inputMode="numeric" placeholder={s.t('ph_lim_ph')} onChange={(e) => setLim(e.target.value.replace(/\D/g, ''))} /></div> : null}
    <div style={{ marginTop: 10 }}><PBtn onClick={u ? () => run(async () => { await Api.req('POST', '/phipop/admin/grant', { username: u, exempt: ex, lim: ex || !lim ? null : Number(lim) }); toast(s.t('ph_saved')); }) : undefined}>{s.t('ph_grant')}</PBtn></div>
    <div style={{ margin: '22px 0 8px' }}>{d.access.map((a: any) => <div key={a.username} className="row2" style={{ gap: 8, padding: '10px 0', borderBottom: '1px solid var(--hair)' }}>
      <div style={{ flex: 1, minWidth: 0 }}><b>@{a.username}</b><div style={{ color: 'var(--sub)', fontSize: 12.5 }}>{a.exempt ? s.t('ph_unlimited') : `${a.used}/${a.lim ?? 10}`}{a.has_code ? ' · kode' : ''}</div></div>
      <button className="tap" style={{ padding: 8, fontWeight: 700, color: 'var(--heart)' }} onClick={() => run(() => Api.req('POST', '/phipop/admin/grant', { username: a.username, revoke: true }))}>{s.t('ph_revoke')}</button></div>)}</div>
  </div></Screen>;
}
