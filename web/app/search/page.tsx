'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import PostCard from '@/components/PostCard';
import Avatar from '@/components/Avatar';
import { req } from '@/lib/client';
import type { Post, User } from '@/lib/api';

const H = 'hulhup_searches';
const load = (): string[] => { try { return JSON.parse(localStorage.getItem(H) || '[]'); } catch { return []; } };

export default function Search() {
  const [q, setQ] = useState(''); const [hist, setHist] = useState<string[]>([]);
  const [users, setUsers] = useState<User[]>([]); const [posts, setPosts] = useState<Post[]>([]); const [done, setDone] = useState(false);
  useEffect(() => { setHist(load()); const s = new URLSearchParams(location.search).get('q'); if (s) { setQ(s); run(s); } }, []);
  async function run(t: string) {
    t = t.trim(); if (!t) return;
    const h = [t, ...load().filter((x) => x !== t)].slice(0, 12);
    try { localStorage.setItem(H, JSON.stringify(h)); } catch {} setHist(h);
    try { const j = await req<{ users?: User[]; audios?: Post[] }>('GET', `/search?q=${encodeURIComponent(t)}`); setUsers(j.users ?? []); setPosts(j.audios ?? []); } catch { setUsers([]); setPosts([]); }
    setDone(true);
  }
  return (
    <>
      <h1>Cari</h1>
      <form onSubmit={(e) => { e.preventDefault(); run(q); }} style={{ display: 'flex', gap: 8 }}>
        <input style={{ flex: 1 }} placeholder="Cari orang atau tulisan" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="pill dark">Cari</button>
      </form>
      {!done && hist.length ? <section><h2>Riwayat pencarian</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{hist.map((h) => <button key={h} className="pill" onClick={() => { setQ(h); run(h); }}>{h}</button>)}</div>
        <p><button className="pill" onClick={() => { try { localStorage.removeItem(H); } catch {} setHist([]); }}>Hapus riwayat</button></p></section> : null}
      {users.map((u) => <Link key={u.username} href={`/@${u.username}`} className="card row"><Avatar src={u.avatar} name={u.name} size={40} /><div><b>{u.name}</b> <span className="handle">@{u.username}</span></div></Link>)}
      {posts.map((p) => <PostCard key={p.id} p={p} />)}
      {done && !users.length && !posts.length ? <p className="muted">Tidak ada hasil.</p> : null}
    </>
  );
}
