import type { Metadata } from 'next';
import { ComposeScreen } from '@/components/postpage';
export const metadata: Metadata = { title: 'Buat post', robots: { index: false } };
export default function Page() { return <ComposeScreen />; }
