import type { Metadata } from 'next';
import { SectionPlaceholder } from '@/components/layout/section-placeholder';
import { requirePagePermission } from '@/lib/actions/guard';

export const metadata: Metadata = { title: 'Reports' };

export default async function Page() {
  await requirePagePermission('report:view');
  return <SectionPlaceholder href="/reports" />;
}
