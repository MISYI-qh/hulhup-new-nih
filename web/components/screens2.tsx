'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Icon, HIcon } from './Icon';
import { NeedLogin, Screen, useNav } from './shell';
import { Empty, Field, IconBtn, Loader, PBtn, Seg, Toggle, confirmDlg, sheet, toast } from './ui';
import { AiTag, Avatar, MentionText, badgeColor } from './rich';
import { Pick, askLabel, audIcon, chooseSheet, profileAud, relKinds, reportSheet, withLabels } from './aud';
import { PostCard } from './post';
import LogoRefresh from './LogoRefresh';
import { BirthField, StreakChip, UserTile, newRecovery } from './screens1';
import { A, Api, U, store, useStore } from '@/lib/store';

const useTick = () => { const [, set] = useState(0); return () => set((x) => x + 1); };

export function ImageViewer({ url, name, close }: { url: string; name: string; close: () => void }) {
  const [z, setZ] = useState(1);
  return <div style={{ position: 'fixed', inset: 0, zIndex: 400, background: '#000', display: 'grid', placeItems: 'center' }} onClick={close}>
    <img src={url.startsWith('/') ? (process.env.NEXT_PUBLIC_API_URL || 'https://hulhup-api.vercel.app') + url : url} alt={name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', transform: `scale(${z})`, transition: 'transform .2s' }} onDoubleClick={(e) => { e.stopPropagation(); setZ(z > 1 ? 1 : 2.4); }} />
    <div style={{ position: 'absolute', top: 8, right: 8 }}><IconBtn n="close_rounded" color="#fff" onClick={close} label="Tutup" /></div>
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 20, textAlign: 'center', color: '#fff', fontWeight: 700, fontSize: 16 }}>{name}</div></div>;
}

// ---------- hubungan ----------
const ORDER = ['best', 'family', 'partner', 'friend', 'custom'];
/** Urut menurut jenis hubungan (sahabat, keluarga, pasangan, teman, lainnya), lalu nama hubungan buatanmu, lalu nama orangnya. */
export const sortedRel = (l: any[]) => {
  const k = (r: any) => { const i = ORDER.indexOf(`${r.type}`); return i < 0 ? ORDER.length : i; };
  return [...l].sort((a, b) => { const x = k(a) - k(b); if (x) return x; const y = `${a.label ?? ''}`.toLowerCase().localeCompare(`${b.label ?? ''}`.toLowerCase()); return y || `${a.name}`.toLowerCase().localeCompare(`${b.name}`.toLowerCase()); });
};

function LabelsSheet({ close }: { close: () => void }) {
  const s = useStore(); const l = Object.entries(s.me?.labels ?? {});
  return <div><div className="sh-t">{s.t('lbl_manage')}</div><div style={{ color: 'var(--sub)', fontSize: 13, margin: '4px 0 12px' }}>{s.t('lbl_note')}</div>
    {!l.length ? <div style={{ color: 'var(--sub)', padding: '16px 0' }}>{s.t('lbl_none')}</div> : null}
    <div style={{ maxHeight: '45dvh'}}>{l.map(([id, name]) => <div key={id} className="row2" style={{ background: 'var(--soft)', borderRadius: 24, padding: '4px 6px 4px 18px', marginBottom: 8 }}><Icon n="label_outline_rounded" size={22} /><div style={{ flex: 1, fontWeight: 600, fontSize: 16 }}>{name}</div>
      <IconBtn n="delete_outline_rounded" onClick={async () => { if (!(await confirmDlg(s.t('delete'), s.t('lbl_del_q').replace('{n}', name), s.t('delete'), true))) return; try { await Api.req('DELETE', `/me/labels/${id}`); await s.refresh(); } catch (x) { toast(s.err(x), { bad: true }); } }} /></div>)}</div>
    <div style={{ height: 8 }} /><PBtn ghost icon="add_rounded" onClick={async () => { const x = await askLabel(); if (x == null) return; try { await Api.req('POST', '/me/labels', { name: x }); await s.refresh(); } catch (e) { toast(s.err(e), { bad: true }); } }}>{s.t('a_newlabel')}</PBtn></div>;
}

