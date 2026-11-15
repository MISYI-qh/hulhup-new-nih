import type { Metadata } from 'next';
import { TextScreen } from '@/components/screens3';
export const metadata: Metadata = { title: 'Ketentuan', alternates: { canonical: '/policy' } };
export default function Page() { return <TextScreen k="policy" />; }
