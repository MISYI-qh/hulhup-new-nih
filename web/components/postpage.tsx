'use client';
import { useEffect, useRef, useState } from 'react';
import { Icon, HIcon } from './Icon';
import { NeedLogin, Screen, useNav } from './shell';
import { Empty, Field, IconBtn, Loader, PBtn, Toggle, confirmDlg, sheet, toast } from './ui';
import { Pick, askLabel, reportSheet, uploadAud, audSplit, withLabels } from './aud';
import { Avatar, LinkEmbed, MentionBar, MentionText, firstUrl } from './rich';
import { ActBtn, AudioBars, BgmBar, FileBar, OwnerRow, PostActions, Wave, commentLink, mmss, postMenu, shareUrl } from './post';
import { A, ApiErr, Api, store, useStore } from '@/lib/store';

// ---------- komentar ----------
function CommentTile({ c, depth, postId, postOwner, scope, onReply, onLike, onDelete, onPin }: { c: any; depth: number; postId: number; postOwner: string; scope: unknown; onReply: () => void; onLike: () => void; onDelete: () => void; onPin: () => void }) {
  const s = useStore(); const n = useNav(); const [full, setFull] = useState<string | null>(null); const [lf, setLf] = useState(false);
  const iAmOwner = s.me?.username === postOwner; const isAuthor = `${c.username}` === postOwner; const shown = full ?? `${c.text}`;
  const loadFull = async () => { setLf(true); try { setFull((await Api.req('GET', `/comments/${c.id}/text`)).text); } catch (e) { toast(store.err(e), { bad: true }); } setLf(false); };
  const menu = () => sheet((close) => <div className="stack" style={{ gap: 10 }}>
    <PBtn ghost icon="ios_share_rounded" onClick={() => { close(); shareUrl(commentLink(postId, c.id)); }}>{s.t('share')}</PBtn>
    {iAmOwner && c.parent === 0 ? <PBtn ghost icon="push_pin_outlined" onClick={() => { close(); onPin(); }}>{s.t(c.pinned ? 'unpin' : 'pin')}</PBtn> : null}
    {c.mine === true || iAmOwner ? <PBtn ghost icon="delete_outline_rounded" fg="var(--heart)" onClick={() => { close(); onDelete(); }}>{s.t('delete')}</PBtn> : null}
    {c.mine !== true && s.me ? <PBtn ghost icon="flag_outlined" onClick={() => { close(); reportSheet({ comment: c.id }); }}>{s.t('report_cmt')}</PBtn> : null}</div>);
  return <div style={{ paddingLeft: depth * 16, paddingBottom: 14, display: 'flex', alignItems: 'flex-start' }}>
    {depth > 0 ? <span style={{ width: 2, height: 34, margin: '4px 10px 0 0', background: 'color-mix(in srgb, var(--ink) 12%, transparent)', borderRadius: 1, flex: 'none' }} /> : null}
    <button className="tap" onClick={() => n.push(`/@${c.username}`)} aria-label={c.name}><Avatar url={c.avatar} name={`${c.name}`} size={34} /></button>
    <div style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
      <div className="row2" style={{ gap: 0, flexWrap: 'wrap' }}><b style={{ fontWeight: 800, fontSize: 14.5 }}>{c.name}</b>{c.verified === true ? <Icon n="verified_rounded" size={14} color="var(--blue)" style={{ marginLeft: 3 }} /> : null}
        {isAuthor ? <span style={{ marginLeft: 6, padding: '2px 7px', borderRadius: 8, background: 'var(--ink)', color: 'var(--bg)', fontSize: 10.5, fontWeight: 800 }}>{s.t('author')}</span> : null}
        <span style={{ marginLeft: 8, color: 'var(--sub)', fontSize: 12 }}>{s.when(Number(c.created))}</span></div>
      {c.pinned ? <div className="row2" style={{ gap: 4, marginTop: 2, color: 'var(--sub)', fontSize: 11.5, fontWeight: 700 }}><Icon n="push_pin_rounded" size={12} />{s.t('pinned')}</div> : null}
      {shown ? <div style={{ marginTop: 3 }}><MentionText text={shown} style={{ fontSize: 15, lineHeight: 1.45 }} /></div> : null}
      {c.long === true && full == null ? <button className="tap" style={{ paddingTop: 4, color: 'var(--acc)', fontWeight: 700, fontSize: 13.5 }} onClick={lf ? undefined : loadFull}>{lf ? '…' : s.t('read_more')}</button> : null}
      {((c.audios as any[]) ?? []).map((x, i) => <FileBar key={i} keyId={-(1000000000 + c.id * 4 + i)} url={`${x.url}`} secs={Number(x.secs)} scope={scope} />)}
      <div className="row2" style={{ gap: 0 }}><ActBtn k="sorot" onClick={onLike} on={c.liked === true} count={Number(c.likes)} />
        <button className="tap" style={{ padding: 8, color: 'var(--sub)', fontWeight: 700, fontSize: 13 }} onClick={s.me ? onReply : () => toast(s.t('need_login'))}>{s.t('reply')}</button>
        <span style={{ flex: 1 }} /><button className="tap" style={{ padding: 8, color: 'var(--sub)' }} onClick={menu} aria-label="Menu"><Icon n="more_horiz_rounded" size={20} /></button></div>
    </div></div>;
}

