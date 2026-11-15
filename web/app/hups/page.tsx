import type { Metadata } from 'next';
import Link from 'next/link';
import { HomeScreen } from '@/components/home';
import { pub, type Post } from '@/lib/api';
import { enc } from '@/lib/code';
import { clip } from '@/lib/format';

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
      <HomeScreen mode0={1} />
      <nav className="sr" aria-label="Hups terbaru">
        {(feed?.items ?? []).map((p) => <Link key={p.id} href={`/p/${enc(p.id)}`}>{p.owner_name}: {clip(p.text || p.desc || 'Audio', 80)}</Link>)}
      </nav>
    </>
  );
}
