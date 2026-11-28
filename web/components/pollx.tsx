'use client';
import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { Api, store, useStore, type A, type Poll } from '@/lib/store';
import { Toggle, toast } from './ui';

/* ───────── waktu tersisa ───────── */
export function leftText(ms: number): string {
  const t = (k: string) => store.t(k);
  const m = Math.max(1, Math.round(ms / 60000));
  if (m >= 1440) { const d = Math.floor(m / 1440), h = Math.round((m % 1440) / 60); return `${d} ${t('exp_day')}${h && d < 3 ? ` ${h} ${t('exp_hour')}` : ''}`; }
  if (m >= 60) { const h = Math.floor(m / 60), mm = m % 60; return `${h} ${t('exp_hour')}${mm ? ` ${mm} ${t('exp_min')}` : ''}`; }
  return `${m} ${t('exp_min')}`;
}
/** Penanda "berakhir dalam …" pada post yang punya masa aktif. */
export function ExpiryChip({ a }: { a: A }) {
  const s = useStore(); const [, tick] = useState(0);
  useEffect(() => { if (!a.expiresAt) return; const i = setInterval(() => tick((x) => x + 1), 30000); return () => clearInterval(i); }, [a.expiresAt]);
  if (!a.expiresAt) return null;
  const left = a.expiresAt - Date.now();
  return <div className="pxchip" style={left < 3600000 ? { color: 'var(--heart)' } : undefined}><Icon n="schedule_rounded" size={14} />{left <= 0 ? '…' : s.t('exp_chip').replace('{t}', leftText(left))}</div>;
}
export function PinTag() { const s = useStore(); return <div className="pxchip"><Icon n="push_pin_rounded" size={14} />{s.t('pinned_tag')}</div>; }

/* ───────── tampilan voting ───────── */
export function PollView({ a }: { a: A }) {
  const s = useStore(); const p = a.poll;
  const [mode, setMode] = useState<'pct' | 'cnt'>('pct');
  const [sel, setSel] = useState<number[]>([]); const [editing, setEditing] = useState(false); const [busy, setBusy] = useState(false);
  if (!p) return null;
  const showRes = p.reveal && !editing;
  const send = async (ids: number[]) => {
    if (busy) return; if (!s.me) { toast(s.t('need_login')); return; }
    setBusy(true);
    try { const j = await Api.req('POST', `/posts/${a.id}/vote`, { options: ids }); a.poll = j.poll; setEditing(false); setSel([]); store.poke(); }
    catch (e) { toast(s.err(e), { bad: true }); }
    setBusy(false);
  };
  const toggle = (id: number) => {
    if (busy) return;
    if (p.max === 1) { send([id]); return; }
    setSel((c) => { if (c.includes(id)) return c.filter((x) => x !== id); if (c.length >= p.max) { toast(s.t('poll_max_err').replace('{n}', `${p.max}`), { bad: true }); return c; } return [...c, id]; });
  };
  const startEdit = () => { setSel(p.mine); setEditing(true); };
  const total = p.total ?? 0;
  const pct = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);
  const top = showRes ? Math.max(0, ...p.options.map((o) => o.votes ?? 0)) : 0;
  const multi = p.max > 1;
  return <div className="poll" onClick={(e) => e.stopPropagation()}>
    {p.title ? <div className="poll-t">{p.title}</div> : null}
    {showRes ? <div className="poll-top"><div className="seg" role="tablist">{([['pct', s.t('poll_pct')], ['cnt', s.t('poll_cnt')]] as const).map(([k, l]) => <b key={k} role="tab" aria-selected={mode === k} className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>{l}</b>)}</div></div>
      : multi ? <div className="poll-hint">{s.t('poll_upto').replace('{n}', `${p.max}`)}</div> : null}
    <div className="poll-list">
      {p.options.map((o) => {
        const mine = p.mine.includes(o.id), on = sel.includes(o.id), v = o.votes ?? 0;
        if (showRes) {
          const w = mode === 'pct' ? pct(v) : top ? Math.round((v / top) * 100) : 0;
          return <button key={o.id} className={`tap po res${mine ? ' mine' : ''}${v === top && v > 0 ? ' lead' : ''}`} onClick={() => { if (p.mine.length === 0) toggle(o.id); }} disabled={busy} aria-label={o.label}>
            <i style={{ width: `${w}%` }} /><span className="pl">{mine ? <Icon n="check_circle_rounded" size={17} /> : null}<span>{o.label}</span></span>
            <b className="pv">{mode === 'pct' ? `${pct(v)}%` : v}</b></button>;
        }
        return <button key={o.id} className={`tap po${on ? ' sel' : ''}`} onClick={() => toggle(o.id)} disabled={busy} aria-pressed={on}>
          <span className={`pk${multi ? ' sq' : ''}${on ? ' on' : ''}`}>{on ? <Icon n="check_rounded" size={14} /> : null}</span><span className="pl"><span>{o.label}</span></span></button>;
      })}
    </div>
    <div className="poll-ft">
      {showRes ? <span>{total > 0 ? s.t('poll_total').replace('{n}', store.fmt(total)) : s.t('poll_none')}</span>
        : !p.reveal ? <span><Icon n="lock_outline_rounded" size={13} style={{ verticalAlign: -2, marginRight: 4 }} />{s.t('poll_hidden')}</span> : <span>{total > 0 ? s.t('poll_total').replace('{n}', store.fmt(total)) : s.t('poll_none')}</span>}
      <span style={{ flex: 1 }} />
      {showRes && p.voted ? <button className="tap poll-link" onClick={startEdit}>{s.t('poll_change')}</button> : null}
      {!showRes && (multi || editing) ? <button className="tap poll-send" disabled={busy || !sel.length} onClick={() => send(sel)}>{busy ? '…' : s.t('poll_submit')}</button> : null}
      {editing ? <button className="tap poll-link" onClick={() => setEditing(false)}>{s.t('cancel')}</button> : null}
    </div>
  </div>;
}

