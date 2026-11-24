'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import AnimMark from './AnimMark';
import { Icon, HIcon } from './Icon';
import { NeedLogin, Screen, useNav } from './shell';
import { Empty, Field, IconBtn, Loader, PBtn, Seg, confirmDlg, sheet, toast } from './ui';
import { audIcon, audText, AudChip } from './aud';
import { Avatar, MentionText, Verified } from './rich';
import { PostCard, FileBar, savePost, likeAudio, toggleOfflinePost, TimeText } from './post';
import { postCode } from '@/lib/links';
import { reportSheet } from './aud';
import { A, Api, store, useStore } from '@/lib/store';

export const MONTHS = { id: ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'], en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] };
export const ageOf = (iso: string) => { const b = new Date(iso); if (isNaN(+b)) return 0; const n = new Date(); let a = n.getFullYear() - b.getFullYear(); if (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate())) a--; return a; };
const iso = (y: number, m: number, d: number) => `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

// ---------- tanggal lahir: tiga roda ----------
function Wheel({ n, index, flex, text, on }: { n: number; index: number; flex: number; text: (i: number) => string; on: (i: number) => void }) {
  const r = useRef<HTMLOListElement>(null); const t = useRef<any>(0); const mine = useRef(false);
  useEffect(() => { const e = r.current; if (e && !mine.current) e.scrollTo({ top: index * 52 }); mine.current = false; }, [index, n]);
  return <ol ref={r} style={{ flex }} onScroll={() => { clearTimeout(t.current); t.current = setTimeout(() => { const e = r.current!; const i = Math.max(0, Math.min(n - 1, Math.round(e.scrollTop / 52))); if (i !== index) { mine.current = true; try { navigator.vibrate?.(4); } catch {} on(i); } }, 90); }}>
    {Array.from({ length: n }, (_, i) => <li key={i}>{text(i)}</li>)}</ol>;
}
function BirthSheet({ init, close }: { init: Date; close: (v?: Date) => void }) {
  const s = useStore(); const now = new Date();
  const [d, setD] = useState(init.getDate()), [m, setM] = useState(init.getMonth() + 1), [y, setY] = useState(init.getFullYear());
  const days = new Date(y, m, 0).getDate();
  const fix = (dd: number, mm: number, yy: number) => {
    if (yy === now.getFullYear() && mm > now.getMonth() + 1) mm = now.getMonth() + 1;
    const dm = new Date(yy, mm, 0).getDate(); if (dd > dm) dd = dm;
    if (yy === now.getFullYear() && mm === now.getMonth() + 1 && dd > now.getDate()) dd = now.getDate();
    setD(dd); setM(mm); setY(yy);
  };
  return <div><div className="sh-t" style={{ textAlign: 'center' }}>{s.t('age')}</div><div style={{ height: 8 }} />
    <div className="wheel"><div className="band" />
      <Wheel n={days} index={d - 1} flex={2} text={(i) => `${i + 1}`} on={(i) => fix(i + 1, m, y)} />
      <Wheel n={12} index={m - 1} flex={4} text={(i) => MONTHS[s.lang][i]} on={(i) => fix(d, i + 1, y)} />
      <Wheel n={121} index={now.getFullYear() - y} flex={3} text={(i) => `${now.getFullYear() - i}`} on={(i) => fix(d, m, now.getFullYear() - i)} />
    </div><div style={{ height: 14 }} /><PBtn onClick={() => close(new Date(y, m - 1, d))}>{s.t('done')}</PBtn></div>;
}
export function BirthField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const s = useStore(); const d = value ? new Date(value + 'T00:00:00') : null; const ok = d && !isNaN(+d);
  return <div><div style={{ margin: '0 0 6px 6px', fontSize: 13, fontWeight: 600, color: 'var(--sub)' }}>{label}</div>
    <button className="tap" style={{ height: 56, width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '0 18px', background: 'var(--soft)', borderRadius: 28, textAlign: 'left' }}
      onClick={async () => { const r = await sheet<Date>((close) => <BirthSheet init={ok ? d! : new Date(new Date().getFullYear() - 18, 0, 1)} close={close as any} />); if (r) onChange(iso(r.getFullYear(), r.getMonth() + 1, r.getDate())); }}>
      <span key={value} className="rise" style={{ flex: 1, fontSize: 16, fontWeight: 500 }}>{ok ? `${d!.getDate()} ${MONTHS[s.lang][d!.getMonth()]} ${d!.getFullYear()}` : ''}</span>
      {ok ? <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--sub)' }}>{ageOf(value)} {s.t('years')}</span> : null}
      <Icon n="unfold_more_rounded" color="var(--sub)" /></button></div>;
}

// ---------- kode pemulihan ----------
export const showRecoveryCode = (code: string, fresh = false) => sheet<void>((close) => {
  const s = store;
  return <div><div className="sh-t">{s.t(fresh ? 'rec_new' : 'rec_show_title')}</div><div style={{ color: 'var(--sub)', lineHeight: 1.4, margin: '8px 0 16px' }}>{s.t('rec_show_note')}</div>
    <div className="soft" style={{ padding: '18px 0', textAlign: 'center', fontSize: 24, fontWeight: 800, letterSpacing: 2, userSelect: 'all', borderRadius: 22 }}>{code}</div><div style={{ height: 14 }} />
    <PBtn ghost icon="content_copy_rounded" onClick={() => { navigator.clipboard?.writeText(code); toast(s.t('link_copied')); }}>{s.t('rec_copy')}</PBtn><div style={{ height: 10 }} />
    <PBtn icon="check_rounded" onClick={() => close()}>{s.t('rec_saved')}</PBtn></div>;
});
function NewRecoverySheet({ close }: { close: (v?: string) => void }) {
  const s = useStore(); const [pw, setPw] = useState('');
  return <div><div className="sh-t">{s.t('rec_new')}</div><div style={{ color: 'var(--sub)', lineHeight: 1.4, margin: '8px 0 14px' }}>{s.t('rec_new_note')}</div>
    <Field label={s.t('password')} value={pw} onChange={setPw} secret /><div style={{ height: 16 }} /><PBtn onClick={() => close(pw)}>{s.t('rec_new')}</PBtn></div>;
}
export async function newRecovery() {
  const pw = await sheet<string>((close) => <NewRecoverySheet close={close as any} />);
  if (pw == null) return;
  try { const j = await Api.req('POST', '/me/recovery', { password: pw }); await showRecoveryCode(`${j.recovery}`, true); } catch (e) { toast(store.err(e), { bad: true }); }
}

// ---------- masuk / daftar ----------
export function AuthScreen() {
  const s = useStore(); const n = useNav();
  const [reg, setReg] = useState(false), [busy, setBusy] = useState(false);
  const [name, setName] = useState(''), [user, setUser] = useState(''), [pw, setPw] = useState(''), [age, setAge] = useState('');
  const go = async () => {
    setBusy(true);
    try {
      if (reg) { const rj = await s.auth('/register', { name, username: user, password: pw, birth: age }); await showRecoveryCode(`${rj.recovery}`); }
      else await s.auth('/login', { username: user, password: pw });
      toast(`${s.t('welcome')}, ${s.me!.name}`); n.back();
    } catch (e) { toast(s.err(e), { bad: true }); setBusy(false); }
  };
  return <Screen back center={<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><AnimMark width={40} auto slow tapPlay /><span style={{ fontWeight: 800, fontSize: 21 }}>Hulhup</span></div>}>
    <div className="pad" style={{ paddingTop: 12, paddingBottom: 40}}>
      <Seg<string> items={[['login', s.t('login')], ['register', s.t('register')]]} value={reg ? 'register' : 'login'} on={(v) => setReg(v === 'register')} />
      <div className="stack" style={{ marginTop: 24, gap: 16 }}>
        {reg ? <Field label={s.t('name')} value={name} onChange={setName} max={40} auto="name" /> : null}
        <Field label={s.t('username')} value={user} onChange={setUser} max={20} auto="username" />
        <Field label={s.t('password')} value={pw} onChange={setPw} secret auto={reg ? 'new-password' : 'current-password'} />
        {reg ? <BirthField label={s.t('age')} value={age} onChange={setAge} /> : null}
      </div>
      <div style={{ height: 28 }} /><PBtn loading={busy} onClick={go}>{reg ? s.t('register') : s.t('login')}</PBtn>
      {!reg ? <div style={{ textAlign: 'center', paddingTop: 14 }}><Link href="/recover" style={{ color: 'var(--acc)', fontWeight: 700, padding: 8, display: 'inline-block' }}>{s.t('forgot')}</Link></div> : null}
    </div></Screen>;
}

export function RecoverScreen() {
  const s = useStore(); const n = useNav();
  const [user, setUser] = useState(''), [code, setCode] = useState(''), [pw, setPw] = useState(''), [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { const j = await Api.req('POST', '/recover', { username: user, code, password: pw }); await showRecoveryCode(`${j.recovery}`, true); toast(s.t('recover_ok')); n.back(); }
    catch (e) { toast(s.err(e), { bad: true }); setBusy(false); }
  };
  return <Screen title={s.t('recover_title')}><div className="pad stack" style={{ gap: 16, paddingTop: 8, paddingBottom: 40 }}>
    <div style={{ color: 'var(--sub)', lineHeight: 1.45 }}>{s.t('recover_hint')}</div>
    <Field label={s.t('username')} value={user} onChange={setUser} max={20} />
    <Field label={s.t('recovery_code')} value={code} onChange={setCode} max={14} />
    <Field label={s.t('new_password')} value={pw} onChange={setPw} secret />
    <div style={{ height: 12 }} /><PBtn loading={busy} onClick={go}>{s.t('recover_do')}</PBtn></div></Screen>;
}

// ---------- baris audio ----------
export function AudioRow({ a, mine, onDelete, showOwner, scope }: { a: A; mine?: boolean; onDelete?: () => void; showOwner?: boolean; scope?: unknown }) {
  const s = useStore(); const n = useNav(); const on = s.playing === a.id; const off = s.isOffline(a.id);
  return <div className="tap" style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--soft)', borderRadius: 26, padding: '12px 6px 12px 12px', marginBottom: 10, cursor: 'pointer' }} onClick={() => n.push(`/p/${postCode(a.id)}`)}>
    {!a.url ? <span style={{ width: 46, height: 46, borderRadius: '50%', background: 'color-mix(in srgb, var(--ink) 10%, transparent)', display: 'grid', placeItems: 'center', flex: 'none' }}><HIcon k="hups" size={22} /></span>
      : <button className="tap" aria-label={on ? 'Jeda' : 'Putar'} onClick={(e) => { e.stopPropagation(); s.play(a, { scope }).catch(() => toast(s.t('e_server'), { bad: true })); }} style={{ width: 46, height: 46, borderRadius: '50%', flex: 'none', background: on ? 'var(--ink)' : 'var(--brand)', color: on ? 'var(--bg)' : '#fff', display: 'grid', placeItems: 'center', transition: 'background .25s' }}><Icon n={on ? 'pause_rounded' : 'play_arrow_rounded'} size={26} /></button>}
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontWeight: 700, fontSize: 15, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden', color: a.desc.trim() ? undefined : 'var(--sub)' }}>{a.desc.trim() || s.t('untitled')}</div>
      {a.created > 0 ? <div style={{ color: 'var(--sub)', fontSize: 12.5, margin: '4px 0 3px' }}>{s.when(a.created)}</div> : null}
      <div className="row2" style={{ gap: 10, flexWrap: 'wrap' }}>
        {a.url ? <span style={{ fontSize: 13, fontWeight: 700, color: on ? 'var(--ink)' : 'var(--sub)' }}><TimeText on={on} secs={a.secs} full /></span> : null}
        <AudChip rand={a.rand} to={a.to} />
        {showOwner ? <span style={{ color: 'var(--sub)', fontSize: 13 }}>{a.ownerName}</span> : null}
      </div></div>
    {!mine && s.me && s.me.username !== a.owner ? <button className="tap" style={{ padding: 6, color: 'var(--sub)' }} aria-label={s.t('report')} onClick={(e) => { e.stopPropagation(); reportSheet({ audio: a.id }); }}><Icon n="flag_outlined" size={19} /></button> : null}
    <button className="tap row2" style={{ gap: 4, padding: 6, color: a.liked ? 'var(--ink)' : 'var(--sub)' }} aria-label="Sorot" onClick={(e) => { e.stopPropagation(); likeAudio(a); }}><HIcon k="sorot" filled={a.liked} size={22} /><span style={{ fontSize: 13, fontWeight: 700 }}>{a.likes}</span></button>
    {onDelete ? <IconBtn n="delete_outline_rounded" color="var(--sub)" onClick={onDelete} /> : null}
  </div>;
}

// ---------- akun ----------
export function UserTile({ u, trailing }: { u: any; trailing?: React.ReactNode }) {
  return <Link href={`/@${u.username}`} className="urow tap"><Avatar url={u.avatar} name={u.name} size={46} />
    <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 700, fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</div><div style={{ color: 'var(--sub)', fontSize: 13 }}>{u.username}</div></div>
    {trailing ?? <Icon n="chevron_right_rounded" color="var(--sub)" />}</Link>;
}
export function FollowsScreen({ u, kind }: { u: string; kind: 'followers' | 'following' }) {
  const s = useStore(); const [users, setUsers] = useState<any[] | null>(null); const [err, setErr] = useState<string | null>(null);
  useEffect(() => { Api.req('GET', `/users/${u}/follows?kind=${kind}`).then((j) => setUsers(j.users)).catch((e) => setErr(store.err(e))); }, [u, kind]);
  const own = kind === 'followers' && u === s.me?.username;
  const remove = async (x: any) => {
    if (!(await confirmDlg(s.t('remove_follower'), s.t('remove_follower_q').replace('{name}', `${x.name}`), s.t('remove'), true))) return;
    try { await Api.req('DELETE', `/me/followers/${x.username}`); setUsers((c) => c!.filter((e) => e !== x)); toast(s.t('follower_removed')); await s.refresh(); } catch (e) { toast(s.err(e), { bad: true }); }
  };
  return <Screen title={s.t(kind)}>{err ? <Empty icon="cloud_off_rounded" text={err} /> : !users ? <Loader k="users" /> : !users.length ? <Empty icon="group_outlined" text={s.t('empty_list')} />
    : <div className="pad" style={{ paddingBottom: 40 }}>{users.map((x) => <UserTile key={x.username} u={x} trailing={own ? <button className="tap" style={{ padding: '9px 14px', background: 'var(--bg)', borderRadius: 18, color: 'var(--heart)', fontWeight: 700, fontSize: 13 }} onClick={(e) => { e.preventDefault(); e.stopPropagation(); remove(x); }}>{s.t('remove')}</button> : undefined} />)}</div>}</Screen>;
}

// ---------- hari beruntun ----------
export function StreakChip({ streak, days, open }: { streak: number; days: number; open?: boolean }) {
  const s = useStore(); const n = useNav();
  const box = <div className="row2" style={{ gap: 10, padding: '12px 16px', background: 'var(--soft)', borderRadius: 24, display: 'inline-flex' }}>
    <Icon n="local_fire_department_rounded" size={28} color={streak > 0 ? '#E8833A' : 'var(--sub)'} />
    <div style={{ textAlign: 'left' }}><div style={{ fontWeight: 800, fontSize: 15 }}>{s.t('streak_t').replace('{n}', `${streak}`)}</div>{days > 0 ? <div style={{ color: 'var(--sub)', fontSize: 12.5 }}>{s.t('days_total').replace('{n}', `${days}`)}</div> : null}</div>
    {open ? <Icon n="calendar_month_rounded" size={20} color="var(--sub)" /> : null}</div>;
  return open ? <button className="tap" onClick={() => n.push('/streak')}>{box}</button> : box;
}
export function StreakScreen() {
  const s = useStore(); const [days, setDays] = useState<Set<string>>(new Set()); const [streak, setStreak] = useState(0), [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true); const [err, setErr] = useState<string | null>(null);
  const now = new Date(); const [month, setMonth] = useState(new Date(now.getFullYear(), now.getMonth(), 1));
  useEffect(() => { Api.req('GET', '/me/log').then((j) => { setDays(new Set((j.days as any[]).map(String))); setStreak(j.streak ?? 0); setTotal(j.total ?? 0); }).catch((e) => setErr(store.err(e))).finally(() => setLoading(false)); }, []);
  if (!s.me && s.ready) return <Screen title={s.t('streak_cal')}><NeedLogin /></Screen>;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sorted = [...days].sort(); const first = sorted.length ? new Date(sorted[0] + 'T00:00:00') : null;
  const wd = s.lang === 'id' ? ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'] : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const n = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate(), lead = (new Date(month.getFullYear(), month.getMonth(), 1).getDay() + 6) % 7;
  const canPrev = !!first && +month > +new Date(first.getFullYear(), first.getMonth(), 1), canNext = +month < +new Date(today.getFullYear(), today.getMonth(), 1);
  const missed: Date[] = []; let inCount = 0; const cells: React.ReactNode[] = Array.from({ length: lead }, (_, i) => <span key={`l${i}`} />);
  for (let d = 1; d <= n; d++) {
    const dt = new Date(month.getFullYear(), month.getMonth(), d), inn = days.has(iso(dt.getFullYear(), dt.getMonth() + 1, d));
    const isToday = +dt === +today, past = !!first && +dt >= +first && +dt < +today, miss = past && !inn;
    if (inn) inCount++; if (miss) missed.push(dt);
    const bg = inn ? 'var(--brand)' : miss ? 'color-mix(in srgb, var(--heart) 16%, transparent)' : undefined;
    const fg = inn ? 'var(--cream)' : miss ? 'var(--heart)' : (+dt > +today || !first || +dt < +first ? 'color-mix(in srgb, var(--sub) 50%, transparent)' : 'var(--ink)');
    cells.push(<i key={d} style={{ background: bg, color: fg, fontWeight: inn || isToday ? 800 : 500, boxShadow: isToday ? 'inset 0 0 0 2px var(--ink)' : undefined }}>{d}</i>);
  }
  const mn = MONTHS[s.lang][month.getMonth()];
  const legend = (c: string, t: string, ring = false) => <span className="row2" style={{ gap: 6, color: 'var(--sub)', fontSize: 12.5 }}><i style={{ width: 14, height: 14, borderRadius: '50%', background: ring ? undefined : c, boxShadow: ring ? `inset 0 0 0 2px ${c}` : undefined }} />{t}</span>;
  return <Screen title={s.t('streak_cal')}>{loading ? <Loader k="streak" /> : err ? <Empty icon="cloud_off_rounded" text={err} /> : <div className="pad" style={{ paddingBottom: 40 }}>
    <StreakChip streak={streak} days={total} />
    <div className="row2" style={{ marginTop: 18 }}><IconBtn n="chevron_left_rounded" color={canPrev ? undefined : 'color-mix(in srgb, var(--sub) 30%, transparent)'} onClick={() => canPrev && setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} />
      <div style={{ flex: 1, textAlign: 'center', fontWeight: 800, fontSize: 18 }}>{mn} {month.getFullYear()}</div>
      <IconBtn n="chevron_right_rounded" color={canNext ? undefined : 'color-mix(in srgb, var(--sub) 30%, transparent)'} onClick={() => canNext && setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} /></div>
    <div className="cal" style={{ marginTop: 8 }}>{wd.map((w) => <span key={w} style={{ textAlign: 'center', color: 'var(--sub)', fontSize: 12.5, fontWeight: 600 }}>{w}</span>)}</div><div style={{ height: 6 }} />
    <div className="cal">{cells}</div>
    <div className="row2" style={{ gap: 18, flexWrap: 'wrap', marginTop: 10 }}>{legend('var(--brand)', s.t('cal_in'))}{legend('var(--heart)', s.t('cal_miss'))}{legend('var(--ink)', s.t('cal_today'), true)}</div>
    <div style={{ fontWeight: 700, fontSize: 15, margin: '18px 0 14px' }}>{s.t('cal_month').replace('{a}', `${inCount}`).replace('{b}', `${missed.length}`)}</div>
    <div style={{ color: 'var(--sub)', fontWeight: 700, fontSize: 13, marginBottom: 8 }}>{s.t('cal_missed_list')}</div>
    {!missed.length ? <div style={{ color: 'var(--sub)', fontSize: 14 }}>{s.t('cal_none')}</div> : <div className="row2" style={{ gap: 8, flexWrap: 'wrap' }}>{missed.map((d) => <span key={+d} style={{ padding: '8px 12px', borderRadius: 16, background: 'color-mix(in srgb, var(--heart) 12%, transparent)', color: 'var(--heart)', fontWeight: 600, fontSize: 13 }}>{wd[(d.getDay() + 6) % 7]}, {d.getDate()} {MONTHS[s.lang][d.getMonth()]}</span>)}</div>}
    <div style={{ color: 'var(--sub)', fontSize: 12.5, lineHeight: 1.4, marginTop: 18 }}>{s.t('cal_note')}</div></div>}</Screen>;
}

// ---------- offline ----------
export function OfflineScreen() {
  const s = useStore(); const scope = useRef({});
  useEffect(() => () => store.leave(scope.current), []);
  return <Screen title={s.t('offline_t')}>{!s.offline.length ? <Empty icon="download_for_offline_outlined" text={s.t('empty_offline')} />
    : <div className="pad" style={{ paddingBottom: 40 }}>{s.offline.map((a) => <AudioRow key={a.id} a={a} showOwner scope={scope.current} />)}</div>}</Screen>;
}

// ---------- terkirim ----------
export function SentScreen({ to }: { to?: string }) {
  const s = useStore(); const [people, setPeople] = useState<any[] | null>(null); const [posts, setPosts] = useState<A[]>([]); const [err, setErr] = useState<string | null>(null); const [ok, setOk] = useState(false);
  const scope = useRef({});
  useEffect(() => { (async () => { try { if (!to) setPeople((await Api.req('GET', '/me/sent')).people); else setPosts(((await Api.req('GET', `/me/sent?to=${encodeURIComponent(to)}`)).audios as any[]).map((e) => new A(e))); } catch (e) { setErr(store.err(e)); } setOk(true); })(); return () => store.leave(scope.current); }, [to]);
  if (!s.me && s.ready) return <Screen title={s.t('sent_title')}><NeedLogin /></Screen>;
  return <Screen title={to ? `${s.t('sent_title')} · ${to}` : s.t('sent_title')}>{err ? <Empty icon="cloud_off_rounded" text={err} /> : !ok ? <Loader /> : !to
    ? (!people!.length ? <Empty icon="send_outlined" text={s.t('sent_none')} /> : <div className="pad" style={{ paddingBottom: 40 }}><div style={{ color: 'var(--sub)', fontSize: 13, margin: '0 0 10px 6px' }}>{s.t('sent_hint')}</div>
      {people!.map((u) => <Link key={u.username} href={`/sent/${u.username}`} className="urow tap" style={{ padding: '10px 16px 10px 12px' }}><Avatar url={u.avatar} name={`${u.name}`} size={44} /><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 800, fontSize: 15.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</div><div style={{ color: 'var(--sub)', fontSize: 13 }}>{s.t('sent_n').replace('{n}', `${u.n}`)}</div></div><Icon n="chevron_right_rounded" color="var(--sub)" /></Link>)}</div>)
    : (!posts.length ? <Empty icon="send_outlined" text={s.t('sent_none')} /> : <div className="pad" style={{ paddingBottom: 40 }}>{posts.map((a) => <PostCard key={a.id} a={a} scope={scope.current} />)}</div>)}</Screen>;
}

// ---------- cari ----------
export function SearchScreen() {
  const s = useStore(); const [q, setQ] = useState(''); const [res, setRes] = useState<{ users: any[]; audios: A[] } | null>(null); const [busy, setBusy] = useState(false);
  const t = useRef<any>(0); const last = useRef(''); const scope = useRef({});
  useEffect(() => () => { clearTimeout(t.current); if (last.current.length >= 2) store.addSearch(last.current); store.leave(scope.current); }, []);
  const run = (v: string) => {
    setQ(v); clearTimeout(t.current);
    if (!v.trim()) { setRes(null); return; }
    t.current = setTimeout(async () => { setBusy(true); try { const j = await Api.req('GET', `/search?q=${encodeURIComponent(v.trim())}`); setRes({ users: j.users, audios: (j.audios as any[]).map((e) => new A(e)) }); last.current = v.trim(); } catch (e) { toast(store.err(e), { bad: true }); } setBusy(false); }, 350);
  };
  const sec = (x: string) => <div style={{ margin: '8px 0 10px 6px', color: 'var(--sub)', fontWeight: 700, fontSize: 13 }}>{x}</div>;
  return <Screen title={s.t('search')}>
    <div style={{ padding: '0 20px 14px' }}><div className="row2" style={{ height: 54, padding: '0 6px 0 18px', background: 'var(--soft)', borderRadius: 27, gap: 10 }}>
      <Icon n="search_rounded" color="var(--sub)" /><input autoFocus value={q} onChange={(e) => run(e.target.value)} placeholder={s.t('search_hint')} style={{ flex: 1, border: 0, background: 'none', outline: 'none', fontSize: 16, minWidth: 0 }} />
      {busy ? <span className="spin" style={{ marginRight: 12, width: 18, height: 18 }} /> : null}</div></div>
    <div className="pad" style={{ paddingBottom: 40}}>
      {!res ? (s.searches.length ? <>
        <div className="row2"><div style={{ flex: 1 }}>{sec(s.t('hist_recent'))}</div><button className="tap" style={{ padding: 8, color: 'var(--sub)', fontWeight: 700, fontSize: 13 }} onClick={() => s.clearSearches()}>{s.t('hist_clear')}</button></div>
        {s.searches.map((x) => <div key={x} className="row2" style={{ padding: '4px 6px', gap: 14 }}><button className="tap row2" style={{ flex: 1, gap: 14, textAlign: 'left', minWidth: 0 }} onClick={() => run(x)}><Icon n="history_rounded" size={20} color="var(--sub)" /><span style={{ flex: 1, fontSize: 16, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x}</span></button><IconBtn n="close_rounded" onClick={() => s.delSearch(x)} /></div>)}</> : null)
        : (!res.users.length && !res.audios.length) ? <Empty icon="search_off_rounded" text={s.t('empty_search')} /> : <>
          {res.users.length ? <>{sec(s.t('sec_acc'))}{res.users.map((u) => <UserTile key={u.username} u={u} />)}</> : null}
          {res.audios.length ? <>{sec(s.t('sec_audio'))}{res.audios.map((a) => a.inHups || !a.files.length ? <PostCard key={a.id} a={a} scope={scope.current} /> : <AudioRow key={a.id} a={a} showOwner scope={scope.current} />)}</> : null}</>}
    </div></Screen>;
}

// ---------- notifikasi ----------
export function NotifScreen() {
  const s = useStore(); const n = useNav(); const [items, setItems] = useState<any[] | null>(null); const [err, setErr] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false); const [sel, setSel] = useState<Set<number>>(new Set());
  useEffect(() => { Api.req('GET', '/notifications').then((j) => { setItems(j.items); s.refresh(); }).catch((e) => setErr(store.err(e))); }, []);
  if (!s.me && s.ready) return <Screen title={s.t('notif')}><NeedLogin /></Screen>;
  const del = async (all: boolean) => {
    if (!(await confirmDlg(s.t('delete'), s.t(all ? 'notif_del_all_q' : 'notif_del_q'), s.t('delete'), true))) return;
    try { await Api.req('POST', '/notifications/delete', all ? { all: true } : { ids: [...sel] }); setItems(all ? [] : items!.filter((e) => !sel.has(e.id))); setSel(new Set()); setSelecting(false); toast(s.t('notif_deleted')); } catch (e) { toast(s.err(e), { bad: true }); }
  };
  const open = (x: any) => { const k = `${x.type}`, post = x.post ?? 0; if (k === 'phipop_code') { n.push(`/phipop?code=${encodeURIComponent(`${x.extra ?? ''}`)}`); return; } if (['comment', 'reply', 'mention', 'like'].includes(k) && post) n.push(`/p/${postCode(post)}`); else n.push(`/@${x.username}`); };
  const body = (x: any) => {
    const k = `${x.type}`, sys = ['streak', 'missed', 'tired', 'badge'].includes(k), like = k === 'like', cm = k === 'comment' || k === 'reply', relk = k === 'rel_req' || k === 'rel_ok';
    const bg = x.seen === true ? 'var(--soft)' : 'color-mix(in srgb, var(--ink) 12%, transparent)';
    const when = <span style={{ color: 'var(--sub)', fontSize: 12 }}>{s.ago(x.created)}</span>;
    if (sys) return <div className="row2" style={{ gap: 14, padding: 12, background: bg, borderRadius: 26, marginBottom: 10, alignItems: 'center' }}>
      <span style={{ width: 46, height: 46, borderRadius: '50%', background: 'var(--brand)', display: 'grid', placeItems: 'center', flex: 'none' }}><AnimMark width={26} colors={['#fff', '#5b47f5', '#4330d0']} /></span>
      <div style={{ flex: 1 }}><div className="row2"><b style={{ fontSize: 15, flex: 1 }}>{k === 'tired' ? s.t('r_title') : 'Hulhup'}</b>{when}</div><div style={{ fontSize: 15, lineHeight: 1.4, marginTop: 2 }}>{k === 'tired' ? s.t('r_body') : k === 'badge' ? s.t('n_badge') : s.t(k === 'streak' ? 'n_streak' : 'n_missed').replace('{n}', `${x.n}`)}</div></div></div>;
    return <div className="row2" style={{ gap: 14, padding: 12, background: bg, borderRadius: 26, marginBottom: 10, alignItems: 'center' }}>
      <span style={{ position: 'relative', flex: 'none' }}><Avatar url={x.avatar} name={x.name} size={46} />
        <span style={{ position: 'absolute', right: -4, bottom: -4, width: 22, height: 22, borderRadius: '50%', background: 'var(--btn)', border: '2px solid var(--bg)', display: 'grid', placeItems: 'center', color: 'var(--cream)' }}>
          {like ? <HIcon k="sorot" filled size={13} color="var(--cream)" /> : cm ? <HIcon k="comment" size={12} color="var(--cream)" /> : <Icon n={relk ? 'diversity_3_rounded' : 'person_add_alt_1_rounded'} size={11} color="var(--cream)" />}</span></span>
      <div style={{ flex: 1, minWidth: 0, fontSize: 15, lineHeight: 1.4 }}><b style={{ fontWeight: 800 }}>{x.name}</b>{'  '}{s.notifText(k, `${x.extra ?? ''}`)}<div>{when}</div></div></div>;
  };
  return <Screen title={s.t('notif')} actions={items?.length ? <button className="tap" style={{ padding: 10, fontWeight: 700 }} onClick={() => { setSelecting(!selecting); setSel(new Set()); }}>{selecting ? s.t('cancel') : s.t('notif_edit')}</button> : null}>
    {selecting ? <div className="row2" style={{ padding: '0 20px 8px', gap: 10 }}><div style={{ flex: 1 }}><PBtn ghost onClick={sel.size ? () => del(false) : undefined}>{s.t('notif_del_sel').replace('{n}', `${sel.size}`)}</PBtn></div><div style={{ flex: 1 }}><PBtn color="var(--heart)" onClick={() => del(true)}>{s.t('notif_del_all')}</PBtn></div></div> : null}
    {err ? <Empty icon="cloud_off_rounded" text={err} /> : !items ? <Loader k="notif" /> : <div className="pad" style={{ paddingBottom: 40}}>
      {s.me && (s.me.streak > 0 || s.me.days > 0) ? <div style={{ marginBottom: 14 }}><StreakChip streak={s.me.streak} days={s.me.days} open /></div> : null}
      {!items.length ? <Empty icon="notifications_none_rounded" text={s.t('empty_notif')} /> : null}
      {items.map((x) => selecting
        ? <div key={x.id} className="row2 tap" role="checkbox" aria-checked={sel.has(x.id)} style={{ borderRadius: 28, border: `2px solid ${sel.has(x.id) ? 'var(--ink)' : 'transparent'}`, cursor: 'pointer' }} onClick={() => setSel((c) => { const m = new Set(c); m.has(x.id) ? m.delete(x.id) : m.add(x.id); return m; })}>
          <span style={{ padding: '0 4px 0 10px', color: sel.has(x.id) ? 'var(--ink)' : 'var(--sub)' }}><Icon n={sel.has(x.id) ? 'check_circle_rounded' : 'circle_outlined'} /></span><div style={{ flex: 1, pointerEvents: 'none' }}>{body(x)}</div></div>
        : <div key={x.id} className="tap" style={{ cursor: 'pointer' }} onClick={() => ['streak', 'missed', 'tired', 'badge'].includes(`${x.type}`) ? undefined : open(x)} onContextMenu={(e) => { e.preventDefault(); setSelecting(true); setSel(new Set([x.id])); }}>{body(x)}</div>)}
    </div>}</Screen>;
}
