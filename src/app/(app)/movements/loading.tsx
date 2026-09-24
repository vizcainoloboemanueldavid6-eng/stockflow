import { PageSkeleton } from '@/components/layout/page-skeleton';

export default function MovementsLoading() {
  return <PageSkeleton cards={0} rows={10} toolbar />;
}
