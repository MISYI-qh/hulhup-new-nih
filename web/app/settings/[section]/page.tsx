import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SettingsScreen } from '@/components/screens2';
export const metadata: Metadata = { title: 'Pengaturan', robots: { index: false } };
export default async function Page({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!['account', 'notifications', 'language', 'appearance', 'security'].includes(section)) notFound();
  return <SettingsScreen section={section} />;
}