export function RelationsScreen({ u }: { u: string }) {
  const s = useStore(); const [rels, setRels] = useState<any[]>([]), [rin, setRin] = useState<any[]>([]), [rout, setRout] = useState<any[]>([]);
  const [loading, setLoading] = useState(true), [locked, setLocked] = useState(false), [err, setErr] = useState<string | null>(null);
  const mine = u === s.me?.username;
  const load = async () => {
    try {
      if (mine) { const r = await Api.req('GET', '/me/relations'); setRels(sortedRel(r.active)); setRin(sortedRel(r.incoming)); setRout(sortedRel(r.outgoing)); }
      else { const r = await Api.req('GET', `/users/${u}/relations`); setRels(sortedRel(r.items)); setLocked(r.locked === true); }
      setErr(null);
    } catch (e) { setErr(store.err(e)); }
    setLoading(false);
  };
  useEffect(() => { if (s.ready) load(); }, [u, s.ready, s.me?.username]);
  const req = async (f: () => Promise<any>, ok: string) => { try { await f(); toast(ok); await load(); } catch (e) { toast(store.err(e), { bad: true }); } };
  const end = async (un: string, name: string) => { if (!(await confirmDlg(s.t('rel_end'), s.t('rel_end_q').replace('{n}', name), s.t('rel_end'), true))) return; req(() => Api.req('DELETE', `/relations/${un}`), s.t('rel_ended')); };
  const rename = async (r: any) => {
    const t = await chooseSheet(s.t('lbl_title'), [...Object.keys(s.me?.labels ?? {}).map((k) => `L${k}`), 'newlabel', ...(r.label ? ['nolabel'] : [])], r.label_id != null ? `L${r.label_id}` : null);
    if (t == null) return;
    let label = '';
    if (t === 'newlabel') { const x = await askLabel(`${r.label ?? ''}`); if (x == null) return; label = x; } else if (t !== 'nolabel') label = s.labelName(Number(t.slice(1)));
    req(async () => { await Api.req('POST', `/relations/${r.username}/label`, { label }); await s.refresh(); }, s.t('saved'));
  };
  const chip = (t: string, label?: string | null) => <span className="row2" style={{ maxWidth: 'min(150px, 30vw)', minWidth: 0, padding: '5px 10px', background: 'color-mix(in srgb, var(--ink) 10%, transparent)', borderRadius: 14, gap: 5 }}><Icon n={audIcon(t)} size={13} /><span style={{ fontSize: 12.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label ?? s.t(`a_${t}`)}</span></span>;
  const row = (r: any, act: React.ReactNode = null, edit = false) => <UserTile key={`${r.username}`} u={r} trailing={<span className="row2" style={{ gap: 2, minWidth: 0, flexShrink: 1 }} onClick={(e) => e.preventDefault()}>
    <span onClick={edit ? (e) => { e.stopPropagation(); rename(r); } : undefined} style={{ cursor: edit ? 'pointer' : undefined }}>{chip(`${r.type}`, r.label)}</span>{act}</span>} />;
  const head = (t: string) => <div style={{ margin: '6px 0 10px 4px', color: 'var(--sub)', fontWeight: 700, fontSize: 13 }}>{t}</div>;
  const empty = !rels.length && !rin.length && !rout.length;
  return <Screen title={s.t('rel_title')}>{loading ? <Loader k="rel" /> : err ? <Empty icon="cloud_off_rounded" text={err} /> : <LogoRefresh onRefresh={load}><div className="pad" style={{ paddingBottom: 40}}>
    {locked ? <Empty icon="lock_outline_rounded" text={s.t('rel_locked')} /> : empty ? <Empty icon="diversity_3_rounded" text={s.t('rel_none')} /> : null}
    {rin.length ? <>{head(s.t('rel_in'))}{rin.map((r) => row(r, <><IconBtn n="check_rounded" onClick={() => req(() => Api.req('POST', `/relations/${r.username}/accept`), s.t('rel_made'))} /><IconBtn n="close_rounded" onClick={() => req(() => Api.req('POST', `/relations/${r.username}/decline`), s.t('rel_ended'))} /></>))}</> : null}
    {rout.length ? <>{head(s.t('rel_out'))}{rout.map((r) => row(r, <IconBtn n="close_rounded" onClick={() => req(() => Api.req('DELETE', `/relations/${r.username}`), s.t('rel_ended'))} />))}</> : null}
    {rels.length ? <>{rin.length || rout.length ? head(s.t('rel_title')) : null}{rels.map((r) => row(r, mine ? <IconBtn n="link_off_rounded" onClick={() => end(r.username, r.name)} /> : null, mine))}</> : null}
    {mine ? <><div style={{ height: 16 }} /><PBtn ghost icon="label_outline_rounded" onClick={async () => { await sheet<void>((close) => <LabelsSheet close={close as any} />); load(); }}>{s.t('lbl_manage')}</PBtn></> : null}</div></LogoRefresh>}</Screen>;
}

// ---------- profil ----------
export function ProfileScreen({ username, tab0 = 0 }: { username: string | null; tab0?: number }) {
  const s = useStore(); const n = useNav(); const tick = useTick();
  const [user, setUser] = useState<U | null>(null); const [list, setList] = useState<A[]>([]), [liked, setLiked] = useState<A[]>([]), [saved, setSaved] = useState<A[]>([]);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [locked, setLocked] = useState(false), [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState(tab0 === 1 ? 0 : tab0); const [rel, setRel] = useState<any>({ status: 'none', type: '' });
  const [relCount, setRelCount] = useState(0), [relIn, setRelIn] = useState(0); const [view, setView] = useState(false); const scope = useRef({});
  const u = username ?? s.me?.username ?? null; const mine = !!u && u === s.me?.username;
  useEffect(() => () => store.leave(scope.current), []);
  const load = async () => {
    if (!u) return;
    try {
      const j = await Api.req('GET', `/users/${u}`);
      setUser(new U(j.user)); setList((j.audios as any[]).map((e) => new A(e))); setLocked(j.locked === true); setRel({ status: 'none', type: '', ...(j.rel ?? {}) });
      if (mine) { const r = await Api.req('GET', '/me/relations'); setRelCount(r.active.length); setRelIn(r.incoming.length); setLiked(((await Api.req('GET', '/me/liked')).audios as any[]).map((e) => new A(e))); setSaved(((await Api.req('GET', '/me/saved')).audios as any[]).map((e) => new A(e))); }
      else { setRelCount((await Api.req('GET', `/users/${u}/relations`)).items.length); setRelIn(0); }
      setErr(null);
    } catch (e) { setErr(store.err(e)); }
    setLoading(false);
  };
  useEffect(() => { if (s.ready) { setLoading(true); load(); } }, [u, s.ready, s.me?.username]);
  if (!username && s.ready && !s.me) return <Screen><Empty icon="person_outline_rounded" text={`${s.t('guest')}\n${s.t('guest_note')}`} action={<button className="tap pbtn" style={{ width: 200 }} onClick={() => n.push('/login')}>{s.t('login')}</button>} /></Screen>;

  const follow = async () => { setBusy(true); try { const j = await Api.req('POST', `/users/${u}/follow`); user!.isFollowing = j.following; user!.followers = j.followers; } catch (e) { toast(store.err(e), { bad: true }); } setBusy(false); };
  const relReq = async (f: () => Promise<any>, ok: string) => { try { await f(); toast(ok); await load(); } catch (e) { toast(store.err(e), { bad: true }); } };
  const relAdd = async () => {
    const t = await chooseSheet(s.t('rel_pick'), [...relKinds, ...Object.keys(s.me?.labels ?? {}).map((k) => `L${k}`), 'newlabel'], null);
    if (t == null) return;
    let type = t, label: string | undefined; const m = /^L(\d+)$/.exec(t);
    if (t === 'newlabel') { const x = await askLabel(); if (x == null) return; label = x; type = 'custom'; } else if (m) { label = s.labelName(Number(m[1])); type = 'custom'; }
    relReq(async () => { await Api.req('POST', '/relations', { to: u, type, ...(label != null ? { label } : {}) }); await s.refresh(); }, s.t('rel_sent'));
  };
  const relEnd = async () => { if (!(await confirmDlg(s.t('rel_end'), s.t('rel_end_q').replace('{n}', user!.name), s.t('rel_end'), true))) return; relReq(() => Api.req('DELETE', `/relations/${u}`), s.t('rel_ended')); };
  const relBtns = () => {
    const st = `${rel.status}`, ty = `${rel.type}`;
    if (st === 'none') return <PBtn ghost icon="favorite_border_rounded" onClick={relAdd}>{s.t('rel_add')}</PBtn>;
    if (st === 'out') return <PBtn ghost icon="hourglass_empty_rounded" onClick={() => relReq(() => Api.req('DELETE', `/relations/${u}`), s.t('rel_ended'))}>{s.t('rel_wait_cancel')}</PBtn>;
    if (st === 'in') return <div className="row2" style={{ gap: 10 }}><div style={{ flex: 1 }}><PBtn icon="check_rounded" onClick={() => relReq(() => Api.req('POST', `/relations/${u}/accept`), s.t('rel_made'))}>{s.t('rel_accept')}</PBtn></div><div style={{ flex: 1 }}><PBtn ghost onClick={() => relReq(() => Api.req('POST', `/relations/${u}/decline`), s.t('rel_ended'))}>{s.t('rel_decline')}</PBtn></div></div>;
    return <PBtn ghost icon={audIcon(ty)} onClick={relEnd}>{`${rel.label ?? s.t(`a_${ty}`)} · ${s.t('rel_end')}`}</PBtn>;
  };
  const switchTab = (v: number) => { setTab(v); history.replaceState(null, '', v === 2 ? '/me/sorot' : v === 3 ? '/me/saved' : `/@${u}`); };
  const stat = (c: number, label: string, href: string, dot = false) => <Link href={href} className="stat tap"><b>{s.fmt(c)}</b>{label}{dot ? <i style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--heart)', marginLeft: 6, alignSelf: 'center' }} /> : null}</Link>;

  const shown = tab === 2 ? liked : tab === 3 ? saved : list;
  const gone = (id: number) => { setList((c) => c.filter((e) => e.id !== id)); setLiked((c) => c.filter((e) => e.id !== id)); setSaved((c) => c.filter((e) => e.id !== id)); };
  return <Screen back actions={mine ? <><IconBtn n="notifications_none_rounded" dot={s.unread > 0} onClick={() => n.push('/notifications')} label={s.t('notif')} /><IconBtn n="edit_outlined" label={s.t('edit_profile')} onClick={() => { if (s.needNet()) n.push('/settings/profile'); }} /></> : null}>
    {loading || !s.ready ? <Loader k="profile" /> : err || !user ? <Empty icon="cloud_off_rounded" text={err ?? ''} action={<button className="tap pbtn" style={{ width: 160 }} onClick={() => { setLoading(true); load(); }}>{s.t('retry')}</button>} /> : <LogoRefresh onRefresh={load}><div style={{ paddingBottom: 40 }}>
      <div style={{ padding: '10px 24px 0' }}><button className="tap" disabled={!user.avatar} onClick={() => setView(true)} aria-label={user.name} style={{ display: 'block', borderRadius: '50%' }}><Avatar url={user.avatar} name={user.name} size={96} /></button></div>
      <div style={{ padding: '16px 24px 0', textAlign: 'left' }}>
        <div className="row2" style={{ gap: 6 }}><h1 style={{ margin: 0, fontWeight: 800, fontSize: 24, letterSpacing: -.5 }}>{user.name}</h1>{user.verified ? <Icon n="verified_rounded" size={22} color={badgeColor(user.username)} /> : null}</div>
        <div style={{ color: 'var(--sub)', fontSize: 15, marginTop: 2 }}>{user.username}</div>
        {user.avatarAi ? <AiTag label={s.t(user.avatarAiKind === 'edited' ? 'ai_photo_edit' : 'ai_photo')} /> : null}
        {user.bio ? <div style={{ marginTop: 12 }}><MentionText text={user.bio} style={{ fontSize: 15, lineHeight: 1.45 }} /></div> : null}
        <div className="row2" style={{ gap: 22, flexWrap: 'wrap', marginTop: 16 }}>{stat(user.followers, s.t('followers'), `/@${u}/followers`)}{stat(user.following, s.t('following'), `/@${u}/following`)}{stat(relCount, s.t('rel_title'), `/@${u}/relations`, mine && relIn > 0)}</div>
        {mine && (user.streak > 0 || user.days > 0) ? <div style={{ marginTop: 14 }}><StreakChip streak={user.streak} days={user.days} open /></div> : !mine && user.streak > 0 ? <div style={{ marginTop: 14 }}><StreakChip streak={user.streak} days={0} /></div> : null}
        <div style={{ height: 18 }} />
        {!mine && s.me ? <div className="stack" style={{ gap: 10 }}>
          <PBtn loading={busy} ghost={user.isFollowing} icon={user.isFollowing ? 'check_rounded' : 'person_add_alt_1_rounded'} onClick={async () => { await follow(); tick(); }}>{user.isFollowing ? s.t('unfollow') : s.t('follow')}</PBtn>
          {relBtns()}
          <button className="tap row2" style={{ justifyContent: 'center', padding: 10, color: 'var(--sub)', fontSize: 13, fontWeight: 600, gap: 6 }} onClick={() => reportSheet({ user: user.username })}><Icon n="flag_outlined" size={16} />{s.t('report')}</button></div> : null}
        {!mine && !s.me ? <PBtn icon="login_rounded" onClick={() => n.push('/login')}>{s.t('login')}</PBtn> : null}
      </div>
      <div style={{ height: 22 }} /><div style={{ padding: '0 20px' }}><Seg<number> items={[[0, s.t('posts_tab')], ...(mine ? [[2, s.t('sorot_tab')], [3, s.t('saved_tab')]] as [number, string][] : [])]} value={tab} on={switchTab} /></div><div style={{ height: 14 }} />
      {locked && !mine ? <Empty icon="lock_outline_rounded" text={s.t('locked')} /> : !shown.length ? <Empty icon="graphic_eq_rounded" text={tab === 2 ? s.t('empty_liked') : tab === 3 ? s.t('empty_saved') : s.t('no_posts')} />
        : <div style={{ padding: '0 20px' }}>{shown.map((a) => <PostCard key={`${tab}_${a.id}`} a={a} scope={scope.current} onDeleted={() => gone(a.id)} />)}</div>}
      {view && user.avatar ? <ImageViewer url={user.avatar} name={user.name} close={() => setView(false)} /> : null}
    </div></LogoRefresh>}</Screen>;
}

// ---------- edit profil ----------
const u32 = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const str = (b: Uint8Array, a: number, z: number) => String.fromCharCode(...b.subarray(a, z));
const cat = (...p: Uint8Array[]) => { const o = new Uint8Array(p.reduce((a, x) => a + x.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length; } return o; };
/** Salinan berkas tanpa piksel: hanya segmen/chunk keterangan. */
function sidecar(b: Uint8Array): Uint8Array {
  const cap = 900000; const out: Uint8Array[] = []; let kept = 0;
  try {
    if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
      out.push(new Uint8Array([0xff, 0xd8])); let o = 2;
      while (o + 4 <= b.length && b[o] === 0xff) {
        const m = b[o + 1]; if (m === 0xda || m === 0xd9) break;
        if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) { o += 2; continue; }
        const len = (b[o + 2] << 8) | b[o + 3]; if (len < 2 || o + 2 + len > b.length) break;
        if ((m === 0xe1 || m === 0xeb || m === 0xed || m === 0xfe) && kept + len < cap) { out.push(b.subarray(o, o + 2 + len)); kept += len; }
        o += 2 + len;
      }
      out.push(new Uint8Array([0xff, 0xd9]));
    } else if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50) {
      out.push(b.subarray(0, 8)); let o = 8; const want = ['IHDR', 'tEXt', 'zTXt', 'iTXt', 'eXIf', 'caBX'];
      while (o + 12 <= b.length) {
        const len = u32(b, o); if (o + 12 + len > b.length) break; const t = str(b, o + 4, o + 8);
        if (want.includes(t) && (t === 'IHDR' || kept + len < cap)) { out.push(b.subarray(o, o + 12 + len)); kept += len; }
        if (t === 'IEND') break; o += 12 + len;
      }
      out.push(new Uint8Array([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]));
    } else if (b.length > 12 && str(b, 0, 4) === 'RIFF' && str(b, 8, 12) === 'WEBP') {
      const body: Uint8Array[] = [new Uint8Array([0x57, 0x45, 0x42, 0x50])]; let o = 12;
      while (o + 8 <= b.length) {
        const id = str(b, o, o + 4); const len = (b[o + 4] | (b[o + 5] << 8) | (b[o + 6] << 16) | (b[o + 7] << 24)) >>> 0; if (o + 8 + len > b.length) break;
        if ((id === 'EXIF' || id === 'XMP ' || id === 'C2PA') && kept + len < cap) { body.push(b.subarray(o, o + 8 + len + ((len & 1) === 1 && o + 9 + len <= b.length ? 1 : 0))); kept += len; }
        o += 8 + len + (len & 1);
      }
      const bd = cat(...body); const h = new Uint8Array(8); h.set([0x52, 0x49, 0x46, 0x46]); new DataView(h.buffer).setUint32(4, bd.length, true); out.push(h, bd);
    }
  } catch {}
  return cat(...out);
}
/** Paket untuk server: 'DKS1' + jenis(0=berkas asli, 1=sidecar) + panjang(4) + bahan Deks + foto yang disimpan. */
export function packAvatar(orig: Uint8Array, stored: Uint8Array): Uint8Array {
  const whole = orig.length <= 3000000; const meta = whole ? orig : sidecar(orig); const h = new Uint8Array(9);
  h.set([0x44, 0x4b, 0x53, 0x31, whole ? 0 : 1]); new DataView(h.buffer).setUint32(5, meta.length, false);
  return cat(h, meta, stored);
}
/** Perkecil foto profil ke sisi terpanjang 720 px, simpan sebagai JPEG (metadata/GPS tidak ikut). */
async function shrinkAvatar(file: Blob, maxSide = 720): Promise<Uint8Array> {
  const bmp = await createImageBitmap(file); const k = maxSide / Math.max(bmp.width, bmp.height);
  const w = k < 1 ? Math.max(1, Math.round(bmp.width * k)) : bmp.width, h = k < 1 ? Math.max(1, Math.round(bmp.height * k)) : bmp.height;
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d')!; x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(bmp, 0, 0, w, h); bmp.close?.();
  const blob: Blob = await new Promise((r, j) => c.toBlob((b) => (b ? r(b) : j(new Error('img'))), 'image/jpeg', .85));
  return new Uint8Array(await blob.arrayBuffer());
}
const pickFile = (accept: string) => new Promise<File | null>((res) => { const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.onchange = () => res(i.files?.[0] ?? null); i.oncancel = () => res(null); i.click(); });

