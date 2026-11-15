import type { Metadata } from 'next';
import { TextScreen } from '@/components/screens3';
export const metadata: Metadata = { title: 'Tentang', alternates: { canonical: '/about' } };
export default function Page() { return <TextScreen k="about" />; }
