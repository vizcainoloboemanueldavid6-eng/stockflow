import type { Metadata } from 'next';
import { SectionPlaceholder } from '@/components/layout/section-placeholder';
import { requirePagePermission } from '@/lib/actions/guard';

export const metadata: Metadata = { title: 'Product' };

export default async function Page() {
  await requirePagePermission('product:view');
  return <SectionPlaceholder href="/products" />;
}
