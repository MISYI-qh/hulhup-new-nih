'use client';
import { useState } from 'react';
import { Icon } from './Icon';
import { PBtn, sheet, toast } from './ui';
import { Api, store } from '@/lib/store';

export const audiences = ['public', 'followers', 'following', 'both', 'friend', 'best', 'partner', 'family', 'relations'];
export const profileAud = [...audiences, 'me'], uploadAud = [...audiences, 'accounts'], filterAud = [...audiences, 'me'];
export const relKinds = ['friend', 'best', 'partner', 'family'];
const lblRe = /^L(\d+)$/;
export const withLabels = (base: string[]) => {
  const ids = Object.keys(store.me?.labels ?? {}).map((k) => `L${k}`); if (!ids.length) return base;
  const i = base.indexOf('relations'); return [...base.slice(0, i + 1), ...ids, ...base.slice(i + 1)];
};
const ICON: Record<string, string> = { public: 'public_rounded', followers: 'group_outlined', following: 'person_add_alt_1_outlined', both: 'people_alt_outlined', friend: 'sentiment_satisfied_alt_rounded', best: 'star_outline_rounded', partner: 'favorite_border_rounded', family: 'home_outlined', relations: 'diversity_3_rounded', accounts: 'person_search_outlined', me: 'lock_outline_rounded', custom: 'label_outline_rounded', newlabel: 'add_circle_outline_rounded', nolabel: 'label_off_outlined' };
export const audIcon = (v: string, filter = false) => lblRe.test(v) ? 'label_outline_rounded' : filter && v === 'me' ? 'move_to_inbox_outlined' : (ICON[v] ?? 'public_rounded');
export const audSplit = (v: string) => v.split(',').filter(Boolean);
export function audLabel(v: string, filter = false) { const m = lblRe.exec(v); if (m) return store.labelName(Number(m[1])); return store.t(filter && v === 'me' ? 'f_me' : `a_${v}`); }
export function audText(v: string, filter = false) {
  const l = audSplit(v); if (!l.length) return audLabel('public', filter);
  if (l.length <= 2) return l.map((e) => audLabel(e, filter)).join(' · ');
  return `${audLabel(l[0], filter)} +${l.length - 1}`;
}
export function AudChip({ rand, to = [] }: { rand: string; to?: string[] }) {
  const l = audSplit(rand).length ? audSplit(rand) : ['public'];
  const names = l.map((e) => e === 'accounts' && to.length ? `${audLabel(e)}: ${to.map((x) => '@' + x).join(', ')}` : audLabel(e)).join(' · ');
  return <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--sub)', fontSize: 12.5, fontWeight: 600 }}><Icon n={audIcon(l[0])} size={14} />{names}</div>;
}

/** Isian nama hubungan sendiri (maks 100 karakter). */
export const askLabel = (initial = '') => sheet<string>((close) => <LabelForm initial={initial} close={close} />);
function LabelForm({ initial, close }: { initial: string; close: (v?: string) => void }) {
  const s = store; const [c, setC] = useState(initial);
  return <div className="stack" style={{ gap: 8 }}>
    <div className="sh-t" style={{ fontSize: 18 }}>{s.t('lbl_title')}</div><div className="sh-n">{s.t('lbl_note')}</div>
    <div className="field"><div className="box"><input autoFocus maxLength={100} placeholder={s.t('lbl_ph')} value={c} onChange={(e) => setC(e.target.value)} /></div></div>
    <PBtn icon="check_rounded" onClick={c.trim() ? () => close(c.trim()) : undefined}>{s.t('lbl_save')}</PBtn></div>;
}

