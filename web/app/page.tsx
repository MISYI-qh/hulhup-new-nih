import type { Metadata } from 'next';
import Link from 'next/link';
import AcakButton from '@/components/AcakButton';
import PostCard from '@/components/PostCard';
import { pub, ORIGIN, type Post } from '@/lib/api';

export const revalidate = 60;
export const metadata: Metadata = { alternates: { canonical: '/' } };

export default async function Home() {
  const feed = await pub<{ items: Post[] }>('/hups?f=public', 60);
  const items = (feed?.items ?? []).slice(0, 8);
  const ld = { '@context': 'https://schema.org', '@type': 'WebSite', name: 'Hulhup', url: ORIGIN, inLanguage: 'id',
    potentialAction: { '@type': 'SearchAction', target: `${ORIGIN}/search?q={q}`, 'query-input': 'required name=q' } };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <section className="hero">
        <h1>Ketuk, dengarkan suara acak</h1>
        <p className="muted" style={{ maxWidth: 460, margin: '0 auto' }}>Satu tombol, satu suara singkat (maks 15 detik) atau tulisan dari orang lain. Kamu yang mengatur siapa boleh melihat post-mu.</p>
        <AcakButton />
      </section>
      <section aria-labelledby="terbaru">
        <h2 id="terbaru">Terbaru di Hups</h2>
        {items.length ? items.map((p) => <PostCard key={p.id} p={p} />) : <p className="muted">Belum ada post publik.</p>}
        <p><Link href="/hups" className="pill">Lihat semua Hups</Link></p>
      </section>
    </>
  );
}
