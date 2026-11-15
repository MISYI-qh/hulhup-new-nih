import type { Metadata } from 'next';
import { NotifScreen } from '@/components/screens1';
export const metadata: Metadata = { title: 'Notifikasi', robots: { index: false } };
export default function Page() { return <NotifScreen />; }