/** Pilih lebih dari satu audiens (centang). Untuk pengaturan/post, "Publik" dan "Hanya saya" berdiri sendiri; untuk filter boleh digabung. */
export const multiSheet = (title: string, opts: string[], value: string, filter = false) => sheet<string>((close) => <Multi title={title} opts={opts} value={value} filter={filter} close={close} />);
function Multi({ title, opts, value, filter, close }: { title: string; opts: string[]; value: string; filter: boolean; close: (v?: string) => void }) {
  const [sel, setSel] = useState(() => { const x = audSplit(value).filter((e) => opts.includes(e)); return x.length ? x : [opts[0]]; });
  const toggle = (v: string) => {
    if (sel.includes(v)) { if (sel.length > 1) setSel(sel.filter((e) => e !== v)); }
    else if (!filter && (v === 'public' || v === 'me')) setSel([v]);
    else setSel([...sel.filter((e) => filter || (e !== 'public' && e !== 'me')), v]);
  };
  return <div>
    <div className="sh-t">{title}</div><div className="sh-n">{store.t('multi_note')}</div>
    <div style={{ maxHeight: '50dvh', overflow: 'auto' }}>{opts.map((v) => <button key={v} className={`tap opt${sel.includes(v) ? ' on' : ''}`} onClick={() => toggle(v)}>
      <Icon n={audIcon(v, filter)} size={22} /><span style={{ flex: 1 }}>{audLabel(v, filter)}</span><Icon n={sel.includes(v) ? 'check_circle_rounded' : 'radio_button_unchecked_rounded'} size={22} color={sel.includes(v) ? 'var(--ink)' : 'var(--sub)'} /></button>)}</div>
    <div style={{ marginTop: 8 }}><PBtn icon="check_rounded" onClick={() => close(sel.join(','))}>{store.t('multi_done')}</PBtn></div></div>;
}
export const chooseSheet = (title: string, opts: string[], value: string | null, filter = false) => sheet<string>((close) => <div>
  <div className="sh-t" style={{ marginBottom: 12 }}>{title}</div>
  <div style={{ maxHeight: '60dvh', overflow: 'auto' }}>{opts.map((v) => <button key={v} className={`tap opt${v === value ? ' on' : ''}`} onClick={() => close(v)}><Icon n={audIcon(v, filter)} size={22} /><span style={{ flex: 1 }}>{audLabel(v, filter)}</span>{v === value ? <Icon n="check_rounded" /> : null}</button>)}</div></div>);

/** Pilihan audiens buatan sendiri. */
export function Pick({ label, value, on, opts = audiences }: { label: string; value: string; on: (v: string) => void; opts?: string[] }) {
  return <div><div style={{ margin: '0 0 6px 6px', fontSize: 13, fontWeight: 600, color: 'var(--sub)' }}>{label}</div>
    <button className="tap" style={{ height: 56, width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '0 18px', background: 'var(--soft)', borderRadius: 28, textAlign: 'left' }}
      onClick={async () => { const r = await multiSheet(label, opts, value); if (r != null) on(r); }}>
      <Icon n={audIcon(audSplit(value)[0] ?? 'public')} size={22} /><span style={{ flex: 1, fontSize: 16, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{audText(value)}</span><Icon n="unfold_more_rounded" color="var(--sub)" /></button></div>;
}

/** Lembar pelaporan: pilih alasan, laporan dikirim ke server. */
export const reportSheet = (o: { audio?: number; user?: string; comment?: number }) => sheet((close) => {
  const s = store;
  const send = async (r: string) => { close(); try { await Api.req('POST', '/reports', { ...(o.comment != null ? { comment: o.comment } : o.audio != null ? { audio: o.audio } : {}), ...(o.user ? { user: o.user } : {}), reason: r }); toast(s.t('report_done')); } catch (e) { toast(s.err(e), { bad: true }); } };
  return <div><div style={{ fontWeight: 800, fontSize: 20 }}>{s.t('report_title')}</div><div style={{ height: 8 }} />
    {['abuse', 'sexual', 'violence', 'spam', 'impersonate', 'other'].map((r) => <button key={r} className="tap" style={{ display: 'flex', width: '100%', alignItems: 'center', padding: '14px 0', textAlign: 'left' }} onClick={() => send(r)}><span style={{ flex: 1, fontSize: 16, fontWeight: 600 }}>{s.t(`r_${r}`)}</span><Icon n="chevron_right_rounded" color="var(--sub)" /></button>)}</div>;
});
