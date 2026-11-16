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

const CRIT = 'html{background:#fff}@media(prefers-color-scheme:dark){html:not([data-theme=light]){background:#0b0b0b}}html[data-theme=dark]{background:#0b0b0b}body{margin:0}.splash{position:fixed;inset:0;z-index:100;display:grid;place-items:center;background:inherit;transition:opacity .45s ease,visibility .45s}.splash.out{opacity:0;visibility:hidden}.splash svg{animation:sfi .5s ease both}@keyframes sfi{from{opacity:0;transform:scale(.94)}}.se{fill:#5b47f5}.sp{fill:#fff}.sw{fill:#4330d0}@media(prefers-color-scheme:dark){html:not([data-theme=light]) .se{fill:#fff}html:not([data-theme=light]) .sp,html:not([data-theme=light]) .sw{fill:#5b47f5}}';
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <head><style dangerouslySetInnerHTML={{ __html: CRIT }} /><link rel="preconnect" href={API} crossOrigin="" /><link rel="dns-prefetch" href={API} /></head>
      <body>
        <div id="splash" className="splash" aria-hidden="true">
          <svg viewBox="-.36 -.3 .72 .51" width="132" height="94">
            <clipPath id="sc"><rect x="-1" y="-1" width="2" height="1.21" /></clipPath>
            <g clipPath="url(#sc)" className="se"><ellipse cx="-.15" cy="-.06" rx=".125" ry=".15" /><ellipse cx=".15" cy="-.06" rx=".125" ry=".15" /></g>
            <g className="sp"><circle cx="-.119" cy="-.095" r=".055" /><circle cx=".181" cy="-.095" r=".055" /></g>
            <rect className="sw" x="-.36" y="0" width=".72" height=".21" rx=".07" />
          </svg></div>
        <Boot />
        {children}
      </body>
    </html>
  );
}
