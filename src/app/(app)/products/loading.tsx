import { PageSkeleton } from '@/components/layout/page-skeleton';

export default function ProductsLoading() {
  return <PageSkeleton cards={0} rows={10} toolbar />;
}
