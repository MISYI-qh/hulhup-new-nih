import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PostCard from '@/components/PostCard';
import Avatar from '@/components/Avatar';
import { pub, ORIGIN, type Post, type User } from '@/lib/api';
import { clip, num } from '@/lib/format';

export const revalidate = 120;
type Props = { params: Promise<{ username: string }> };
const load = async (u: string) => (/^[a-z0-9_]+$/.test(u) ? pub<{ user: User; audios: Post[]; locked: boolean }>(`/users/${u}`, 120) : null);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const d = await load(username);
  if (!d?.user) return { title: 'Akun tidak ditemukan', robots: { index: false, follow: false } };
  return { title: `${d.user.name} (@${username})`, description: clip(d.user.bio || `Profil ${d.user.name} di Hulhup.`, 160), alternates: { canonical: `/@${username}` } };
}

export default async function Profile({ params }: Props) {
  const { username } = await params;
  const d = await load(username);
  if (!d?.user) notFound();
  const u = d.user;
  const ld = { '@context': 'https://schema.org', '@type': 'ProfilePage', mainEntity: { '@type': 'Person', name: u.name, alternateName: `@${username}`, url: `${ORIGIN}/@${username}`, description: u.bio || undefined,
    interactionStatistic: { '@type': 'InteractionCounter', interactionType: 'https://schema.org/FollowAction', userInteractionCount: u.followers ?? 0 } } };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <section style={{ textAlign: 'center', padding: '28px 0 6px' }}>
        <div style={{ display: 'grid', placeItems: 'center' }}><Avatar src={u.avatar} name={u.name} size={92} /></div>
        <h1 style={{ margin: '14px 0 2px' }}>{u.name}</h1>
        <div className="handle">@{username}</div>
        {u.bio ? <p style={{ maxWidth: 480, margin: '10px auto', whiteSpace: 'pre-wrap' }}>{u.bio}</p> : null}
        <div className="stats" style={{ justifyContent: 'center' }}><span><b>{num(u.followers ?? 0)}</b> pengikut</span><span><b>{num(u.following ?? 0)}</b> mengikuti</span></div>
      </section>
      <h2>Post</h2>
      {d.locked ? <p className="muted">Profil ini hanya terlihat oleh orang tertentu.</p> : d.audios.length ? d.audios.map((p) => <PostCard key={p.id} p={p} />) : <p className="muted">Belum ada post publik.</p>}
    </>
  );
}
