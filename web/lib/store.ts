'use client';
// Terjemahan setia core.dart (Api, Remote, A, U, Store) ke TypeScript untuk web. Mode lokal (Local) tidak dipakai di web.
import { useSyncExternalStore } from 'react';
import S from '@/content/i18n.json';
import { API } from './api';

const T = S as unknown as Record<string, [string, string]>;
export class ApiErr extends Error { constructor(public code: string) { super(code); } }

const ls = {
  get: (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} },
  del: (k: string) => { try { localStorage.removeItem(k); } catch {} },
  json: <X,>(k: string, d: X): X => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
};
export { ls };

// ---------- model ----------
export type Label = { id: number; name: string };
export class U {
  username: string; name: string; bio: string; birth: string; pvis: string; rvis: string;
  avatar: string | null; cover: string | null; age: number; audios: number; streak: number; days: number; taps: number; rels: number;
  followers: number; following: number; isFollowing: boolean; isMe: boolean; verified: boolean; avatarAi: boolean; avatarAiKind: string;
  labels: Record<number, string>;
  constructor(j: any) {
    this.username = j.username; this.name = j.name; this.bio = j.bio ?? ''; this.birth = j.birth ?? ''; this.avatar = j.avatar ?? null; this.cover = j.cover ?? null;
    this.pvis = j.pvis ?? 'public'; this.rvis = j.rvis ?? 'public'; this.streak = j.streak ?? 0; this.days = j.days ?? 0; this.taps = j.taps ?? 0;
    this.age = j.age ?? 0; this.rels = j.rels ?? 0; this.audios = j.audios ?? 0; this.followers = j.followers ?? 0; this.following = j.following ?? 0;
    this.isFollowing = j.is_following === true; this.isMe = j.is_me === true; this.verified = j.verified === true; this.avatarAi = j.avatar_ai === true;
    this.avatarAiKind = `${j.avatar_ai_kind ?? (j.avatar_ai === true ? 'made' : '')}`;
    this.labels = {}; for (const e of (j.labels ?? [])) this.labels[Number(e.id)] = `${e.name}`;
  }
}
export type File = { url: string; secs: number };
export class A {
  id: number; secs: number; created: number; comments: number; desc: string; url: string; vis: string; rand: string; owner: string; ownerName: string; to: string[];
  ownerAvatar: string | null; popup: boolean; pprof: boolean; ownerVerified: boolean; long: boolean; inRand: boolean; inHups: boolean; bgm: boolean; ai: boolean; ownerAvatarAi: boolean;
  aiKind: string; ownerAvatarAiKind: string; bgmIdx: number; text: string | null; files: File[]; likes: number; plays: number; views: number; liked: boolean; saved: boolean;
  constructor(j: any) {
    this.id = j.id; this.secs = j.secs ?? 0; this.created = j.created ?? 0; this.desc = j.desc ?? ''; this.url = j.url ?? ''; this.vis = j.vis ?? 'public'; this.rand = j.rand ?? 'public';
    this.owner = j.owner; this.ownerName = j.owner_name; this.ownerAvatar = j.owner_avatar ?? null; this.ownerVerified = j.owner_verified === true; this.popup = j.popup === true; this.pprof = j.pprof !== false;
    this.likes = j.likes ?? 0; this.plays = Number(j.plays ?? 0); this.views = Number(j.views ?? 0); this.liked = j.liked === true; this.long = j.long === true; this.inRand = j.in_rand !== false; this.inHups = j.in_hups === true;
    this.comments = j.comments ?? 0; this.saved = j.saved === true; this.bgm = j.bgm === true; this.ai = j.ai === true; this.ownerAvatarAi = j.owner_avatar_ai === true;
    this.aiKind = `${j.ai_kind ?? (j.ai === true ? 'made' : '')}`; this.ownerAvatarAiKind = `${j.owner_avatar_ai_kind ?? (j.owner_avatar_ai === true ? 'made' : '')}`;
    this.bgmIdx = Number(j.bgm_idx ?? 0); this.text = j.text ?? null; this.to = ((j.to as any[]) ?? []).map((e) => `${e.username}`);
    this.files = Array.isArray(j.files) ? j.files.map((f: any) => ({ ...f })) : ((j.url ?? '') === '' ? [] : [{ url: j.url, secs: j.secs ?? 0 }]);
  }
  toJson() {
    return { id: this.id, secs: this.secs, created: this.created, desc: this.desc, url: this.url, vis: this.vis, rand: this.rand, owner: this.owner, owner_name: this.ownerName, owner_avatar: this.ownerAvatar, owner_verified: this.ownerVerified, popup: this.popup, pprof: this.pprof, likes: this.likes, plays: this.plays, views: this.views, liked: this.liked, long: this.long, in_rand: this.inRand, in_hups: this.inHups, comments: this.comments, saved: this.saved, files: this.files, bgm: this.bgm, ai: this.ai, ai_kind: this.aiKind, owner_avatar_ai: this.ownerAvatarAi, owner_avatar_ai_kind: this.ownerAvatarAiKind, bgm_idx: this.bgmIdx, text: this.text, to: this.to.map((u) => ({ username: u })) };
  }
}
export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// ---------- API ----------
const d2 = (v: number) => String(v).padStart(2, '0');
function pw(p: string, b: any) {
  if (!b || !(p === '/register' || p === '/login' || p === '/me/password')) return b;
  const o = { ...b };
  for (const k of ['password', 'old', 'new']) if (typeof o[k] === 'string') o[k] = o[k].trim();
  const fresh = p === '/register' ? o.password : p === '/me/password' ? o.new : null;
  if (typeof fresh === 'string' && /\s/.test(fresh)) throw new ApiErr('bad_password');
  return o;
}
export const Api = {
  token: null as string | null,
  get hasSession() { return !!this.token; },
  setSession(v: string | null) { this.token = v; v ? ls.set('hulhup_token', v) : ls.del('hulhup_token'); },
  headers(type?: string): Record<string, string> {
    const n = new Date();
    return { ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}), 'X-Today': `${n.getFullYear()}-${d2(n.getMonth() + 1)}-${d2(n.getDate())}`, ...(type ? { 'Content-Type': type } : {}) };
  },
  async out(r: Response) {
    let j: any; try { const t = await r.text(); j = t ? JSON.parse(t) : {}; } catch { j = null; }
    if (r.status >= 200 && r.status < 300) return j ?? {};
    throw new ApiErr(j && typeof j.error === 'string' ? j.error : r.status === 401 ? 'unauthorized' : 'server');
  },
  async req(m: string, p: string, body?: any): Promise<any> {
    body = pw(p, body);
    if (p === '/me/reminders' && body?.test !== true) {
      const n = new Date(); const slot = new Date(n.getFullYear(), n.getMonth(), n.getDate(), 19);
      if (n < slot) slot.setDate(slot.getDate() - 1);
      body = { ...(body || {}), slot: `${slot.getFullYear()}-${d2(slot.getMonth() + 1)}-${d2(slot.getDate())}`, slot_ms: slot.getTime() };
    }
    if (p === '/register') body = { ...(body || {}), slot: '' };
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 25000);
    try {
      const r = await fetch(API + p, { method: m, headers: this.headers(body == null ? undefined : 'application/json'), body: body == null ? undefined : JSON.stringify(body), signal: ctl.signal });
      const j = await this.out(r);
      if ((p === '/login' || p === '/register') && typeof j?.token === 'string') this.setSession(j.token);
      if ((p === '/logout' && m === 'POST') || (p === '/me' && m === 'DELETE')) this.setSession(null);
      return j;
    } catch (e) { if (e instanceof ApiErr) throw e; throw new Error('network'); } finally { clearTimeout(to); }
  },
  async send(p: string, b: Blob | ArrayBuffer, type = 'application/octet-stream'): Promise<any> {
    const r = await fetch(API + p, { method: 'POST', headers: this.headers(type), body: b as any });
    return this.out(r);
  },
  media: new Map<string, Blob>(),
  /** Ambil berkas audio (perlu login) dari server; disimpan sebentar di memori. */
  async bytes(url: string): Promise<Blob | null> {
    if (url.startsWith('file:') || url.startsWith('mem:')) return Offline.get(url.slice(url.indexOf(':') + 1));
    if (!url.startsWith('/')) return null;
    const c = this.media.get(url); if (c) return c;
    const r = await fetch(API + url, { headers: this.headers() });
    if (r.status !== 200) throw new ApiErr('network');
    const b = await r.blob();
    if (this.media.size >= 6) this.media.delete(this.media.keys().next().value!);
    this.media.set(url, b); return b;
  },
};

