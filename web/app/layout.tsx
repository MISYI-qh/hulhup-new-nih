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
export const viewport: Viewport = { themeColor: '#0B0B0B', colorScheme: 'light dark', width: 'device-width', initialScale: 1 };

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <head><link rel="preconnect" href={API} crossOrigin="" /><link rel="dns-prefetch" href={API} /></head>
      <body>
        <div className="splash" aria-hidden="true"><img src="/icons/Icon-192.png" alt="" width={88} height={88} style={{ borderRadius: 22 }} /></div>
        <Boot />
        {children}
      </body>
    </html>
  );
}
