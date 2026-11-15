import type { Metadata } from 'next';
import { SettingsScreen } from '@/components/screens2';
export const metadata: Metadata = { title: 'Pengaturan', robots: { index: false } };
export default function Page() { return <SettingsScreen />; }