// ---------- blob offline (IndexedDB) ----------
const idb = (): Promise<IDBDatabase> => new Promise((res, rej) => { const o = indexedDB.open('hulhup', 1); o.onupgradeneeded = () => o.result.createObjectStore('blobs'); o.onsuccess = () => res(o.result); o.onerror = () => rej(o.error); });
export const Offline = {
  async put(k: string, b: Blob): Promise<boolean> { try { const d = await idb(); return await new Promise((r) => { const t = d.transaction('blobs', 'readwrite'); t.objectStore('blobs').put(b, k); t.oncomplete = () => r(true); t.onerror = () => r(false); }); } catch { return false; } },
  async get(k: string): Promise<Blob | null> { try { const d = await idb(); return await new Promise((r) => { const q = d.transaction('blobs').objectStore('blobs').get(k); q.onsuccess = () => r((q.result as Blob) || null); q.onerror = () => r(null); }); } catch { return null; } },
  async del(k: string) { try { const d = await idb(); await new Promise<void>((r) => { const t = d.transaction('blobs', 'readwrite'); t.objectStore('blobs').delete(k); t.oncomplete = () => r(); t.onerror = () => r(); }); } catch {} },
};

// ---------- Store ----------
type Fn = () => void;
export class Store {
  me: U | null = null; unread = 0; unreadSocial = 0; tapf: Record<string, number> = {};
  lang: 'id' | 'en' = 'id'; mode: 0 | 1 | 2 = 0; remind = true; fromOffline = false; filter = 'public';
  offline: A[] = []; online = true; playing: number | null = null; dur = 0; pos = 0; rate = 1;
  bgmKey: number | null = null; bgmMuted = false; homeMode = 0; searches: string[] = [];
  banner: ((m: string) => void) | null = null;
  ready = false; v = 0;
  private L = new Set<Fn>(); private pend = new Set<string>(); private counted = new Set<string>(); private lastOff: number | null = null;
  private p?: HTMLAudioElement; private bg?: HTMLAudioElement; private scope: unknown = null; private bgScope: unknown = null; private bgTok = 0; private objUrl = ''; private bgUrl = ''; private starting = false;
  private pushed = 0;

