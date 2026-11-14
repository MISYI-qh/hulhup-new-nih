'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { req, setSession, ApiError } from '@/lib/client';

export default function Login() {
  const r = useRouter();
  const [reg, setReg] = useState(false);
  const [u, setU] = useState(''); const [p, setP] = useState(''); const [n, setN] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  async function go(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const j = await req<{ token: string; user: any }>('POST', reg ? '/register' : '/login', reg ? { username: u, password: p, name: n || u } : { username: u, password: p });
      setSession(j.token, j.user); r.push('/');
    } catch (x) { setErr(x instanceof ApiError ? x.code : 'Gagal terhubung'); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={go} style={{ maxWidth: 380, margin: '40px auto', display: 'grid', gap: 12 }}>
      <h1>{reg ? 'Daftar' : 'Masuk'}</h1>
      <input placeholder="Username" value={u} onChange={(e) => setU(e.target.value.toLowerCase())} autoCapitalize="none" required />
      {reg ? <input placeholder="Nama" value={n} onChange={(e) => setN(e.target.value)} /> : null}
      <input type="password" placeholder="Kata sandi" value={p} onChange={(e) => setP(e.target.value)} required />
      {err ? <div role="alert" style={{ color: '#c0392b' }}>{err}</div> : null}
      <button className="pill dark" disabled={busy} style={{ justifyContent: 'center' }}>{reg ? 'Daftar' : 'Masuk'}</button>
      <button type="button" className="pill" onClick={() => setReg(!reg)} style={{ justifyContent: 'center' }}>{reg ? 'Sudah punya akun? Masuk' : 'Belum punya akun? Daftar'}</button>
    </form>
  );
}
