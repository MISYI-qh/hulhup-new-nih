import Link from 'next/link';
export const metadata = { title: 'Tidak ditemukan', robots: { index: false } };
export default function NotFound() {
  return <section className="hero"><h1>Halaman tidak ditemukan</h1><p><Link href="/" className="pill dark">Ke beranda</Link></p></section>;
}
