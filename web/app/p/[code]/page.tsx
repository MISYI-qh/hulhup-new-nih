import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PostCard from '@/components/PostCard';
import { pub, media, ORIGIN, type Post, type Comment } from '@/lib/api';
import { clip, ago } from '@/lib/format';
import Avatar from '@/components/Avatar';
import Link from 'next/link';
import { dec, enc } from '@/lib/code';

export const revalidate = 120;
type Props = { params: Promise<{ code: string }> };
const load = async (code: string) => { const n = dec(code); return n ? pub<{ post: Post; text: string | null }>(`/posts/${n}`, 120) : null; };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code: id } = await params;
  const d = await load(id);
  if (!d?.post) return { title: 'Post tidak tersedia', robots: { index: false, follow: false } };
  const t = clip(d.text || d.post.desc || '', 160);
  const title = `${d.post.owner_name}${t ? ': ' + clip(t, 60) : ''}`;
  const desc = t || `Post oleh ${d.post.owner_name} di Hulhup.`;
  return { title, description: desc, alternates: { canonical: `/p/${id}` },
    openGraph: { type: 'article', title, description: desc, url: `${ORIGIN}/p/${id}`, ...(d.post.owner_avatar ? { images: [media(d.post.owner_avatar)] } : {}) } };
}

export default async function PostPage({ params }: Props) {
  const { code: id } = await params;
  const d = await load(id);
  if (!d?.post) notFound();
  const c = await pub<{ items: Comment[] }>(`/posts/${dec(id)}/comments`, 120);
  const p = { ...d.post, text: d.text ?? d.post.desc };
  const ld: Record<string, unknown> = { '@context': 'https://schema.org', '@type': 'SocialMediaPosting', '@id': `${ORIGIN}/p/${id}`, url: `${ORIGIN}/p/${id}`,
    headline: clip(p.text || p.desc || 'Post Hulhup', 100), articleBody: p.text || undefined, datePublished: new Date(p.created).toISOString(), inLanguage: 'id',
    author: { '@type': 'Person', name: p.owner_name, url: `${ORIGIN}/@${p.owner}` },
    interactionStatistic: [{ '@type': 'InteractionCounter', interactionType: 'https://schema.org/LikeAction', userInteractionCount: p.likes }, { '@type': 'InteractionCounter', interactionType: 'https://schema.org/CommentAction', userInteractionCount: p.comments }] };
  if (p.url && !p.bgm) ld.audio = { '@type': 'AudioObject', contentUrl: media(p.url), duration: `PT${p.secs}S`, encodingFormat: 'audio/mpeg', name: clip(p.text || p.desc || 'Audio Hulhup', 80) };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <div style={{ marginTop: 20 }}><PostCard p={p} full /></div>
      <h2>Komentar</h2>
      {(c?.items ?? []).length ? c!.items.map((m) => (
        <div className="card" key={m.id}>
          <div className="row"><Avatar src={m.owner_avatar} name={m.owner_name} size={34} />
            <div><Link href={`/@${m.owner}`} className="who">{m.owner_name}</Link><span className="handle"> @{m.owner} · {ago(m.created)}</span></div></div>
          <div className="text full">{m.text ?? m.body}</div>
        </div>
      )) : <p className="muted">Belum ada komentar.</p>}
    </>
  );
}
