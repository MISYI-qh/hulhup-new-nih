'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Icon } from './Icon';
import { useStore } from '@/lib/store';
import { useRouter } from 'next/navigation';

// ---------- overlay: toast, sheet, confirm ----------
type Item = { id: number; kind: 'sheet' | 'dlg'; render: (close: (v?: any) => void) => React.ReactNode; res: (v: any) => void };
let items: Item[] = [], toasts: { id: number; m: string; bad: boolean }[] = [], seq = 0; const subs = new Set<() => void>();
const emit = () => { snap = { items, toasts }; subs.forEach((f) => f()); };
let snap = { items, toasts };
const sub = (f: () => void) => { subs.add(f); return () => subs.delete(f); };
export function toast(m: string, o: { bad?: boolean } = {}) { const id = ++seq; toasts = [...toasts, { id, m, bad: !!o.bad }]; emit(); setTimeout(() => { toasts = toasts.filter((t) => t.id !== id); emit(); }, 2900); }
function open<T>(kind: Item['kind'], render: Item['render']): Promise<T | undefined> {
  return new Promise((res) => { const id = ++seq; items = [...items, { id, kind, render, res: (v) => { items = items.filter((i) => i.id !== id); emit(); res(v); } }]; emit(); });
}
export const sheet = <T,>(render: Item['render']) => open<T>('sheet', render);
export async function confirmDlg(title: string, body: string, yes: string, danger = false): Promise<boolean> {
  const s = (await import('@/lib/store')).store;
  return !!(await open<boolean>('dlg', (close) => <>
    <div style={{ fontSize: 20, fontWeight: 800 }}>{title}</div>
    <div style={{ fontSize: 15, lineHeight: 1.5, color: 'var(--sub)', marginTop: 10 }}>{body}</div>
    <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
      <PBtn ghost onClick={() => close(false)}>{s.t('cancel')}</PBtn>
      <PBtn color={danger ? 'var(--heart)' : undefined} onClick={() => close(true)}>{yes}</PBtn>
    </div></>));
}
export function Overlays() {
  const s = useSyncExternalStore(sub, () => snap, () => snap);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && items.length) items[items.length - 1].res(undefined); }; addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, []);
  return <>
    {s.items.map((i) => i.kind === 'sheet'
      ? <div key={i.id} className="ovl" onMouseDown={(e) => { if (e.target === e.currentTarget) i.res(undefined); }}><div className="hsheet" role="dialog"><div className="grab" />{i.render(i.res)}</div></div>
      : <div key={i.id} className="ovl center" onMouseDown={(e) => { if (e.target === e.currentTarget) i.res(false); }}><div className="hdlg" role="alertdialog">{i.render(i.res)}</div></div>)}
    {s.toasts.map((t) => <div key={t.id} className={`toast${t.bad ? ' bad' : ''}`} role="status"><div><Icon n={t.bad ? 'error_outline_rounded' : 'check_circle_outline_rounded'} size={20} />{t.m}</div></div>)}
  </>;
}

// ---------- komponen dasar ----------
export function IconBtn({ n, onClick, dot, color, label }: { n: string; onClick: () => void; dot?: boolean; color?: string; label?: string }) {
  return <button className="tap ibtn" onClick={onClick} aria-label={label || n}><Icon n={n} size={24} color={color} />{dot ? <span className="dot" /> : null}</button>;
}
export function PBtn({ children, onClick, icon, loading, ghost, color, fg, disabled }: { children: React.ReactNode; onClick?: () => void; icon?: string; loading?: boolean; ghost?: boolean; color?: string; fg?: string; disabled?: boolean }) {
  return <button className={`tap pbtn${ghost ? ' ghost' : ''}`} disabled={disabled || loading || !onClick} onClick={onClick} style={{ ...(color ? { background: color, color: '#fff' } : {}), ...(fg ? { color: fg } : {}) }}>
    {loading ? <span className="spin" /> : <>{icon ? <Icon n={icon} size={20} /> : null}<span>{children}</span></>}</button>;
}
export function Field({ label, value, onChange, secret, max, lines = 1, type, auto }: { label: string; value: string; onChange: (v: string) => void; secret?: boolean; max?: number; lines?: number; type?: string; auto?: string }) {
  const [hide, setHide] = useState(true);
  return <div className="field"><label>{label}</label>
    <div className={`box${lines > 1 ? ' multi' : ''}`}>
      {lines > 1 ? <textarea rows={lines} value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} />
        : <input type={secret && hide ? 'password' : (type || 'text')} value={value} maxLength={max} autoComplete={auto} onChange={(e) => onChange(e.target.value)} />}
      {secret ? <IconBtn n={hide ? 'visibility_off_rounded' : 'visibility_rounded'} onClick={() => setHide(!hide)} /> : null}
    </div>
    {max ? <div className="cnt">{value.length}/{max}</div> : null}</div>;
}
export function Toggle({ v, on }: { v: boolean; on: (v: boolean) => void }) {
  return <button className={`tap toggle${v ? ' on' : ''}`} role="switch" aria-checked={v} onClick={() => on(!v)}><i /></button>;
}
export function Seg<T extends string | number>({ items, value, on }: { items: [T, string][]; value: T; on: (v: T) => void }) {
  return <div className="seg" role="tablist">{items.map(([k, l]) => <b key={String(k)} role="tab" aria-selected={k === value} className={k === value ? 'on' : ''} onClick={() => on(k)}>{l}</b>)}</div>;
}
export function Skeleton({ n = 3 }: { n?: number }) {
  return <div className="pad" style={{ paddingTop: 8 }} aria-busy="true" aria-label="Memuat">{Array.from({ length: n }, (_, i) => <div className="skc" key={i}>
    <div className="row2"><div className="sk" style={{ width: 42, height: 42, borderRadius: '50%' }} /><div style={{ flex: 1, display: 'grid', gap: 7 }}><div className="sk" style={{ height: 12, width: '45%' }} /><div className="sk" style={{ height: 10, width: '28%' }} /></div></div>
    <div className="sk" style={{ height: 12 }} /><div className="sk" style={{ height: 12, width: '82%' }} /><div className="sk" style={{ height: 40, borderRadius: 20 }} /></div>)}</div>;
}
export function Loader() { return <Skeleton n={3} />; }
export function Empty({ icon, text, action }: { icon: string; text: string; action?: React.ReactNode }) {
  return <div className="empty"><div className="ic"><Icon n={icon} size={30} color="var(--sub)" /></div><div>{text}</div>{action}</div>;
}
export function TopBar({ title, back, actions, lead, center }: { title?: string; back?: boolean; actions?: React.ReactNode; lead?: React.ReactNode; center?: React.ReactNode }) {
  const r = useRouter();
  return <div className="topbar">
    {back ? <IconBtn n="arrow_back_ios_new_rounded" onClick={() => (history.length > 1 ? r.back() : r.push('/'))} label="Kembali" /> : lead}
    {center ? <div className="mid">{center}</div> : <div className="ttl" role="heading" aria-level={1}>{title}</div>}
    <div style={{ display: 'flex' }}>{actions}</div></div>;
}
export function Page({ children }: { children: React.ReactNode }) { const s = useStore(); void s; return <div className="app">{children}</div>; }