/* ───────── penyusun voting (composer) ───────── */
export type PollDraft = { title: string; opts: string[]; max: number; showFirst: boolean };
export const newPoll = (): PollDraft => ({ title: '', opts: ['', ''], max: 1, showFirst: true });
export function pollError(p: PollDraft): boolean {
  const o = p.opts.map((x) => x.trim()).filter(Boolean);
  return o.length < 2 || new Set(o.map((x) => x.toLowerCase())).size !== o.length;
}
export function PollEditor({ v, set, onClose }: { v: PollDraft; set: (p: PollDraft) => void; onClose: () => void }) {
  const s = useStore();
  const filled = v.opts.map((x) => x.trim()).filter(Boolean).length;
  const maxCap = Math.max(1, v.opts.length);
  const upd = (i: number, x: string) => set({ ...v, opts: v.opts.map((o, k) => (k === i ? x : o)) });
  return <div className="cx">
    <div className="cx-h"><Icon n="poll_rounded" size={19} /><b>{s.t('poll')}</b><span style={{ flex: 1 }} />
      <button className="tap cx-x" aria-label="Hapus" onClick={onClose}><Icon n="close_rounded" size={18} /></button></div>
    <input className="cx-in big" value={v.title} maxLength={200} placeholder={s.t('poll_title_ph')} onChange={(e) => set({ ...v, title: e.target.value })} />
    <div className="cx-opts">
      {v.opts.map((o, i) => <div key={i} className="cx-opt">
        <input className="cx-in" value={o} maxLength={100} placeholder={s.t('poll_opt_n').replace('{n}', `${i + 1}`)} onChange={(e) => upd(i, e.target.value)} />
        {v.opts.length > 2 ? <button className="tap cx-x" aria-label="Hapus pilihan" onClick={() => { const opts = v.opts.filter((_, k) => k !== i); set({ ...v, opts, max: Math.min(v.max, opts.length) }); }}><Icon n="remove_rounded" size={18} /></button> : <span style={{ width: 32 }} />}
      </div>)}
    </div>
    <button className="tap cx-add" onClick={() => set({ ...v, opts: [...v.opts, ''] })}><Icon n="add_rounded" size={18} />{s.t('poll_add_opt')}</button>
    <div className="cx-row"><div style={{ flex: 1, fontWeight: 700 }}>{s.t('poll_max_l')}</div>
      <div className="cx-step"><button className="tap" aria-label="-" disabled={v.max <= 1} onClick={() => set({ ...v, max: Math.max(1, v.max - 1) })}><Icon n="remove_rounded" size={18} /></button><b>{Math.min(v.max, maxCap)}</b><button className="tap" aria-label="+" disabled={v.max >= maxCap} onClick={() => set({ ...v, max: Math.min(maxCap, v.max + 1) })}><Icon n="add_rounded" size={18} /></button></div></div>
    <div className="cx-row"><div style={{ flex: 1 }}><div style={{ fontWeight: 700 }}>{s.t('poll_show_l')}</div><div className="cx-sub">{s.t('poll_show_d')}</div></div><Toggle v={v.showFirst} on={(x) => set({ ...v, showFirst: x })} /></div>
    {filled < 2 ? <div className="cx-sub" style={{ color: 'var(--heart)' }}>{s.t('poll_need')}</div> : null}
  </div>;
}

