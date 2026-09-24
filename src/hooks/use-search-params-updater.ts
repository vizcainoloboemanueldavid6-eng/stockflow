'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { nextSearch, type SearchUpdates } from '@/lib/search-params';

/**
 * Drives a server-rendered table from the URL: `update({ status: 'low_stock' })`
 * replaces the query string (dropping defaults, back to page 1 when a filter
 * changes) inside a transition, so the current rows stay on screen - dimmed via
 * `isPending` - until the server sends the new page.
 */
export function useSearchParamsUpdater(defaults: Record<string, string | number> = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = React.useTransition();
  const defaultsKey = JSON.stringify(defaults);

  const update = React.useCallback(
    (updates: SearchUpdates) => {
      const search = nextSearch(searchParams.toString(), updates, JSON.parse(defaultsKey));
      startTransition(() => {
        router.replace(`${pathname}${search}`, { scroll: false });
      });
    },
    [router, pathname, searchParams, defaultsKey],
  );

  return { searchParams, update, isPending };
}
