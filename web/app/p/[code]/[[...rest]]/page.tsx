import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PostScreen } from '@/components/postpage';
import { pub, media, ORIGIN, type Post, type Comment } from '@/lib/api';
import { clip } from '@/lib/format';
import Link from 'next/link';
import { dec, enc } from '@/lib/code';

export const revalidate = 120;
type Props = { params: Promise<{ code: string; rest?: string[] }> };
const load = async (code: string) => { const n = dec(code); return n ? pub<{ post: Post; text: string | null }>(`/posts/${n}`, 120) : null; };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code: id } = await params;
  const d = await load(id);
  if (!d?.post) return { title: 'Post', robots: { index: false, follow: false } };
  const t = clip(d.text || d.post.desc || '', 160);
  const title = `${d.post.owner_name}${t ? ': ' + clip(t, 60) : ''}`;
  const desc = t || `Post oleh ${d.post.owner_name} di Hulhup.`;
  return { title, description: desc, alternates: { canonical: `/p/${id}` },
    openGraph: { type: 'article', title, description: desc, url: `${ORIGIN}/p/${id}`, ...(d.post.owner_avatar ? { images: [media(d.post.owner_avatar)] } : {}) } };
}

export default async function PostPage({ params }: Props) {
  const { code: id, rest } = await params;
  const n = dec(id);
  if (!n) notFound();
  if (rest && !(rest.length === 2 && rest[0] === 'c' && /^\d+$/.test(rest[1]))) notFound();
  const cm = rest ? Number(rest[1]) : undefined;
  const d = await load(id);
  // Post non-publik tidak terlihat di server; tetap dirender di klien (pemilik/teman yang masuk bisa membukanya).
  if (!d?.post) return <PostScreen id={n} comment={cm} />;
  const c = await pub<{ items: Comment[] }>(`/posts/${n}/comments`, 120);
  const p = { ...d.post, text: d.text ?? d.post.desc };
  const ld: Record<string, unknown> = { '@context': 'https://schema.org', '@type': 'SocialMediaPosting', '@id': `${ORIGIN}/p/${id}`, url: `${ORIGIN}/p/${id}`,
    headline: clip(p.text || p.desc || 'Post Hulhup', 100), articleBody: p.text || undefined, datePublished: new Date(p.created).toISOString(), inLanguage: 'id',
    author: { '@type': 'Person', name: p.owner_name, url: `${ORIGIN}/@${p.owner}` },
    interactionStatistic: [{ '@type': 'InteractionCounter', interactionType: 'https://schema.org/LikeAction', userInteractionCount: p.likes }, { '@type': 'InteractionCounter', interactionType: 'https://schema.org/CommentAction', userInteractionCount: p.comments }] };
  if (p.url && !p.bgm) ld.audio = { '@type': 'AudioObject', contentUrl: media(p.url), duration: `PT${p.secs}S`, encodingFormat: 'audio/mpeg', name: clip(p.text || p.desc || 'Audio Hulhup', 80) };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <PostScreen id={n} comment={cm} />
      <article className="sr">
        <h1>{p.owner_name}</h1>
        <p>{p.text || p.desc}</p>
        <h2>Komentar</h2>
        {(c?.items ?? []).map((m) => <div key={m.id}><Link href={`/@${m.owner}`}>{m.owner_name}</Link>: {m.text ?? m.body}</div>)}
      </article>
    </>
  );
}
