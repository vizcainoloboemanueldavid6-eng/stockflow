import type { Metadata } from 'next';
import { SectionPlaceholder } from '@/components/layout/section-placeholder';
import { requirePagePermission } from '@/lib/actions/guard';

export const metadata: Metadata = { title: 'Categories' };

export default async function Page() {
  await requirePagePermission('category:view');
  return <SectionPlaceholder href="/categories" />;
}
