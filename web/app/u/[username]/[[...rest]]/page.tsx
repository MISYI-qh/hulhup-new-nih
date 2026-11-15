import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { FollowsScreen, } from '@/components/screens1';
import { ProfileScreen, RelationsScreen } from '@/components/screens2';
import { pub, ORIGIN, type Post, type User } from '@/lib/api';
import { clip, num } from '@/lib/format';
import { enc } from '@/lib/code';

export const revalidate = 120;
type Props = { params: Promise<{ username: string; rest?: string[] }> };
const load = async (u: string) => (/^[a-z0-9_]+$/.test(u) ? pub<{ user: User; audios: Post[]; locked: boolean }>(`/users/${u}`, 120) : null);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const d = await load(username);
  if (!d?.user) return { title: `@${username}`, robots: { index: false, follow: false } };
  return { title: `${d.user.name} (@${username})`, description: clip(d.user.bio || `Profil ${d.user.name} di Hulhup.`, 160), alternates: { canonical: `/@${username}` } };
}

const TABS = ['hups', 'acak', 'relations', 'followers', 'following'];
export default async function Profile({ params }: Props) {
  const { username, rest } = await params;
  if (!/^[a-z0-9_]+$/.test(username)) notFound();
  if (rest && (rest.length !== 1 || !TABS.includes(rest[0]))) notFound();
  const sub = rest?.[0];
  if (sub === 'relations') return <RelationsScreen u={username} />;
  if (sub === 'followers' || sub === 'following') return <FollowsScreen u={username} kind={sub} />;
  const d = await load(username);
  // Akun yang tidak terlihat di server tetap dirender di klien (pengikut/teman yang masuk bisa melihatnya).
  if (!d?.user) return <ProfileScreen username={username} />;
  const u = d.user;
  const ld = { '@context': 'https://schema.org', '@type': 'ProfilePage', mainEntity: { '@type': 'Person', name: u.name, alternateName: `@${username}`, url: `${ORIGIN}/@${username}`, description: u.bio || undefined,
    interactionStatistic: { '@type': 'InteractionCounter', interactionType: 'https://schema.org/FollowAction', userInteractionCount: u.followers ?? 0 } } };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <ProfileScreen username={username} />
      <section className="sr">
        <h1>{u.name}</h1><p>@{username}</p>{u.bio ? <p>{u.bio}</p> : null}
        <p>{num(u.followers ?? 0)} pengikut, {num(u.following ?? 0)} mengikuti</p>
        {d.locked ? null : d.audios.map((p) => <Link key={p.id} href={`/p/${enc(p.id)}`}>{clip(p.text || p.desc || 'Audio', 80)}</Link>)}
      </section>
    </>
  );
}
