import type { Metadata } from 'next';
import PostCard from '@/components/PostCard';
import { pub, type Post } from '@/lib/api';

export const revalidate = 60;
export const metadata: Metadata = {
  title: 'Hups — tulisan dan suara di Hulhup',
  description: 'Hups adalah linimasa tulisan Hulhup dengan audio opsional, komentar, dan balasan.',
  alternates: { canonical: '/hups' },
};

export default async function Hups() {
  const feed = await pub<{ items: Post[] }>('/hups?f=public', 60);
  return (
    <>
      <h1>Hups</h1>
      <p className="muted">Post publik terbaru dari Hulhup. Masuk untuk melihat post dari pengikut dan hubunganmu.</p>
      {(feed?.items ?? []).map((p) => <PostCard key={p.id} p={p} />)}
      {!feed?.items?.length ? <p className="muted">Belum ada post publik.</p> : null}
    </>
  );
}
