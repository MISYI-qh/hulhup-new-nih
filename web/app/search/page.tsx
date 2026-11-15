import type { Metadata } from 'next';
import { SearchScreen } from '@/components/screens1';
export const metadata: Metadata = { title: 'Cari', alternates: { canonical: '/search' } };
export default function Page() { return <SearchScreen />; }
