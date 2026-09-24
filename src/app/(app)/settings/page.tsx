import type { Metadata } from 'next';
import { SectionPlaceholder } from '@/components/layout/section-placeholder';
import { requirePagePermission } from '@/lib/actions/guard';

export const metadata: Metadata = { title: 'Settings' };

export default async function Page() {
  await requirePagePermission('profile:update');
  return <SectionPlaceholder href="/settings" />;
}
