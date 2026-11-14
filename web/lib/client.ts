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

export async function req<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const t = token();
  const r = await fetch(API + path, {
    method, headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(t ? { authorization: `Bearer ${t}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(String((j as any).error || 'server'), r.status);
  return j as T;
}
