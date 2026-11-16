// Berkas pembaruan aplikasi: hanya untuk aplikasi terpasang (membawa kunci). Selain itu 404, seolah tidak ada.
// __DL_KEY__ dan __DL_DIR__ diisi saat deploy (CI); di repo tetap kosong.
import { NextRequest } from 'next/server';
export const dynamic = 'force-dynamic';
const KEY = '__DL_KEY__', DIR = '__DL_DIR__';
export function GET(req: NextRequest) {
  // Lewat rewrite, query tidak ikut di req.url, jadi nama berkas diambil dari path asli.
  const base = req.nextUrl.pathname.split('/').pop() || '';
  const f = req.nextUrl.searchParams.get('f') || (base === 'hulhup-32.apk' ? 'hulhup.apk' : base);
  const ok = req.headers.get('x-hulhup-key') === KEY && KEY.length > 8 && !KEY.startsWith('__');
  const h = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };
  if (!ok || (f !== 'hulhup.apk' && f !== 'version.json')) return new Response('Not found', { status: 404, headers: { ...h, 'Content-Type': 'text/plain; charset=utf-8' } });
  return new Response(null, { status: 302, headers: { ...h, Location: `/_f/${DIR}/${f}` } });
}
