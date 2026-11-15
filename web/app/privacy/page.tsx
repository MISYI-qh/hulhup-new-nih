import type { Metadata } from 'next';
import { TextScreen } from '@/components/screens3';
export const metadata: Metadata = { title: 'Privasi', alternates: { canonical: '/privacy' } };
export default function Page() { return <TextScreen k="privacy" />; }
