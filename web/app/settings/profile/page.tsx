import type { Metadata } from 'next';
import { EditProfileScreen } from '@/components/screens2';
export const metadata: Metadata = { title: 'Edit profil', robots: { index: false } };
export default function Page() { return <EditProfileScreen />; }