export function EditProfileScreen() {
  const s = useStore(); const n = useNav(); const me = s.me;
  const [name, setName] = useState(me?.name ?? ''), [user, setUser] = useState(me?.username ?? ''), [bio, setBio] = useState(me?.bio ?? ''), [age, setAge] = useState(me?.birth ?? '');
  const [busy, setBusy] = useState(false), [up, setUp] = useState(false), [view, setView] = useState(false);
  useEffect(() => { if (me) { setName(me.name); setUser(me.username); setBio(me.bio); setAge(me.birth); } }, [s.ready]); // eslint-disable-line
  if (!me) return <Screen title={s.t('edit_profile')}>{s.ready ? <NeedLogin /> : <Loader k="form" />}</Screen>;
  const change = async () => {
    const f = await pickFile('image/*'); if (!f) return; setUp(true);
    try { const orig = new Uint8Array(await f.arrayBuffer()); const small = await shrinkAvatar(f); await Api.send('/me/avatar', packAvatar(orig, small).buffer as ArrayBuffer, 'image/jpeg'); await s.refresh(); } catch (e) { toast(s.err(e), { bad: true }); }
    setUp(false);
  };
  const menu = async () => {
    const r = await sheet<string>((close) => <div>
      {me.avatar ? <button className="tap opt" onClick={() => close('view')}><Icon n="visibility_outlined" size={22} />{s.t('view_photo')}</button> : null}
      <button className="tap opt" onClick={() => close('change')}><Icon n="photo_library_outlined" size={22} />{s.t('change_photo')}</button>
      {me.avatar ? <button className="tap opt" onClick={() => close('remove')}><Icon n="delete_outline_rounded" size={22} />{s.t('remove_photo')}</button> : null}</div>);
    if (r === 'view') setView(true); else if (r === 'change') change();
    else if (r === 'remove') {
      if (!(await confirmDlg(s.t('remove_photo'), s.t('remove_photo_q'), s.t('delete'), true))) return; setUp(true);
      try { await Api.req('DELETE', '/me/avatar'); await s.refresh(); toast(s.t('photo_removed')); } catch (e) { toast(s.err(e), { bad: true }); } setUp(false);
    }
  };
  const save = async () => {
    setBusy(true);
    try { const j = await Api.req('PATCH', '/me', { name, username: user, bio, birth: age }); await s.refresh(); toast(s.t('saved')); history.length > 1 ? n.back() : n.replace(`/@${j.user.username}`); }
    catch (e) { toast(s.err(e), { bad: true }); setBusy(false); }
  };
  return <Screen title={s.t('edit_profile')}><div style={{ paddingBottom: 40 }}>
    <div style={{ textAlign: 'center', paddingTop: 8 }}><button className="tap" onClick={menu} aria-label={s.t('change_photo')} style={{ padding: 0, borderRadius: '50%', position: 'relative' }}>
      <span style={{ display: 'block', position: 'relative', width: 104, height: 104, borderRadius: '50%', overflow: 'hidden' }}><Avatar url={me.avatar} name={me.name} size={104} />
        <span style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.26)', display: 'grid', placeItems: 'center', color: 'var(--cream)' }}>{up ? <span className="spin" /> : <Icon n="photo_camera_outlined" size={28} />}</span></span></button>
      {me.avatarAi ? <div><AiTag label={s.t(me.avatarAiKind === 'edited' ? 'ai_photo_edit' : 'ai_photo')} /></div> : null}</div>
    <div className="pad stack" style={{ gap: 16, padding: '28px 24px 0' }}>
      <Field label={s.t('name')} value={name} onChange={setName} max={40} /><Field label={s.t('username')} value={user} onChange={setUser} max={20} />
      <Field label={s.t('bio')} value={bio} onChange={setBio} max={300} lines={4} /><BirthField label={s.t('age')} value={age} onChange={setAge} />
      <div style={{ height: 12 }} /><PBtn loading={busy} onClick={save}>{s.t('save')}</PBtn></div>
    {view && me.avatar ? <ImageViewer url={me.avatar} name={me.name} close={() => setView(false)} /> : null}</div></Screen>;
}

