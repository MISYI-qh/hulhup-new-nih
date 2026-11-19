import type { Metadata, Viewport } from 'next';
import './app.css';
import './intro.css';
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

const CRIT = '@font-face{font-family:Outfit;font-weight:400;font-display:swap;src:url(/fonts/outfit-400.woff2) format("woff2")}@font-face{font-family:Outfit;font-weight:700;font-display:swap;src:url(/fonts/outfit-700.woff2) format("woff2")}html{background:#fff;color:#111}@media(prefers-color-scheme:dark){html:not([data-theme=light]){background:#0b0b0b;color:#f2f2f2}}html[data-theme=dark]{background:#0b0b0b;color:#f2f2f2}html[data-theme=light]{color:#111}body{margin:0}.splash{position:fixed;inset:0;z-index:100;background:inherit;color:inherit;transition:opacity .3s cubic-bezier(.4,0,.2,1),visibility 0s .3s}.splash.out{opacity:0;visibility:hidden;pointer-events:none}';
const NI = "try{if(sessionStorage.getItem('hi')||matchMedia('(prefers-reduced-motion:reduce)').matches)document.documentElement.classList.add('ni');else sessionStorage.setItem('hi','1')}catch(e){}";
export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head><style dangerouslySetInnerHTML={{ __html: CRIT }} /><script dangerouslySetInnerHTML={{ __html: NI }} />
        <link rel="preload" href="/fonts/outfit-700.woff2" as="font" type="font/woff2" crossOrigin="" /><link rel="preload" href="/fonts/outfit-400.woff2" as="font" type="font/woff2" crossOrigin="" />
        <link rel="preconnect" href={API} crossOrigin="" /><link rel="dns-prefetch" href={API} /></head>
      <body>
        <div id="splash" className="splash" aria-hidden="true">
          <svg className="iw-wave" viewBox="0 0 420 420"><circle className="w0" cx="210" cy="210" r="210" /><circle className="w1" cx="210" cy="210" r="210" /></svg>
          <div className="iw"><div className="iw-mk">
            <div className="iw-clip"><div className="iw-eg"><i className="iw-e a" /><i className="iw-e b" /><i className="iw-p a" /><i className="iw-p b" /></div></div>
            <i className="iw-w" /></div>
            {['H', 'u', 'l', 'h', 'u', 'p'].map((c, i) => <span key={i} className={`iw-l iw-l${i}`}><span className="iw-word">{c}</span></span>)}
          </div></div>
        <Boot />
        {children}
      </body>
    </html>
  );
}
