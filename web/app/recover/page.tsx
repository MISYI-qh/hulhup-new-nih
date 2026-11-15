import type { Metadata } from 'next';
import { RecoverScreen } from '@/components/screens1';
export const metadata: Metadata = { title: 'Lupa kata sandi', robots: { index: false } };
export default function Page() { return <RecoverScreen />; }
