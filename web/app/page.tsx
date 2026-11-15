import type { Metadata } from 'next';
import Link from 'next/link';
import { HomeScreen } from '@/components/home';
import { pub, ORIGIN, type Post } from '@/lib/api';
import { enc } from '@/lib/code';
import { clip } from '@/lib/format';

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
      <HomeScreen />
      <nav className="sr" aria-label="Post terbaru">
        {items.map((p) => <Link key={p.id} href={`/p/${enc(p.id)}`}>{p.owner_name}: {clip(p.text || p.desc || 'Audio', 80)}</Link>)}
      </nav>
    </>
  );
}
