import type { Metadata } from 'next';
import Legal from '@/components/Legal';
export const metadata: Metadata = { title: 'Tentang', alternates: { canonical: '/about' } };
export default function Page() { return <Legal k="about" title="Tentang" />; }
