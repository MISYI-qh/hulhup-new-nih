'use client';
import { useEffect, useRef, useState } from 'react';
import { NeedLogin, Screen, useNav, useReady } from './shell';
import { Icon } from './Icon';
import { Loader, PBtn, confirmDlg, toast } from './ui';
import { LinkEmbed, PhRun, QuoteCard, pullQuote, quoteRef } from './rich';
import { postCode } from '@/lib/links';
import { Api, useStore } from '@/lib/store';

type St = { has_access: boolean; requested: boolean; used: number; limit: number | null; left: number | null; reset_at: number; exempt: boolean; admin: boolean; persona?: string };
type Step = { k: string; t: string };
type Msg = { id: number; role: 'user' | 'phipop'; text: string; created: number; status?: string; steps?: Step[]; links?: string[]; reply?: { id: number; role: 'user' | 'phipop'; text: string } };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Kartu untuk satu tautan: post Hulhup jadi kutipan, lainnya pratinjau. */
const PhLink = ({ url }: { url: string }) => { const q = quoteRef(url); return q ? <QuoteCard id={q.id} /> : <LinkEmbed url={url} />; };
const runLabel = (st?: Step[]) => { const x = st?.[st.length - 1]; return x ? `run:${x.k}|${x.t}` : 'run:mikir'; };

