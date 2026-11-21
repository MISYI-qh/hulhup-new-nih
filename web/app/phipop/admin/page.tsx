import type { Metadata } from 'next';
import { PhipopAdmin } from '@/components/phipop';
export const metadata: Metadata = { title: 'Kelola Phipop', robots: { index: false } };
export default function Page() { return <PhipopAdmin />; }
