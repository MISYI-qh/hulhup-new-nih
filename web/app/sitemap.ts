import type { MetadataRoute } from 'next';
import { enc } from '@/lib/code';
import { pub, ORIGIN, type Post } from '@/lib/api';
export const revalidate = 3600;
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const feed = await pub<{ items: Post[] }>('/hups?f=public', 3600);
  const items = feed?.items ?? [];
  const users = [...new Set(items.map((p) => p.owner))];
  const now = new Date();
  return [
    ...['', '/hups', '/about', '/faq', '/policy', '/privacy'].map((p) => ({ url: ORIGIN + p, lastModified: now })),
    ...items.map((p) => ({ url: `${ORIGIN}/p/${enc(p.id)}`, lastModified: new Date(p.created) })),
    ...users.map((u) => ({ url: `${ORIGIN}/@${u}`, lastModified: now })),
  ];
}
