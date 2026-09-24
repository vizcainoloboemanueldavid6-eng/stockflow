import type { Metadata } from 'next';
import { SectionPlaceholder } from '@/components/layout/section-placeholder';
import { requirePagePermission } from '@/lib/actions/guard';

export const metadata: Metadata = { title: 'Movements' };

export default async function Page() {
  await requirePagePermission('movement:view');
  return <SectionPlaceholder href="/movements" />;
}
