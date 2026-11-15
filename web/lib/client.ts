'use client';
import { API } from './api';

export type Me = { username: string; name: string; avatar: string | null };
const K = 'hulhup_token', M = 'hulhup_me';

export const token = (): string => { try { return localStorage.getItem(K) || ''; } catch { return ''; } };
export function me(): Me | null { try { return JSON.parse(localStorage.getItem(M) || 'null'); } catch { return null; } }
export function setSession(t: string, u: Me | null) {
  try { if (t) { localStorage.setItem(K, t); localStorage.setItem(M, JSON.stringify(u)); } else { localStorage.removeItem(K); localStorage.removeItem(M); } } catch {}
  window.dispatchEvent(new Event('hulhup-auth'));
}

export class ApiError extends Error { constructor(public code: string, public status: number) { super(code); } }

const d2 = (v: number) => String(v).padStart(2, '0');
const ymd = (n: Date) => `${n.getFullYear()}-${d2(n.getMonth() + 1)}-${d2(n.getDate())}`;
function headers(type?: string): Record<string, string> {
  const t = token();
  return { ...(t ? { authorization: `Bearer ${t}` } : {}), 'x-today': ymd(new Date()), ...(type ? { 'content-type': type } : {}) };
}

/** Kata sandi: spasi di ujung diabaikan, spasi di tengah tidak boleh (Api._pw). */
function pw(p: string, b: any) {
  if (!b || !(p === '/register' || p === '/login' || p === '/me/password')) return b;
  const o = { ...b };
  for (const k of ['password', 'old', 'new']) if (typeof o[k] === 'string') o[k] = o[k].trim();
  const fresh = p === '/register' ? o.password : p === '/me/password' ? o.new : null;
  if (typeof fresh === 'string' && /\s/.test(fresh)) throw new ApiError('bad_password', 400);
  return o;
}

async function out(r: Response) {
  let j: any = null;
  try { const s = await r.text(); j = s ? JSON.parse(s) : {}; } catch { j = null; }
  if (r.ok) return j ?? {};
  throw new ApiError(j && typeof j.error === 'string' ? j.error : r.status === 401 ? 'unauthorized' : 'server', r.status);
}
const timed = (ms: number) => AbortSignal.timeout(ms);

export async function req<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  let b: any = pw(path, body);
  if (path === '/me/reminders' && b?.test !== true) {
    const n = new Date(); let slot = new Date(n.getFullYear(), n.getMonth(), n.getDate(), 19);
    if (n < slot) slot = new Date(slot.getTime() - 86400000);
    b = { ...b, slot: ymd(slot), slot_ms: slot.getTime() };
  }
  if (path === '/register') b = { ...b, slot: '' };
  const r = await fetch(API + path, { method, headers: headers(b ? 'application/json' : undefined), body: b ? JSON.stringify(b) : undefined, signal: timed(25000) });
  const j = await out(r);
  if ((path === '/login' || path === '/register') && typeof j.token === 'string') setSession(j.token, j.user);
  if ((path === '/logout' && method === 'POST') || (path === '/me' && method === 'DELETE')) setSession('', null);
  return j as T;
}

/** POST biner (unggah foto/audio). */
export async function send<T = any>(path: string, data: Blob | ArrayBuffer, type: string): Promise<T> {
  const r = await fetch(API + path, { method: 'POST', headers: headers(type), body: data as BodyInit, signal: timed(60000) });
  return out(r) as Promise<T>;
}
/** Unggah berkas dengan kolom di query (Api.multi). */
export const multi = <T = any,>(path: string, data: Blob, f: Record<string, string>) => send<T>(`${path}?${new URLSearchParams(f)}`, data, 'application/octet-stream');

/** Ambil berkas (audio perlu login) dari server. */
export async function fetchBytes(path: string): Promise<Blob> {
  const r = await fetch(path.startsWith('/') ? API + path : path, { headers: path.startsWith('/') ? headers() : undefined, signal: timed(60000) });
  if (!r.ok) throw new ApiError('network', r.status);
  return r.blob();
}
