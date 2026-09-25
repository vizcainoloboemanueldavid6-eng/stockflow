'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { LoaderCircle, Monitor, Moon, Package, Sun } from 'lucide-react';
import { useTheme } from '@/components/theme/theme-provider';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { useProductSearch } from '@/hooks/use-product-search';
import { type Role, stockStatus } from '@/lib/constants';
import { ALL_NAV_ITEMS } from '@/lib/navigation';
import { can } from '@/lib/permissions';
import { Swap } from '@/lib/safe-text';
import { cn } from '@/lib/utils';

function matches(query: string, ...fields: (string | undefined)[]) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some((field) => field?.toLowerCase().includes(q));
}

/**
 * Ctrl/Cmd+K palette: jump to pages (filtered locally, respecting the role) and
 * to products (searched on the server by name or SKU).
 */
export function CommandPalette({
  open,
  onOpenChange,
  role,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: Role;
}) {
  const router = useRouter();
  const { setTheme } = useTheme();
  const [query, setQuery] = React.useState('');
  const canSearchProducts = can(role, 'product:view');
  const { results, loading, failed } = useProductSearch(query, open && canSearchProducts);

  React.useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const pages = ALL_NAV_ITEMS.filter(
    (item) =>
      (!item.permission || can(role, item.permission)) &&
      matches(query, item.label, item.description, ...(item.keywords ?? [])),
  );

  const themeActions = [
    { value: 'light' as const, label: 'Switch to light theme', icon: Sun },
    { value: 'dark' as const, label: 'Switch to dark theme', icon: Moon },
    { value: 'system' as const, label: 'Use the system theme', icon: Monitor },
  ].filter((action) => matches(query, action.label, 'theme', 'appearance', 'mode'));

  function run(action: () => void) {
    onOpenChange(false);
    action();
  }

  const nothing = !pages.length && !themeActions.length && !results.length && !loading;

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      shouldFilter={false}
      title="Search StockFlow"
      description="Jump to a page or find a product by name or SKU."
    >
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder={canSearchProducts ? 'Search products or pages...' : 'Search pages...'}
        aria-label="Search products or pages"
      />
      <CommandList>
        {nothing && (
          <CommandEmpty>
            <Swap>
              {failed ? 'Search is unavailable right now.' : `No results for "${query.trim()}".`}
            </Swap>
          </CommandEmpty>
        )}

        {query.trim() && canSearchProducts && (loading || results.length > 0) && (
          <CommandGroup heading="Products">
            {loading && !results.length && (
              <CommandItem disabled value="__loading">
                <LoaderCircle className="animate-spin" aria-hidden="true" />
                Searching...
              </CommandItem>
            )}
            {results.map((product) => {
              const status = stockStatus(product.quantity, product.reorderLevel);
              return (
                <CommandItem
                  key={product.id}
                  value={`product-${product.id}`}
                  onSelect={() => run(() => router.push(`/products/${product.id}`))}
                >
                  <Package aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{product.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{product.sku}</span>
                  <span
                    className={cn(
                      'shrink-0 whitespace-nowrap text-right text-xs tabular-nums',
                      status === 'in_stock' ? 'text-muted-foreground' : 'font-medium text-warning',
                      status === 'out_of_stock' && 'text-destructive dark:text-red-400',
                    )}
                  >
                    <Swap>{`${product.quantity} in stock`}</Swap>
                  </span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {pages.length > 0 && (
          <CommandGroup heading="Pages">
            {pages.map((item) => {
              const Icon = item.icon;
              return (
                <CommandItem
                  key={item.href}
                  value={`page-${item.href}`}
                  onSelect={() => run(() => router.push(item.href))}
                >
                  <Icon aria-hidden="true" />
                  <span>{item.label}</span>
                  <span className="ml-auto hidden truncate text-xs text-muted-foreground sm:inline">
                    {item.description}
                  </span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {themeActions.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Appearance">
              {themeActions.map(({ value, label, icon: Icon }) => (
                <CommandItem
                  key={value}
                  value={`theme-${value}`}
                  onSelect={() => run(() => setTheme(value))}
                >
                  <Icon aria-hidden="true" />
                  {label}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
      <div className="flex items-center justify-between gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
        <span>
          <kbd className="rounded border bg-muted px-1 font-sans">Enter</kbd> to open
        </span>
        <span>
          <kbd className="rounded border bg-muted px-1 font-sans">Esc</kbd> to close
        </span>
      </div>
    </CommandDialog>
  );
}
