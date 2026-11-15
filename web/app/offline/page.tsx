import type { Metadata } from 'next';
import { OfflineScreen } from '@/components/screens1';
export const metadata: Metadata = { title: 'Offline', robots: { index: false } };
export default function Page() { return <OfflineScreen />; }