// ---------- pengaturan ----------
export function SettingsScreen({ section }: { section?: string }) {
  const s = useStore(); const n = useNav();
  const label = (t: string) => <div className="lbl">{t}</div>;
  const row = (icon: string, t: string, f: () => void, c?: string) => <button key={t} className="tap srow" onClick={f} style={c ? { color: c } : undefined}><Icon n={icon} size={22} color={c} /><span style={{ flex: 1 }}>{t}</span><Icon n="chevron_right_rounded" color="var(--sub)" /></button>;
  const save = (f: () => Promise<void>) => async () => { try { await f(); toast(s.t('saved')); } catch (e) { toast(s.err(e), { bad: true }); } };
  return <Screen title={s.t('settings')}><div className="pad" style={{ paddingBottom: 40}}>
    {s.me && (!section || section === 'account') ? <>{label(s.t('account'))}
      {row('edit_outlined', s.t('edit_profile'), () => { if (s.needNet()) n.push('/settings/profile'); })}
      {row('key_rounded', s.t('change_pw'), () => n.push('/settings/password'))}
      <div style={{ height: 6 }} /><Pick label={s.t('pvis')} value={s.me.pvis} opts={withLabels(profileAud)} on={(v) => save(() => s.setPvis(v))()} />
      <div style={{ height: 14 }} /><Pick label={s.t('rel_vis')} value={s.me.rvis} opts={withLabels(profileAud)} on={(v) => save(() => s.setRvis(v))()} /></> : null}
    {!section || section === 'language' ? <>{label(s.t('language'))}<Seg<string> items={[['id', 'Indonesia'], ['en', 'English']]} value={s.lang} on={(v) => s.setLang(v as 'id' | 'en')} /></> : null}
    {!section || section === 'appearance' ? <>{label(s.t('appearance'))}<Seg<number> items={[[0, s.t('system')], [1, s.t('light')], [2, s.t('dark')]]} value={s.mode} on={(v) => s.setMode(v as 0 | 1 | 2)} /></> : null}
    {s.me && (!section || section === 'security') ? <>{label('')}
      {row('key_rounded', s.t('rec_new'), () => newRecovery())}
      {row('devices_other_rounded', s.t('logout_others'), () => n.push('/settings/sessions'))}
      {row('logout_rounded', s.t('logout'), async () => { if (!(await confirmDlg(s.t('logout_q'), s.t('logout_q_body'), s.t('logout'), true))) return; await s.logout(); n.replace('/'); }, 'var(--heart)')}
      {row('delete_outline_rounded', s.t('delete_acc'), async () => { if (!(await confirmDlg(s.t('delete_acc'), s.t('delete_acc_q'), s.t('delete'), true))) return; try { await s.deleteAccount(); n.replace('/'); } catch (e) { toast(s.err(e), { bad: true }); } }, 'var(--heart)')}</> : null}
  </div></Screen>;
}

