import type { Metadata } from 'next';
import Legal from '@/components/Legal';
export const metadata: Metadata = { title: 'Privasi', alternates: { canonical: '/privacy' } };
export default function Page() { return <Legal k="privacy" title="Privasi" />; }
