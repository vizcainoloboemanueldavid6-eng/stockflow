import { EmptyState } from '@/components/layout/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { ALL_NAV_ITEMS } from '@/lib/navigation';

/**
 * Stage-1 stand-in for a feature page (the pages themselves are built in stage 2,
 * which replaces each page.tsx that renders this component - see DECISIONS.md).
 */
export function SectionPlaceholder({ href }: { href: string }) {
  const item = ALL_NAV_ITEMS.find((entry) => entry.href === href);
  return (
    <>
      <PageHeader title={item?.label ?? 'StockFlow'} description={item?.description} />
      <EmptyState
        title={`${item?.label ?? 'This section'} is being set up`}
        description="The navigation, sign-in and data layer are ready; this screen is added in the next build stage."
      />
    </>
  );
}