// ---------- halaman post ----------
export function PostScreen({ id, comment, seed }: { id: number; comment?: number; seed?: A | null }) {
  const s = useStore(); const n = useNav();
  const [a, setA] = useState<A | null>(seed ?? null); const [text, setText] = useState(seed?.text ?? seed?.desc ?? ''); const [cmts, setCmts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true), [sending, setSending] = useState(false); const [err, setErr] = useState<string | null>(null);
  const [input, setInput] = useState(''); const [replyTo, setReplyTo] = useState<any>(null); const autoTag = useRef(''); const [hl, setHl] = useState<number | null>(comment ?? null);
  const scope = useRef({}); const ta = useRef<HTMLTextAreaElement>(null); const busy = useRef(false);
  const comments = async () => setCmts(((await Api.req('GET', `/posts/${id}/comments`)).items as any[]).map((c) => ({ ...c })));
  const bgm = (p: A) => { if (p.bgm && p.files.length) store.playBgm(p.id, p.files[Math.min(p.files.length - 1, Math.max(0, p.bgmIdx))].url, scope.current); };
  const load = async () => {
    try {
      const j = await Api.req('GET', `/posts/${id}`); const p = new A(j.post); setA(p); setText(j.text ?? ''); store.countView(p); await comments(); setErr(null); bgm(p);
      if (comment != null) { setTimeout(() => document.getElementById(`c${comment}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 250); setTimeout(() => setHl(null), 3000); }
    } catch (e) { setErr(e instanceof ApiErr && e.code === 'not_found' ? store.t('post_gone') : store.err(e)); }
    setLoading(false);
  };
  useEffect(() => { if (!s.ready) return; if (seed) store.countView(seed); load(); const sc = scope.current; return () => { store.leave(sc); store.leaveBgm(sc); }; }, [id, s.ready]); // eslint-disable-line
  useEffect(() => {
    const t = setInterval(async () => {
      if (loading || sending || busy.current || document.visibilityState !== 'visible') return; busy.current = true;
      try { const p = await Api.req('GET', `/posts/${id}`); const cm = await Api.req('GET', `/posts/${id}/comments`); if (!sending) { setA(new A(p.post)); setText((x) => p.text ?? x); setCmts((cm.items as any[]).map((c) => ({ ...c }))); } } catch {}
      busy.current = false;
    }, 5000); return () => clearInterval(t);
  }, [id, loading, sending]);
  useEffect(() => { const e = ta.current; if (e) { e.style.height = 'auto'; e.style.height = Math.min(140, e.scrollHeight) + 'px'; } }, [input]);

  const refreshPost = async () => { const p = await Api.req('GET', `/posts/${id}`); setA(new A(p.post)); };
  const send = async () => {
    const t = input.trim(); if (!t || t === autoTag.current.trim()) return; setSending(true); let cid: number | null = null;
    try { const j = await Api.req('POST', `/posts/${id}/comments`, { text: t, parent: replyTo?.id }); cid = Number(j.id); setInput(''); setReplyTo(null); autoTag.current = ''; await comments(); await refreshPost(); }
    catch (e) { if (cid != null) { try { await Api.req('DELETE', `/comments/${cid}`); } catch {} } toast(s.err(e), { bad: true }); }
    setSending(false);
  };
  const reply = (c: any) => { const tag = `@${c.username} `; const cur = input; const body = cur.startsWith(autoTag.current) ? cur.slice(autoTag.current.length) : cur; autoTag.current = tag; setInput(tag + body); setReplyTo(c); ta.current?.focus(); };
  const del = async (c: any) => {
    if (!(await confirmDlg(s.t('delete'), s.t('delete_cmt_q'), s.t('delete'), true))) return;
    try { await Api.req('DELETE', `/comments/${c.id}`); setCmts((l) => l.filter((e) => e.id !== c.id)); await comments(); await refreshPost(); if (replyTo && replyTo.id === c.id) setReplyTo(null); } catch (e) { toast(s.err(e), { bad: true }); }
  };
  const pin = async (c: any) => { try { const j = await Api.req('POST', `/comments/${c.id}/pin`); setCmts((l) => l.map((e) => ({ ...e, pinned: e.id === c.id ? j.pinned === true : false }))); toast(s.t(j.pinned === true ? 'pinned' : 'unpin')); } catch (e) { toast(s.err(e), { bad: true }); } };
  const like = async (c: any) => { if (!s.me) { toast(s.t('need_login')); return; } try { const j = await Api.req('POST', `/comments/${c.id}/like`); setCmts((l) => l.map((e) => (e.id === c.id ? { ...e, liked: j.liked, likes: j.likes } : e))); } catch (e) { toast(s.err(e), { bad: true }); } };

  /** Urutan tampilan: komentar utama (yang disematkan di atas), lalu semua balasannya. Menjorok maksimal 3 tingkat. */
  const flat = () => {
    const kids = new Map<number, any[]>(); const ids = new Set(cmts.map((c) => c.id));
    for (const c of cmts) { let p = c.parent as number; if (p !== 0 && !ids.has(p)) p = 0; (kids.get(p) ?? kids.set(p, []).get(p)!).push(c); }
    const top = [...(kids.get(0) ?? [])].sort((x, y) => (y.pinned ? 1 : 0) - (x.pinned ? 1 : 0)); const out: [any, number][] = [];
    const walk = (c: any, d: number) => { out.push([c, d]); for (const k of kids.get(c.id) ?? []) walk(k, d + 1); };
    top.forEach((c) => walk(c, 0)); return out;
  };
  const p = a; const url = firstUrl(text);
  return <div className="app" style={{ height: '100dvh' }}>
    <div className="topbar" style={{ position: 'static' }}>
      <IconBtn n="arrow_back_ios_new_rounded" onClick={() => n.back()} label="Kembali" /><div className="ttl" role="heading" aria-level={1}>{s.t('hups')}</div>
      <div style={{ display: 'flex' }}>{p ? <IconBtn n="more_horiz_rounded" label="Menu" onClick={() => postMenu(p, () => n.back())} /> : null}</div></div>
    <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', overscrollBehavior: 'contain', minHeight: 0 }}>{loading && !p ? <Loader /> : err && !p ? <Empty icon="lock_outline_rounded" text={err} /> : p ? <div style={{ padding: '4px 18px 24px' }}>
      <OwnerRow a={p} />
      {text ? <div style={{ paddingTop: 14, userSelect: 'text' }}><MentionText text={text} style={{ fontSize: 17, lineHeight: 1.55 }} /></div> : null}
      {url ? <LinkEmbed url={url} /> : null}
      {p.files.length ? <div style={{ paddingTop: 6 }}>{p.bgm ? <BgmBar a={p} /> : <AudioBars a={p} scope={scope.current} />}</div> : null}
      <div style={{ height: 10 }} /><PostActions a={p} onComments={() => ta.current?.focus()} />
      <hr style={{ border: 0, borderTop: '1px solid var(--hair)', margin: '12px 0' }} />
      <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 10 }}>{s.t('comments')} ({p.comments})</div>
      {!cmts.length ? <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--sub)' }}>{s.t('empty_cmt')}</div> : null}
      {flat().map(([c, d]) => <div key={c.id} id={`c${c.id}`} className={hl === c.id ? 'hl' : undefined}><CommentTile c={c} depth={d > 3 ? 3 : d} postId={p.id} postOwner={p.owner} scope={scope.current} onReply={() => reply(c)} onLike={() => like(c)} onDelete={() => del(c)} onPin={() => pin(c)} /></div>)}
    </div> : null}</div>
    {!s.me ? <div style={{ padding: '8px 16px 14px' }}><PBtn icon="login_rounded" onClick={() => n.push('/login')}>{s.t('login_comment')}</PBtn></div>
      : <div className="cmtbar"><MentionBar value={input} onPick={setInput} />
        {replyTo ? <div className="row2" style={{ paddingBottom: 6 }}><div style={{ flex: 1, color: 'var(--acc)', fontWeight: 700, fontSize: 13 }}>{s.t('replying').replace('{n}', `${replyTo.name}`)}</div>
          <button className="tap" aria-label="Batal" onClick={() => { if (input.startsWith(autoTag.current)) setInput(input.slice(autoTag.current.length)); autoTag.current = ''; setReplyTo(null); }} style={{ color: 'var(--sub)' }}><Icon n="close_rounded" size={18} /></button></div> : null}
        <div className="row2" style={{ alignItems: 'flex-end', gap: 8 }}>
          <textarea ref={ta} rows={1} value={input} placeholder={s.t('comment_ph')} onChange={(e) => setInput(e.target.value)} />
          <button className="tap round" onClick={sending ? undefined : send} aria-label="Kirim">{sending ? <span className="spin" style={{ width: 20, height: 20 }} /> : <Icon n="arrow_upward_rounded" size={22} />}</button></div></div>}
  </div>;
}

// ---------- perekam ----------
export type Clip = { blob: Blob; ext: string; ms: number; secs: number };
const clipSecs = (ms: number) => Math.min(15, Math.max(1, Math.ceil(ms / 1000)));
function RecordSheet({ close }: { close: (c?: Clip) => void }) {
  const s = useStore(); const [rec, setRec] = useState(false), [ms, setMs] = useState(0), [blob, setBlob] = useState<Blob | null>(null), [ext, setExt] = useState('webm'), [prev, setPrev] = useState(false);
  const mr = useRef<MediaRecorder | null>(null), timer = useRef<any>(0), chunks = useRef<Blob[]>([]), au = useRef<HTMLAudioElement | null>(null), stream = useRef<MediaStream | null>(null), t0 = useRef(0);
  useEffect(() => () => { clearInterval(timer.current); try { mr.current?.state === 'recording' && mr.current.stop(); } catch {} stream.current?.getTracks().forEach((t) => t.stop()); au.current?.pause(); }, []);
  const stop = () => { clearInterval(timer.current); try { mr.current?.stop(); } catch {} };
  const start = async () => {
    if (rec) return stop();
    try {
      const st = await navigator.mediaDevices.getUserMedia({ audio: true }); stream.current = st;
      const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']; const mt = types.find((t) => (window as any).MediaRecorder?.isTypeSupported?.(t));
      const r = new MediaRecorder(st, mt ? { mimeType: mt } : undefined); mr.current = r; chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = () => { st.getTracks().forEach((t) => t.stop()); const type = r.mimeType || mt || 'audio/webm'; setExt(type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'm4a' : 'webm'); setBlob(new Blob(chunks.current, { type })); setRec(false); };
      au.current?.pause(); setPrev(false); setBlob(null); setMs(0); r.start(); setRec(true); t0.current = Date.now();
      timer.current = setInterval(() => { const m = Math.min(15000, Date.now() - t0.current); setMs(m); if (m >= 15000) stop(); }, 100);
    } catch { toast(s.t('mic_denied'), { bad: true }); }
  };
  const pick = async () => {
    const f = await new Promise<File | null>((res) => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'audio/*'; i.onchange = () => res(i.files?.[0] ?? null); i.oncancel = () => res(null); i.click(); });
    if (!f) return; if (f.size > 1024 * 1024) { toast(s.t('e_too_big'), { bad: true }); return; }
    const secs = await new Promise<number | null>((res) => { const a = new Audio(); const u = URL.createObjectURL(f); a.preload = 'metadata'; a.onloadedmetadata = () => { URL.revokeObjectURL(u); res(isFinite(a.duration) ? Math.round(a.duration) : null); }; a.onerror = () => res(null); a.src = u; setTimeout(() => res(null), 4000); });
    if (secs == null) { toast(s.t('e_bad_file'), { bad: true }); return; } if (secs > 15) { toast(s.t('too_long'), { bad: true }); return; }
    au.current?.pause(); setPrev(false); setBlob(f); setExt((f.name.split('.').pop() || 'm4a').toLowerCase()); setMs(Math.max(1, secs) * 1000);
  };
  const preview = () => {
    if (!blob) return; if (prev) { au.current?.pause(); setPrev(false); return; }
    const a = au.current ?? (au.current = new Audio()); a.src = URL.createObjectURL(blob); a.onended = () => setPrev(false); a.play().catch(() => {}); setPrev(true);
  };
  return <div style={{ textAlign: 'center' }}><div className="sh-t">{s.t('rec_title')}</div><div style={{ height: 18 }} />
    <button className="tap" aria-label={rec ? 'Berhenti' : 'Rekam'} onClick={start} style={{ width: rec ? 84 : 112, height: rec ? 84 : 112, borderRadius: rec ? 26 : 56, background: rec ? 'var(--heart)' : 'var(--btn)', color: 'var(--cream)', display: 'inline-grid', placeItems: 'center', transition: 'all .3s cubic-bezier(.2,.8,.2,1)', boxShadow: `0 10px 26px color-mix(in srgb, ${rec ? 'var(--heart)' : 'var(--brand)'} 30%, transparent)` }}><Icon n={rec ? 'stop_rounded' : 'mic_rounded'} size={40} /></button>
    <div style={{ fontWeight: 800, fontSize: 18, marginTop: 14 }}>{mmss(Math.floor(ms / 1000))} / 0:15</div>
    <div style={{ margin: '4px 8px 0', height: 5, borderRadius: 4, background: 'color-mix(in srgb, var(--ink) 12%, transparent)', overflow: 'hidden' }}><div style={{ height: '100%', width: `${ms / 150}%`, background: rec ? 'var(--heart)' : 'var(--ink)' }} /></div>
    <div style={{ color: 'var(--sub)', fontSize: 13, margin: '6px 0 16px' }}>{s.t('rec_hint')}</div>
    <div className="row2" style={{ gap: 10 }}><div style={{ flex: 1 }}><PBtn ghost icon="audio_file_outlined" onClick={rec ? undefined : pick}>{s.t('pick')}</PBtn></div>
      {blob && !rec ? <div style={{ flex: 1 }}><PBtn ghost icon={prev ? 'pause_rounded' : 'play_arrow_rounded'} onClick={preview}>{s.t('preview')}</PBtn></div> : null}</div>
    <div style={{ height: 10 }} /><PBtn icon="check_rounded" onClick={!blob || rec ? undefined : () => { if (blob.size > 1024 * 1024) { toast(s.t('rec_over'), { bad: true }); return; } au.current?.pause(); close({ blob, ext, ms, secs: clipSecs(ms) }); }}>{s.t('use_audio')}</PBtn></div>;
}

// ---------- pilih akun ----------
function AccountPick({ init, close }: { init: Record<string, any>; close: (v?: Record<string, any>) => void }) {
  const s = useStore(); const [sel, setSel] = useState<Record<string, any>>({ ...init }); const [q, setQ] = useState(''); const [found, setFound] = useState<any[]>([]); const seq = useRef(0);
  const search = async (v: string) => { setQ(v); const id = ++seq.current; if (!v.trim()) { setFound([]); return; } try { const j = await Api.req('GET', `/search?q=${encodeURIComponent(v.trim())}`); if (id === seq.current) setFound((j.users as any[]).filter((u) => u.username !== s.me?.username)); } catch {} };
  const tile = (u: any) => { const on = u.username in sel; return <button key={u.username} className="tap row2" onClick={() => setSel((c) => { const m = { ...c }; on ? delete m[u.username] : (m[u.username] = u); return m; })} style={{ width: '100%', textAlign: 'left', marginBottom: 8, padding: '8px 14px 8px 10px', borderRadius: 24, background: on ? 'color-mix(in srgb, var(--ink) 14%, transparent)' : 'var(--soft)' }}>
    <Avatar url={u.avatar} name={u.name} size={38} /><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 700, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</div><div style={{ color: 'var(--sub)', fontSize: 12.5 }}>{u.username}</div></div><Icon n={on ? 'check_circle_rounded' : 'circle_outlined'} color={on ? 'var(--ink)' : 'var(--sub)'} /></button>; };
  const chosen = Object.values(sel);
  return <div><div className="sh-t" style={{ marginBottom: 12 }}>{s.t('pick_acc')}</div><Field label={s.t('search_acc')} value={q} onChange={search} /><div style={{ height: 12 }} />
    <div style={{ maxHeight: '38dvh', overflow: 'auto' }}>
      {chosen.length ? <><div style={{ color: 'var(--sub)', fontWeight: 700, fontSize: 13, margin: '0 0 8px 4px' }}>{s.t('pick_acc_n').replace('{n}', `${chosen.length}`)}</div>{chosen.map(tile)}</> : null}
      {!q.trim() && !chosen.length ? <div style={{ padding: 8, color: 'var(--sub)' }}>{s.t('pick_acc_hint')}</div> : null}
      {found.length ? <><div style={{ height: 6 }} />{found.filter((u) => !(u.username in sel)).map(tile)}</> : null}</div>
    <div style={{ height: 14 }} /><PBtn onClick={() => close(sel)}>{s.t('done')}</PBtn></div>;
}

// ---------- tulis post ----------
export function ComposeScreen() {
  const s = useStore(); const n = useNav();
  const [text, setText] = useState(''), [clip, setClip] = useState<Clip | null>(null), [playing, setPlaying] = useState(false), [pprof, setPprof] = useState(true), [busy, setBusy] = useState(false), [bgm, setBgm] = useState(false);
  const [rand, setRand] = useState('public'), [picked, setPicked] = useState<Record<string, any>>({}); const au = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => { au.current?.pause(); }, []);
  if (!s.me) return <Screen title={s.t('new_post')}>{s.ready ? <NeedLogin /> : <Loader />}</Screen>;
  const add = async () => { const c = await sheet<Clip>((close) => <RecordSheet close={close as any} />); if (!c) return; au.current?.pause(); setPlaying(false); setClip(c); };
  const play = () => {
    if (!clip) return; if (playing) { au.current?.pause(); setPlaying(false); return; }
    const a = au.current ?? (au.current = new Audio()); a.src = URL.createObjectURL(clip.blob); a.onended = () => setPlaying(false); a.play().catch(() => {}); setPlaying(true);
  };
  const pickAcc = async () => {
    const r = await sheet<Record<string, any>>((close) => <AccountPick init={picked} close={close as any} />); if (!r) return;
    setPicked(r); if (!Object.keys(r).length) { const l = audSplit(rand).filter((x) => x !== 'accounts'); setRand(l.length ? l.join(',') : 'public'); }
  };
  const submit = async () => {
    const t = text.trim();
    if (!clip && !t) { toast(s.t('e_empty'), { bad: true }); return; }
    if (audSplit(rand).includes('accounts') && !Object.keys(picked).length) { toast(s.t('e_need_accounts'), { bad: true }); return; }
    setBusy(true); let id: number | null = null;
    try {
      const j = await Api.req('POST', '/posts', { text: t, audios: clip ? 1 : 0, ...(clip ? { bgm } : {}), pprof, rand: audSplit(rand), to: Object.keys(picked) });
      id = Number(j.id);
      if (clip) await Api.send(`/posts/${id}/audio?secs=${clip.secs}`, clip.blob, 'application/octet-stream');
      toast(s.t('posted')); n.back();
    } catch (e) { if (id != null) { try { await Api.req('DELETE', `/audios/${id}`); } catch {} } toast(s.err(e), { bad: true }); setBusy(false); }
  };
  const hasAcc = audSplit(rand).includes('accounts');
  return <Screen title={s.t('new_post')}><div style={{ padding: '4px 22px 40px' }}>
    {!clip ? <button className="tap" onClick={busy ? undefined : add} style={{ width: '100%', padding: '26px 18px', borderRadius: 20, border: '1.4px solid color-mix(in srgb, var(--ink) 25%, transparent)', textAlign: 'center' }}>
      <span style={{ width: 54, height: 54, borderRadius: '50%', background: 'var(--btn)', color: 'var(--cream)', display: 'inline-grid', placeItems: 'center' }}><Icon n="mic_rounded" size={26} /></span>
      <div style={{ fontWeight: 800, fontSize: 16, marginTop: 12 }}>{s.t('add_audio')}</div><div style={{ color: 'var(--sub)', fontSize: 12.5, marginTop: 3 }}>{s.t('audio_req')}</div></button>
      : <div className="row2" style={{ padding: '10px 6px 10px 10px', borderRadius: 20, border: '1.4px solid color-mix(in srgb, var(--ink) 50%, transparent)', gap: 12 }}>
        <button className="tap" aria-label={playing ? 'Jeda' : 'Putar'} onClick={play} style={{ width: 44, height: 44, borderRadius: playing ? 13 : 22, background: playing ? 'var(--brand)' : 'var(--btn)', color: playing ? '#fff' : 'var(--cream)', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon n={playing ? 'pause_rounded' : 'play_arrow_rounded'} size={24} /></button>
        <div style={{ flex: 1, minWidth: 0 }}><Wave seed={clip.blob.size} progress={0} height={34} /></div>
        <b style={{ fontSize: 13.5 }}>{mmss(clip.secs)}</b><IconBtn n="refresh_rounded" color="var(--sub)" onClick={add} /><IconBtn n="close_rounded" color="var(--sub)" onClick={() => { au.current?.pause(); setClip(null); setPlaying(false); setBgm(false); }} /></div>}
    {clip ? <div className="row2" style={{ paddingTop: 14, gap: 12 }}><div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 16 }}>{s.t('bgm_label')}</div><div style={{ color: 'var(--sub)', fontSize: 12.5 }}>{s.t('bgm_note')}</div></div><Toggle v={bgm} on={setBgm} /></div> : null}
    <div style={{ height: 14 }} />
    <div className="sheetfield"><textarea rows={4} value={text} placeholder={s.t('write_hups')} onChange={(e) => setText(e.target.value)} /></div>
    <div style={{ height: 6 }} /><MentionBar value={text} onPick={setText} />
    <div style={{ color: 'var(--sub)', fontSize: 12.5, margin: '0 0 14px 6px' }}>{s.t('tag_hint')}</div>
    <div className="row2" style={{ paddingBottom: 14, gap: 12 }}><div style={{ flex: 1, fontWeight: 600, fontSize: 16 }}>{s.t('pprof')}</div><Toggle v={pprof} on={setPprof} /></div>
    <Pick label={s.t('who_see')} value={rand} opts={withLabels(uploadAud)} on={async (v) => { setRand(v); if (audSplit(v).includes('accounts') && !Object.keys(picked).length) { const r = await sheet<Record<string, any>>((close) => <AccountPick init={picked} close={close as any} />); if (r) { setPicked(r); if (!Object.keys(r).length) { const l = audSplit(v).filter((x) => x !== 'accounts'); setRand(l.length ? l.join(',') : 'public'); } } } }} />
    {hasAcc ? <button className="tap srow" style={{ marginTop: 10, marginBottom: 0, fontSize: 15 }} onClick={pickAcc}><Icon n="person_search_outlined" size={20} /><span style={{ flex: 1 }}>{s.t('pick_acc_n').replace('{n}', `${Object.keys(picked).length}`)}</span><Icon n="edit_outlined" size={18} color="var(--sub)" /></button> : null}
    <div style={{ height: 26 }} /><PBtn loading={busy} icon="arrow_upward_rounded" onClick={submit}>{s.t('upload')}</PBtn>
    <div style={{ textAlign: 'center', color: 'var(--sub)', fontSize: 13, marginTop: 12 }}>{s.t('noedit')}</div></div></Screen>;
}
