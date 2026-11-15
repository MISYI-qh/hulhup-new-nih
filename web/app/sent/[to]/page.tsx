import type { Metadata } from 'next';
import { SentScreen } from '@/components/screens1';
export const metadata: Metadata = { title: 'Terkirim', robots: { index: false } };
export default async function Page({ params }: { params: Promise<{ to: string }> }) { const { to } = await params; return <SentScreen to={decodeURIComponent(to)} />; }
