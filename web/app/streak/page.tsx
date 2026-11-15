import type { Metadata } from 'next';
import { StreakScreen } from '@/components/screens1';
export const metadata: Metadata = { title: 'Kalender hari masuk', robots: { index: false } };
export default function Page() { return <StreakScreen />; }