const leftT = (ms: number) => { const m = Math.max(1, Math.ceil(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)}j ${m % 60}m` : `${m}m`; };
const Logo = ({ size }: { size: number }) => <img src="/phipop.png" alt="Phipop" width={size} height={size} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'contain', flex: 'none', background: 'var(--bg)' }} />;

export function PhipopScreen() {
  const s = useStore(); const ready = useReady(); const n = useNav();
  const [st, setSt] = useState<St | null>(null); const [msgs, setMsgs] = useState<Msg[]>([]); const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState(''), [code, setCode] = useState(''), [text, setText] = useState(''); const [rp, setRp] = useState<Msg | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { try { const c = new URLSearchParams(location.search).get('code'); if (c) setCode(c.toUpperCase()); } catch {} }, []);
  const alive = useRef(true); useEffect(() => () => { alive.current = false; }, []);
  /** Ikuti jawaban yang sedang disiapkan: progres (cari/baca) tampil sebagai animasi sampai selesai. */
  const poll = async (id: number) => {
    for (let i = 0; i < 220 && alive.current; i++) {
      await sleep(700); let j: any;
      try { j = await Api.req('GET', `/phipop/chat/${id}`); } catch { continue; }
      if (!alive.current) return; setMsgs((m) => m.map((x) => (x.id === id ? j.item : x)));
      if (j.item.status !== 'run') { if (typeof j.used === 'number') setSt((p) => (p ? { ...p, ...j } : p)); if (j.item.status === 'err') toast(s.t('ph_lag'), { bad: true }); return; }
    }
  };
  const load = async () => {
    try {
      const j = await Api.req('GET', '/phipop/status'); setSt(j);
      if (j.has_access) { const c = await Api.req('GET', '/phipop/chat'); setMsgs(c.items); setSt(c); const run = [...c.items].reverse().find((x: Msg) => x.role === 'phipop' && x.status === 'run'); if (run) poll(run.id); }
    } catch (e) { toast(s.err(e), { bad: true }); }
  };
  useEffect(() => { if (ready && s.me) load(); }, [ready, s.me?.username]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs.length, busy]);
  const [, tick] = useState(0); const [pp, setPp] = useState(false);
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
    const cur = rp; setText(''); setRp(null); setMsgs((m) => [...m, { id: -Date.now(), role: 'user', text: t, created: Date.now(), status: 'done', ...(cur ? { reply: { id: cur.id, role: cur.role, text: cur.text.slice(0, 140) } } : {}) }]);
    let r: any;
    try { r = await Api.req('POST', '/phipop/chat', { text: t, async: true, ...(cur && cur.id > 0 ? { reply_to: cur.id } : {}) }); }
    catch (e) { setMsgs((m) => m.slice(0, -1)); setText(t); setRp(cur); throw e; }
    setSt(r); const its: Msg[] = r.items ?? []; const ur = its.length >= 2 ? its[its.length - 2] : null; // pesan sementara diganti baris asli server supaya bisa dibalas
    setMsgs((m) => { const x = [...m]; if (ur && ur.role === 'user' && ur.id > 0) { for (let i = x.length - 1; i >= 0; i--) if (x[i].id < 0 && x[i].role === 'user') { x[i] = ur; break; } } return [...x, { id: r.id, role: 'phipop', text: '', created: Date.now(), status: 'run', steps: [], links: [] }]; });
    await poll(r.id);
  });
  const meter = st.limit === null ? s.t('ph_unlimited') : `${s.t('ph_left').replace('{n}', `${st.left}`).replace('{m}', `${st.limit}`)}${st.reset_at ? ' · ' + s.t('ph_reset').replace('{t}', leftT(st.reset_at - Date.now())) : ''}`;
  return <Screen title="Phipop" actions={<>
    {st.admin ? <button className="tap" style={{ padding: 10, fontWeight: 700 }} onClick={() => n.push('/phipop/admin')}>{s.t('ph_manage')}</button> : null}
    <button className="tap" aria-label={s.t('ph_persona')} style={{ padding: 10 }} onClick={() => setPp((v) => !v)}><Icon n="tune_rounded" size={22} /></button>
    <button className="tap" aria-label={s.t('ph_clear')} style={{ padding: 10 }} onClick={async () => { if (await confirmDlg(s.t('ph_clear'), s.t('ph_clear') + '?', s.t('delete'), true)) { await Api.req('DELETE', '/phipop/chat'); setMsgs([]); } }}><Icon n="delete_outline_rounded" size={22} /></button></>}>
    {pp ? <div style={{ padding: '4px 16px 10px' }}>
      <div style={{ fontWeight: 800, fontSize: 13, margin: '0 4px 8px' }}>{s.t('ph_persona')}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{['penjilat', 'jujur', 'normal', 'negatif', 'brutal'].map((k) => { const on = (st.persona || 'brutal') === k; return <button key={k} className="tap" style={{ padding: '8px 14px', borderRadius: 999, fontWeight: 700, fontSize: 13.5, background: on ? 'var(--btn)' : 'var(--soft)', color: on ? 'var(--cream)' : 'inherit' }} onClick={async () => { setSt((p: any) => ({ ...p, persona: k })); try { await Api.req('PUT', '/phipop/persona', { persona: k }); } catch (e) { toast(s.err(e), { bad: true }); } }}>{s.t('ph_p_' + k)}</button>; })}</div></div> : null}
    <div style={{ padding: '0 20px 6px', color: 'var(--sub)', fontWeight: 700, fontSize: 12.5, textAlign: 'center' }}>{meter}</div>
    <div className="pad" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 12 }}>
      {!msgs.length ? <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--sub)' }}><Logo size={72} /><div style={{ marginTop: 10, fontWeight: 600 }}>{s.t('ph_empty_chat')}</div></div> : null}
      {msgs.map((m) => {
        const q = m.text ? pullQuote(m.text) : { text: '', quote: null as string | null }; const body = q.quote ? q.text : m.text;
        return m.role === 'user'
          ? <div key={m.id} style={{ alignSelf: 'flex-end', maxWidth: '82%', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
            {m.reply ? <div className="rplsnip" style={{ background: 'var(--soft)', padding: '6px 10px', borderRadius: 12, maxWidth: '100%' }}><b>{m.reply.role === 'phipop' ? 'Phipop' : s.t('ph_you')}</b><span>{m.reply.text}</span></div> : null}
            {body ? <div className="tap" onClick={() => m.id > 0 && setRp(m)} style={{ background: 'var(--btn)', color: 'var(--cream)', padding: '10px 14px', borderRadius: '20px 20px 6px 20px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.4 }}>{body}</div> : null}
            {q.quote ? <div style={{ width: 'min(100%, 320px)' }}><PhLink url={q.quote} /></div> : null}
            {m.links?.length ? <div className="phlinks" style={{ width: 'min(100%, 320px)' }}>{m.links.map((u) => <PhLink key={u} url={u} />)}</div> : null}</div>
          : <div key={m.id} className="row2" style={{ alignSelf: 'flex-start', maxWidth: '90%', gap: 8, alignItems: 'flex-end' }}><Logo size={30} />
            {m.status === 'run' ? <div style={{ background: 'var(--soft)', padding: '8px 14px', borderRadius: '20px 20px 20px 6px', minWidth: 0 }}><PhRun label={runLabel(m.steps)} size={20} /></div>
              : <div style={{ minWidth: 0 }}>
                {body ? <div className="tap" onClick={() => setRp(m)} style={{ background: 'var(--soft)', padding: '10px 14px', borderRadius: '20px 20px 20px 6px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.4 }}>{body}</div> : null}
                {(m.links?.length || q.quote) ? <div className="phlinks">{[...new Set([...(q.quote ? [q.quote] : []), ...(m.links ?? [])])].map((u) => <PhLink key={u} url={u} />)}</div> : null}</div>}</div>;
      })}
      <div ref={end} />
    </div>
    <div className="cmtbar">{out ? <div style={{ textAlign: 'center', color: 'var(--sub)', fontWeight: 700, padding: '10px 0' }}>{s.t('ph_limit_note').replace('{t}', leftT(st.reset_at - Date.now()))}</div>
      : <>{rp ? <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 6 }}><div className="rplsnip" style={{ flex: 1 }}><b>{s.t('ph_reply_to').replace('{n}', rp.role === 'phipop' ? 'Phipop' : s.t('ph_you'))}</b><span>{rp.text}</span></div>
          <button className="tap" aria-label="Batal" onClick={() => setRp(null)} style={{ color: 'var(--sub)' }}><Icon n="close_rounded" size={18} /></button></div> : null}
      <div className="row2" style={{ gap: 8 }}>
        <div className="sheetfield" style={{ flex: 1, margin: 0 }}><input value={text} maxLength={600} placeholder={s.t('ph_msg')} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} /></div>
        <button className="tap" aria-label="Kirim" disabled={busy || !text.trim()} onClick={send} style={{ width: 46, height: 46, borderRadius: 23, background: 'var(--btn)', color: 'var(--cream)', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon n="send_rounded" size={20} /></button></div></>}</div>
  </Screen>;
}

export function PhipopAdmin() {
  const s = useStore(); const ready = useReady();
  const [d, setD] = useState<any>(null); const [u, setU] = useState(''), [lim, setLim] = useState(''), [ex, setEx] = useState(false);
  const [posts, setPosts] = useState<any[] | null>(null), [hint, setHint] = useState(''), [ed, setEd] = useState<{ id: number; text: string; hint: string } | null>(null), [pb, setPb] = useState(false);
  const load = async () => { try { setD(await Api.req('GET', '/phipop/admin')); } catch (e) { toast(s.err(e), { bad: true }); } };
  const loadPosts = async () => { try { setPosts((await Api.req('GET', '/phipop/admin/posts')).items); } catch (e) { toast(s.err(e), { bad: true }); } };
  useEffect(() => { if (ready && s.me) { load(); loadPosts(); } }, [ready, s.me?.username]);
  const pact = async (f: () => Promise<any>) => { if (pb) return; setPb(true); try { await f(); await loadPosts(); } catch (e) { toast(s.err(e), { bad: true }); } finally { setPb(false); } };
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

    <div style={{ margin: '30px 0 8px', fontWeight: 800, fontSize: 16 }}>{s.t('ph_posts')}</div>
    <div className="sheetfield"><textarea rows={3} value={hint} placeholder={s.t('ph_post_hint')} onChange={(e) => setHint(e.target.value)} /></div>
    <div className="row2" style={{ gap: 8, marginTop: 8 }}>
      <div style={{ flex: 1 }}><PBtn loading={pb} onClick={() => pact(async () => { await Api.req('POST', '/phipop/admin/post', { hint }, 90000); setHint(''); toast(s.t('ph_saved')); })}>{s.t('ph_post_now')}</PBtn></div></div>
    {pb ? <div style={{ color: 'var(--sub)', fontSize: 13, padding: '8px 2px', fontWeight: 600 }}>{s.t('ph_posting')}</div> : null}
    <div style={{ marginTop: 14 }}>
      {posts && !posts.length ? <div style={{ color: 'var(--sub)', padding: '10px 0' }}>{s.t('ph_posts_none')}</div> : null}
      {(posts ?? []).map((p: any) => <div key={p.id} style={{ background: 'var(--soft)', borderRadius: 22, padding: 14, marginBottom: 10 }}>
        {ed && ed.id === p.id ? <>
          <div className="sheetfield"><textarea rows={5} value={ed.text} placeholder={s.t('ph_post_text')} onChange={(e) => setEd({ ...ed, text: e.target.value })} /></div>
          <div style={{ color: 'var(--sub)', fontSize: 12.5, margin: '6px 2px' }}>{s.t('ph_post_text_hint')}</div>
          {!ed.text.trim() ? <div className="sheetfield"><input value={ed.hint} placeholder={s.t('ph_post_hint')} onChange={(e) => setEd({ ...ed, hint: e.target.value })} /></div> : null}
          <div className="row2" style={{ gap: 8, marginTop: 8 }}>
            <div style={{ flex: 1 }}><PBtn loading={pb} onClick={() => pact(async () => { await Api.req('POST', `/phipop/admin/posts/${p.id}/replace`, ed.text.trim() ? { text: ed.text } : { hint: ed.hint }, 90000); setEd(null); toast(s.t('ph_saved')); })}>{ed.text.trim() ? s.t('ph_edit_manual') : s.t('ph_rewrite')}</PBtn></div>
            <div style={{ flex: 1 }}><PBtn ghost onClick={() => setEd(null)}>{s.t('cancel')}</PBtn></div></div></>
          : <>
          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.4 }}>{p.text}</div>
          <div style={{ color: 'var(--sub)', fontSize: 12, margin: '6px 0 8px' }}>{s.when(p.created)} · {p.likes} · {p.comments}</div>
          <div className="row2" style={{ gap: 4, flexWrap: 'wrap' }}>
            <button className="tap" style={{ padding: 8, fontWeight: 700 }} onClick={() => location.assign(`/p/${postCode(p.id)}`)}>{s.t('ph_post_open')}</button>
            <button className="tap" style={{ padding: 8, fontWeight: 700 }} onClick={() => setEd({ id: p.id, text: p.text, hint: '' })}>{s.t('ph_edit_manual')} / {s.t('ph_rewrite')}</button>
            <button className="tap" style={{ padding: 8, fontWeight: 700, color: 'var(--heart)' }} onClick={async () => { if (await confirmDlg(s.t('delete'), s.t('ph_post_del_q'), s.t('delete'), true)) pact(() => Api.req('DELETE', `/phipop/admin/posts/${p.id}`)); }}>{s.t('delete')}</button></div></>}</div>)}</div>
  </div></Screen>;
}
