import type { Metadata } from 'next';
import { AdminScreen } from '@/components/admin';
export const metadata: Metadata = { title: 'Admin', robots: { index: false } };
export default function Page() { return <AdminScreen />; }
