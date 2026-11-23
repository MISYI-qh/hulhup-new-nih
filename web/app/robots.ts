import type { MetadataRoute } from 'next';
import { ORIGIN } from '@/lib/api';
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: '*', allow: '/', disallow: ['/login', '/api/', '/_f/', '/phipop'] }], sitemap: `${ORIGIN}/sitemap.xml`, host: ORIGIN };
}
