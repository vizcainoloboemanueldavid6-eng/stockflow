import { PageSkeleton } from '@/components/layout/page-skeleton';

export default function CategoriesLoading() {
  return <PageSkeleton cards={0} rows={6} />;
}
