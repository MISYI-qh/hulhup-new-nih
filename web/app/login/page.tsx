import type { Metadata } from 'next';
import { AuthScreen } from '@/components/screens1';
export const metadata: Metadata = { title: 'Masuk', robots: { index: false }, alternates: { canonical: '/login' } };
export default function Page() { return <AuthScreen />; }
