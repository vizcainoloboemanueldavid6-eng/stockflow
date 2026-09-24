'use client';

import * as React from 'react';

export type ProductSearchHit = {
  id: string;
  sku: string;
  name: string;
  quantity: number;
  reorderLevel: number;
};

/**
 * Debounced product search (name or SKU, non-archived) against the guarded
 * GET /api/search route. Used by the command palette and the movement form's
 * product combobox. In-flight requests are aborted when the query changes.
 */
export function useProductSearch(query: string, enabled: boolean) {
  const [results, setResults] = React.useState<ProductSearchHit[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    const q = query.trim();
    if (!enabled || !q) {
      setResults([]);
      setLoading(false);
      setFailed(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
          headers: { accept: 'application/json' },
        });
        if (!response.ok) throw new Error(String(response.status));
        const body = (await response.json()) as { products: ProductSearchHit[] };
        setResults(body.products);
        setFailed(false);
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        setResults([]);
        setFailed(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, enabled]);

  return { results, loading, failed };
}