/* ───────── pemilih masa aktif ───────── */
export type ExpDraft = { custom: boolean; n: string; unit: 'min' | 'hour' | 'day' };
export const newExp = (): ExpDraft => ({ custom: false, n: '1', unit: 'day' });
export const UNIT_MS = { min: 60000, hour: 3600000, day: 86400000 } as const;
export function expMs(e: ExpDraft): number | null { if (!e.custom) return null; const n = Number(e.n.replace(',', '.')); return Number.isFinite(n) && n > 0 ? Math.round(n * UNIT_MS[e.unit]) : 0; }
const PRESETS: [string, ExpDraft['unit'], string][] = [['1', 'hour', '1 jam'], ['6', 'hour', '6 jam'], ['1', 'day', '1 hari'], ['3', 'day', '3 hari'], ['7', 'day', '7 hari']];
export function ExpiryEditor({ v, set, onClose }: { v: ExpDraft; set: (e: ExpDraft) => void; onClose: () => void }) {
  const s = useStore();
  const ms = expMs(v);
  return <div className="cx">
    <div className="cx-h"><Icon n="schedule_rounded" size={19} /><b>{s.t('exp')}</b><span style={{ flex: 1 }} />
      <button className="tap cx-x" aria-label="Tutup" onClick={onClose}><Icon n="close_rounded" size={18} /></button></div>
    <div className="seg" role="tablist" style={{ marginBottom: 10 }}>{([[false, s.t('exp_normal')], [true, s.t('exp_custom')]] as const).map(([k, l]) => <b key={String(k)} role="tab" aria-selected={v.custom === k} className={v.custom === k ? 'on' : ''} onClick={() => set({ ...v, custom: k })}>{l}</b>)}</div>
    <div className="cx-sub" style={{ marginBottom: v.custom ? 12 : 0 }}>{v.custom ? s.t('exp_custom_d') : s.t('exp_normal_d')}</div>
    {v.custom ? <>
      <div className="cx-chips">{PRESETS.map(([n, u, l]) => <button key={l} className={`tap cx-chip${v.n === n && v.unit === u ? ' on' : ''}`} onClick={() => set({ ...v, n, unit: u })}>{l}</button>)}</div>
      <div className="cx-row" style={{ gap: 8 }}>
        <input className="cx-in num" inputMode="decimal" value={v.n} onChange={(e) => set({ ...v, n: e.target.value.replace(/[^0-9.,]/g, '').slice(0, 7) })} aria-label="Lama" />
        <div className="seg" role="tablist" style={{ flex: 1 }}>{(['min', 'hour', 'day'] as const).map((u) => <b key={u} role="tab" aria-selected={v.unit === u} className={v.unit === u ? 'on' : ''} onClick={() => set({ ...v, unit: u })}>{s.t(`exp_${u}`)}</b>)}</div></div>
      <div className="cx-sub" style={{ marginTop: 8, color: ms ? 'var(--sub)' : 'var(--heart)' }}>{ms ? s.t('exp_set').replace('{t}', leftText(ms)) : s.t('exp_bad')}</div>
    </> : null}
  </div>;
}

/* ───────── bilah & daftar post yang disematkan (Hups) ───────── */
export function PinPill({ n, onOpen }: { n: number; onOpen: () => void }) {
  const s = useStore();
  if (!n) return null;
  return <div className="pinpill-w"><button className="tap pinpill" onClick={onOpen}><Icon n="push_pin_rounded" size={16} />{s.t('pin_n').replace('{n}', `${n}`)}<Icon n="expand_more_rounded" size={18} /></button></div>;
}