  subscribe = (f: Fn) => { this.L.add(f); return () => this.L.delete(f); };
  getV = () => this.v;
  notify() { this.v++; this.L.forEach((f) => f()); }
  poke() { this.notify(); }

  get taps() { return this.tapf[this.filter] ?? 0; }
  t(k: string): string { return (T[k] ?? [k, k])[this.lang === 'id' ? 0 : 1]; }
  err(e: unknown): string { return e instanceof ApiErr ? (T[`e_${e.code}`] ? this.t(`e_${e.code}`) : this.t('e_server')) : this.t('e_network'); }
  fmt(n: number) { const s = `${n}`, sep = this.lang === 'id' ? '.' : ','; let o = ''; for (let i = 0; i < s.length; i++) { if (i > 0 && (s.length - i) % 3 === 0) o += sep; o += s[i]; } return o; }
  ago(ms: number) { const m = Math.floor((Date.now() - ms) / 60000); if (m < 1) return this.t('ago_now'); if (m < 60) return `${m} ${this.t('ago_m')}`; const h = Math.floor(m / 60); return h < 24 ? `${h} ${this.t('ago_h')}` : `${Math.floor(h / 24)} ${this.t('ago_d')}`; }
  when(ms: number) {
    if (ms <= 0) return ''; const d = new Date(ms);
    if ((Date.now() - ms) / 86400000 < 7) return this.ago(ms);
    const m = { id: ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'], en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] };
    return `${d.getDate()} ${m[this.lang][d.getMonth()]} ${d.getFullYear()}`;
  }

  init() {
    if (this.ready || typeof window === 'undefined') return; this.ready = true;
    Api.token = ls.get('hulhup_token');
    this.lang = (ls.get('lang') as any) === 'en' ? 'en' : 'id';
    this.mode = Math.min(2, Math.max(0, Number(ls.get('mode') ?? 0))) as any;
    this.remind = ls.get('remind') !== '0';
    this.filter = ls.get('filter') || 'public';
    this.rate = Math.min(2, Math.max(.5, Number(ls.get('rate') ?? 1) || 1));
    this.bgmMuted = ls.get('bgm_muted') === '1';
    const F = ['public', 'followers', 'following', 'both', 'friend', 'best', 'partner', 'family', 'relations', 'me'];
    if (this.filter.split(',').some((e) => !F.includes(e) && !/^L\d+$/.test(e))) this.filter = 'public';
    this.searches = ls.json<string[]>('search_hist', []);
    try { this.offline = ls.json<any[]>('offline', []).map((j) => new A(j)); } catch {}
    this.pend = new Set(ls.json<string[]>('pend_count', []));
    this.online = navigator.onLine;
    addEventListener('online', () => { this.online = true; this.notify(); this.refresh(); this.flushCounts(); });
    addEventListener('offline', () => { this.online = false; this.notify(); });
    document.documentElement.dataset.theme = ['', 'light', 'dark'][this.mode];
    fetch(`${API}/health?warm=1`).catch(() => {});
    setInterval(() => this.poll(), 30000);
    this.refresh().then(() => this.start());
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.start(); });
    this.notify();
  }

  async refresh() {
    try {
      if (Api.hasSession) {
        const j = await Api.req('GET', '/me');
        this.me = new U(j.user); this.cleanFilter(); this.flushCounts();
        ls.set('me_cache', JSON.stringify(j.user));
        this.unread = j.unread ?? 0; this.unreadSocial = j.unread_social ?? 0;
      }
      const st = await Api.req('GET', '/stats');
      if (st.tapf && typeof st.tapf === 'object') { this.tapf = Object.fromEntries(Object.entries(st.tapf).map(([k, v]) => [k, Number(v)])); ls.set('tapf_cache', JSON.stringify(this.tapf)); }
    } catch (e) {
      if (e instanceof ApiErr && e.code === 'unauthorized') this.clear();
      else { // tanpa internet: pakai data terakhir
        if (!this.me && Api.hasSession) { const c = ls.get('me_cache'); if (c) try { this.me = new U(JSON.parse(c)); } catch {} }
        if (!Object.keys(this.tapf).length) this.tapf = ls.json('tapf_cache', {});
      }
    }
    this.notify();
  }

  async start(): Promise<number | null> {
    if (this.starting) return null; this.starting = true; let fresh: number | null = null;
    try {
      await this.refresh();
      if (this.me) {
        const j = await Api.req('POST', '/me/checkin');
        if (j.new === true) fresh = j.streak ?? null;
        await Api.req('POST', '/me/reminders', { on: this.remind });
        await this.refresh();
        if (this.unreadSocial > this.pushed) this.banner?.(this.t('push_unread').replace('{n}', `${this.unreadSocial}`));
        this.pushed = this.unreadSocial;
      }
    } catch {} finally { this.starting = false; }
    if (fresh) setTimeout(() => this.banner?.(this.t('n_streak').replace('{n}', `${fresh}`)), 900);
    return fresh;
  }
  private async poll() {
    if (!this.me || this.starting) return;
    try { await this.refresh(); if (this.unreadSocial > this.pushed) this.banner?.(this.t('push_unread').replace('{n}', `${this.unreadSocial}`)); this.pushed = this.unreadSocial; } catch {}
  }
  private clear() { Api.setSession(null); this.me = null; this.unread = 0; this.unreadSocial = 0; this.pushed = 0; }
  async auth(path: string, body: any) { const j = await Api.req('POST', path, body); this.me = new U(j.user); this.notify(); this.start(); return j; }
  async logout() { try { await Api.req('POST', '/logout'); } catch {} this.clear(); await this.refresh(); }
  async deleteAccount() { await Api.req('DELETE', '/me'); this.clear(); await this.refresh(); }
  setLang(l: 'id' | 'en') { this.lang = l; ls.set('lang', l); document.documentElement.lang = l; this.notify(); }
  setMode(m: 0 | 1 | 2) { this.mode = m; ls.set('mode', `${m}`); document.documentElement.dataset.theme = ['', 'light', 'dark'][m]; this.notify(); }
  setRemind(v: boolean) { this.remind = v; ls.set('remind', v ? '1' : '0'); this.notify(); if (v && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {}); }

  relName(x: string) { return ['friend', 'best', 'partner', 'family', 'custom'].includes(x) ? this.t(`a_${x}`).toLowerCase() : x; }
  labelName(id: number) { return this.me?.labels[id] ?? this.t('a_custom'); }
  notifText(type: string, extra: string) {
    switch (type) {
      case 'like': return this.t('n_like'); case 'comment': return this.t('n_comment'); case 'reply': return this.t('n_reply'); case 'mention': return this.t('n_mention');
      case 'rel_req': return this.t('n_rel_req').replace('{r}', this.relName(extra)); case 'rel_ok': return this.t('n_rel_ok').replace('{r}', this.relName(extra));
      default: return this.t('n_follow');
    }
  }
  private cleanFilter() {
    const ok = this.filter.split(',').filter((e) => e && (!/^L\d+$/.test(e) || this.me?.labels[Number(e.slice(1))] !== undefined));
    const v = ok.length ? ok.join(',') : 'public';
    if (v !== this.filter) { this.filter = v; ls.set('filter', v); }
  }
  setFilter(v: string) { this.filter = v; ls.set('filter', v); this.notify(); }
  async setRvis(v: string) { const j = await Api.req('PATCH', '/me/settings', { rvis: v }); this.me = new U(j.user); this.notify(); }
  async setPvis(v: string) { const j = await Api.req('PATCH', '/me/settings', { pvis: v }); this.me = new U(j.user); this.notify(); }

  private pickOffline(): A | null {
    let c = [...this.offline]; if (!c.length) return null;
    if (c.length > 1 && this.lastOff != null) c = c.filter((a) => a.id !== this.lastOff);
    const a = c[Math.floor(Math.random() * c.length)]; this.lastOff = a.id; return a;
  }
  /** Tanpa internet, acak diambil dari post yang sudah dijadikan offline. */
  async random(): Promise<A | null> {
    this.fromOffline = false;
    if (!navigator.onLine) { this.fromOffline = true; return this.pickOffline(); }
    try {
      const f = this.me == null ? 'public' : this.filter;
      const j = await Api.req('GET', `/random?f=${f}`);
      if (this.me && j.taps != null) this.tapf[f] = Number(j.taps);
      this.notify();
      return j.audio == null ? null : new A(j.audio);
    } catch (e) { if (e instanceof ApiErr) throw e; this.fromOffline = true; return this.pickOffline(); }
  }

  // hitungan putar/lihat: server menghitung 1 per akun per post; bila gagal disimpan dan dikirim lagi saat tersambung
  private savePend() { ls.set('pend_count', JSON.stringify([...this.pend])); }
  private count(a: A, kind: string) { if (!this.me || a.id <= 0 || this.counted.has(`${kind}${a.id}`)) return; this.counted.add(`${kind}${a.id}`); this.send(a, kind, a.id); }
  private send(a: A | null, kind: string, id: number) {
    const k = `${kind}${id}`;
    Api.req('POST', `/audios/${id}/${kind}`).then((j) => {
      if (this.pend.delete(k)) this.savePend();
      if (a) { a.plays = Number(j.plays ?? a.plays); a.views = Number(j.views ?? a.views); }
      this.notify();
    }).catch((e) => {
      if (e instanceof ApiErr && !e.code.includes('rate') && !e.code.includes('many')) { if (this.pend.delete(k)) this.savePend(); return; }
      if (!this.pend.has(k)) { this.pend.add(k); this.savePend(); }
    });
  }
  flushCounts() {
    if (!this.me) return;
    for (const k of ls.json<string[]>('pend_count', [])) this.pend.add(k);
    for (const k of [...this.pend]) { const m = /^(play|view)(\d+)$/.exec(k); if (!m) { this.pend.delete(k); continue; } this.send(null, m[1], Number(m[2])); }
  }
  countPlay(a: A) { if (!a.bgm && a.files.length) this.count(a, 'play'); }
  countView(a: A) { this.count(a, 'view'); }
  needNet() { if (this.online) return true; this.banner?.(this.t('need_net')); return false; }
  isOffline(id: number) { return this.offline.some((o) => o.id === id); }

  async toggleOffline(a: A) {
    const i = this.offline.findIndex((o) => o.id === a.id);
    if (i >= 0) { await Offline.del(`off${a.id}`); this.offline.splice(i, 1); }
    else {
      const j: any = a.toJson();
      if (a.url) { // post tanpa audio hanya menyimpan isinya
        const b = await Api.bytes(a.url); if (!b) throw new ApiErr('server');
        if (!(await Offline.put(`off${a.id}`, b))) throw new ApiErr('storage_full');
        j.url = `mem:off${a.id}`;
        j.files = (j.files as File[]).map((f, n) => n === 0 ? { ...f, url: j.url } : f);
      }
      this.offline.unshift(new A(j));
    }
    ls.set('offline', JSON.stringify(this.offline.map((o) => o.toJson()))); this.notify();
  }

  // ---------- pemutar ----------
  private audio(): HTMLAudioElement {
    if (!this.p) {
      const p = this.p = new Audio();
      p.addEventListener('timeupdate', () => { this.pos = Math.floor(p.currentTime * 1000); this.notify(); });
      p.addEventListener('loadedmetadata', () => { this.dur = Math.floor((p.duration || 0) * 1000); });
      p.addEventListener('ended', () => { this.playing = null; this.scope = null; if (this.dur > 0) this.pos = this.dur; this.notify(); });
    }
    return this.p;
  }
  private async src(url: string): Promise<string> {
    const b = await Api.bytes(url);
    return b ? URL.createObjectURL(b) : (url.startsWith('/') ? API + url : url);
  }
  setRate(r: number) { this.rate = r; if (this.p) this.p.playbackRate = r; ls.set('rate', `${r}`); this.notify(); }
  cycleRate() { const r = [.5, .75, 1, 1.25, 1.5, 2]; const i = r.findIndex((e) => e >= this.rate - .001); this.setRate(r[(i + 1) % r.length]); }
  async play(a: A, o: { force?: boolean; loop?: boolean; scope?: unknown } = {}) { this.countPlay(a); return this.playUrl(a.id, a.url, o); }
  async playUrl(key: number, url: string, o: { force?: boolean; loop?: boolean; scope?: unknown } = {}) {
    if (!url) return;
    if (!o.force && this.playing === key) { this.stop(); return; }
    this.playing = key; this.scope = o.scope ?? null; this.pos = 0; this.dur = 0; this.notify();
    const p = this.audio(); p.pause();
    p.loop = o.loop ?? true;
    const u = await this.src(url);
    if (this.playing !== key) return;
    if (this.objUrl) URL.revokeObjectURL(this.objUrl); this.objUrl = u.startsWith('blob:') ? u : '';
    p.src = u; p.playbackRate = this.rate;
    try { await p.play(); } catch (e) { this.playing = null; this.notify(); throw e; }
  }
  stop() { this.p?.pause(); this.playing = null; this.scope = null; this.pos = 0; this.notify(); }
  leave(scope: unknown) { if (this.scope === scope && this.playing != null) queueMicrotask(() => this.stop()); }

  // backsound: pemutar kedua, jalan bersamaan, bisa dimatikan
  async playBgm(key: number, url: string, scope?: unknown) {
    if (!this.bg) { this.bg = new Audio(); this.bg.loop = true; }
    if (this.bgmKey === key) { this.bg.volume = this.bgmMuted ? 0 : 1; return; }
    const tok = ++this.bgTok; this.bgmKey = key; this.bgScope = scope ?? null; this.notify();
    try {
      this.bg.pause(); const u = await this.src(url); if (tok !== this.bgTok) return;
      if (this.bgUrl) URL.revokeObjectURL(this.bgUrl); this.bgUrl = u.startsWith('blob:') ? u : '';
      this.bg.src = u; this.bg.volume = this.bgmMuted ? 0 : 1; await this.bg.play();
    } catch { if (tok === this.bgTok) { this.bgmKey = null; this.bgScope = null; this.notify(); } } // peramban memblokir putar otomatis: dicoba lagi nanti
  }
  stopBgm() { this.bgTok++; this.bgmKey = null; this.bgScope = null; this.bg?.pause(); this.notify(); }
  leaveBgm(scope: unknown) { if (this.bgScope === scope && this.bgmKey != null) queueMicrotask(() => this.stopBgm()); }
  setBgmMuted(v: boolean) { this.bgmMuted = v; if (this.bg) this.bg.volume = v ? 0 : 1; ls.set('bgm_muted', v ? '1' : '0'); this.notify(); }

  // riwayat pencarian (hanya di perangkat ini)
  addSearch(q: string) { q = q.trim(); if (!q) return; this.searches = [q, ...this.searches.filter((e) => e.toLowerCase() !== q.toLowerCase())].slice(0, 20); ls.set('search_hist', JSON.stringify(this.searches)); }
  delSearch(q: string) { this.searches = this.searches.filter((e) => e !== q); ls.set('search_hist', JSON.stringify(this.searches)); this.notify(); }
  clearSearches() { this.searches = []; ls.del('search_hist'); this.notify(); }

  async like(a: A) { const j = await Api.req('POST', `/audios/${a.id}/like`); a.liked = j.liked; a.likes = j.likes; this.notify(); }
}
export const store = new Store();
export function useStore(): Store {
  useSyncExternalStore(store.subscribe, store.getV, store.getV);
  return store;
}
