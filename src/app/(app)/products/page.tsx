import type { Metadata } from 'next';
import { SectionPlaceholder } from '@/components/layout/section-placeholder';
import { requirePagePermission } from '@/lib/actions/guard';

export const metadata: Metadata = { title: 'Products' };

export default async function Page() {
  await requirePagePermission('product:view');
  return <SectionPlaceholder href="/products" />;
}