export function PwScreen() {
  const s = useStore(); const n = useNav(); const [o, setO] = useState(''), [nw, setN] = useState(''), [busy, setBusy] = useState(false);
  if (!s.me) return <Screen title={s.t('change_pw')}>{s.ready ? <NeedLogin /> : <Loader k="form" />}</Screen>;
  return <Screen title={s.t('change_pw')}><div className="pad stack" style={{ gap: 14, paddingTop: 8, paddingBottom: 40 }}>
    <Field label={s.t('old_pw')} value={o} onChange={setO} secret auto="current-password" /><Field label={s.t('new_pw')} value={nw} onChange={setN} secret auto="new-password" /><div style={{ height: 6 }} />
    <PBtn loading={busy} onClick={async () => { setBusy(true); try { await Api.req('POST', '/me/password', { old: o, new: nw }); toast(s.t('saved')); n.back(); } catch (e) { toast(s.err(e), { bad: true }); setBusy(false); } }}>{s.t('save')}</PBtn></div></Screen>;
}

// ---------- sesi ----------
export function SessionsScreen() {
  const s = useStore(); const [items, setItems] = useState<any[] | null>(null); const [err, setErr] = useState<string | null>(null);
  const load = async () => { try { setItems((await Api.req('GET', '/me/sessions')).items); setErr(null); } catch (e) { setErr(store.err(e)); } };
  useEffect(() => { if (s.ready && s.me) load(); }, [s.ready, s.me?.username]);
  if (!s.me) return <Screen title={s.t('sess_t')}>{s.ready ? <NeedLogin /> : <Loader k="form" />}</Screen>;
  const out = async (it: any) => { if (!(await confirmDlg(s.t('sess_out'), s.t('sess_out_q'), s.t('sess_out'), true))) return; try { await Api.req('DELETE', `/me/sessions/${it.id}`); toast(s.t('logout_others_done')); load(); } catch (e) { toast(s.err(e), { bad: true }); } };
  const all = async () => { try { await Api.req('POST', '/me/logout-others'); toast(s.t('logout_others_done')); load(); } catch (e) { toast(s.err(e), { bad: true }); } };
  return <Screen title={s.t('sess_t')}>{!items && !err ? <Loader k="rows" /> : err ? <Empty icon="cloud_off_rounded" text={err} action={<button className="tap pbtn" style={{ width: 160 }} onClick={load}>{s.t('retry')}</button>} /> : <div className="pad" style={{ paddingTop: 8, paddingBottom: 40 }}>
    {items!.map((it) => <div key={it.id} className="row2" style={{ background: 'var(--soft)', borderRadius: 24, padding: '14px 12px 14px 16px', marginBottom: 10 }}>
      <Icon n={`${it.device}`.toLowerCase().includes('app') ? 'smartphone_rounded' : 'language_rounded'} size={26} />
      <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 700, fontSize: 15.5 }}>{it.device}</div><div style={{ marginTop: 3, fontSize: 13, fontWeight: 600, color: it.current === true ? 'var(--blue)' : 'var(--sub)' }}>{it.current === true ? s.t('sess_this') : `${s.t('sess_active')} ${s.when(Number(it.last_seen))}`}</div></div>
      {it.current !== true ? <button className="tap" style={{ padding: 10, color: 'var(--heart)', fontWeight: 800, fontSize: 14 }} onClick={() => out(it)}>{s.t('sess_out')}</button> : null}</div>)}
    {items!.length > 1 ? <div style={{ paddingTop: 8 }}><PBtn ghost icon="devices_other_rounded" onClick={all}>{s.t('sess_all')}</PBtn></div> : <div style={{ textAlign: 'center', paddingTop: 18, color: 'var(--sub)' }}>{s.t('sess_empty')}</div>}</div>}</Screen>;
}
