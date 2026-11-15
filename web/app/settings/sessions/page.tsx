import type { Metadata } from 'next';
import { SessionsScreen } from '@/components/screens2';
export const metadata: Metadata = { title: 'Sesi', robots: { index: false } };
export default function Page() { return <SessionsScreen />; }
