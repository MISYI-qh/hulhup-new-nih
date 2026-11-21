import type { Metadata } from 'next';
import { PhipopScreen } from '@/components/phipop';
export const metadata: Metadata = { title: 'Phipop', robots: { index: false } };
export default function Page() { return <PhipopScreen />; }
