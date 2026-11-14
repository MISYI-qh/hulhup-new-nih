import type { Metadata } from 'next';
import Legal from '@/components/Legal';
export const metadata: Metadata = { title: 'Ketentuan', alternates: { canonical: '/policy' } };
export default function Page() { return <Legal k="policy" title="Ketentuan" />; }
