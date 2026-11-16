import type { Metadata, Viewport } from 'next';
import './app.css';
import { Boot } from '@/components/shell';
import { ORIGIN, API } from '@/lib/api';

export const metadata: Metadata = {
  metadataBase: new URL(ORIGIN),
  title: { default: 'Hulhup — ketuk, dengarkan suara acak', template: '%s · Hulhup' },
  description: 'Hulhup: ketuk satu tombol, dengarkan suara singkat (maks 15 detik) atau tulisan acak dari orang lain. Kamu yang mengatur siapa boleh melihat post-mu. Produk Misyi.',
  applicationName: 'Hulhup',
  alternates: { canonical: '/' },
  robots: { index: true, follow: true, 'max-image-preview': 'large' },
  openGraph: { type: 'website', siteName: 'Hulhup', locale: 'id_ID', images: [{ url: '/icons/Icon-512.png', width: 512, height: 512 }] },
  twitter: { card: 'summary' },
  icons: { icon: '/icons/Icon-192.png', apple: '/icons/Icon-192.png' },
};
export const viewport: Viewport = { themeColor: '#0B0B0B', colorScheme: 'light dark', width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <head><link rel="preconnect" href={API} crossOrigin="" /><link rel="dns-prefetch" href={API} /></head>
      <body>
        <div className="splash" aria-hidden="true"><svg className="mark" width={112} height={78} viewBox="0 0 72 50" aria-hidden="true"><g><ellipse cx="21" cy="19" rx="12.5" ry="15" fill="var(--mk-eye)"/><ellipse cx="51" cy="19" rx="12.5" ry="15" fill="var(--mk-eye)"/><circle cx="23.2" cy="15.5" r="5.5" fill="var(--mk-pup)"/><circle cx="53.2" cy="15.5" r="5.5" fill="var(--mk-pup)"/></g><rect x="0" y="25" width="72" height="21" rx="7" fill="#4330D0"/></svg></div>
        <Boot />
        {children}
      </body>
    </html>
  );
}
