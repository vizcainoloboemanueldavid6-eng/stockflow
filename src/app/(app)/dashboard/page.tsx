import type { Metadata } from 'next';
import { SectionPlaceholder } from '@/components/layout/section-placeholder';
import { requirePagePermission } from '@/lib/actions/guard';

export const metadata: Metadata = { title: 'Dashboard' };

export default async function Page() {
  await requirePagePermission('dashboard:view');
  return <SectionPlaceholder href="/dashboard" />;
}
