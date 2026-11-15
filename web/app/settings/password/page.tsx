import type { Metadata } from 'next';
import { PwScreen } from '@/components/screens2';
export const metadata: Metadata = { title: 'Ganti kata sandi', robots: { index: false } };
export default function Page() { return <PwScreen />; }
