import type { Metadata } from 'next';
import { ProfileScreen } from '@/components/screens2';
export const metadata: Metadata = { title: 'Profil', robots: { index: false } };
export default function Page() { return <ProfileScreen username={null} />; }
