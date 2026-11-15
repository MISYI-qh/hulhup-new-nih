import type { Metadata } from 'next';
import { SentScreen } from '@/components/screens1';
export const metadata: Metadata = { title: 'Terkirim', robots: { index: false } };
export default function Page() { return <SentScreen />; }
