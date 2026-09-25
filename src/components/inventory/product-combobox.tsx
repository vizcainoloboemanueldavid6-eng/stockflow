'use client';

import * as React from 'react';
import { Check, ChevronsUpDown, LoaderCircle, Package } from 'lucide-react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { type ProductSearchHit, useProductSearch } from '@/hooks/use-product-search';
import { stockStatus } from '@/lib/constants';
import { formatNumber } from '@/lib/format';
import { Swap } from '@/lib/safe-text';
import { cn } from '@/lib/utils';

/**
 * Searchable product picker (name or SKU) for the movement form. Results come
 * from the guarded GET /api/search route, so it scales past a few hundred
 * products and never lists archived ones. Keyboard: type, arrows, Enter.
 */
export function ProductCombobox({
  value,
  onChange,
  disabled = false,
  invalid = false,
  ...triggerProps
}: {
  value: ProductSearchHit | null;
  onChange: (product: ProductSearchHit | null) => void;
  disabled?: boolean;
  invalid?: boolean;
} & Omit<React.ComponentProps<'button'>, 'value' | 'onChange'>) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const popupId = React.useId();
  const { results, loading, failed } = useProductSearch(query, open);

  React.useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const trimmed = query.trim();

  return (
    // `modal` keeps scrolling and focus working when the picker opens inside a Dialog.
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={popupId}
          aria-haspopup="listbox"
          aria-invalid={invalid || undefined}
          disabled={disabled}
          data-testid="product-combobox"
          {...triggerProps}
          className={cn(
            'flex h-auto min-h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-left text-sm shadow-sm ring-offset-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive',
            triggerProps.className,
          )}
        >
          {/* Keyed: a new pick replaces the whole label (safe with browser translation). */}
          {value ? (
            <span key={`${value.id}:${value.quantity}`} className="flex min-w-0 flex-col">
              <span className="truncate font-medium">{value.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                <span className="font-mono">{value.sku}</span>
                {` · ${formatNumber(value.quantity)} in stock`}
              </span>
            </span>
          ) : (
            <span key="placeholder" className="text-muted-foreground">
              Search by name or SKU...
            </span>
          )}
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        id={popupId}
        className="w-[var(--radix-popover-trigger-width)] min-w-[18rem] p-0"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Product name or SKU..."
            aria-label="Search products"
          />
          <CommandList>
            {!trimmed && (
              <p className="px-3 py-5 text-center text-sm text-muted-foreground">
                Start typing to find a product.
              </p>
            )}
            {trimmed && loading && !results.length && (
              <p className="flex items-center justify-center gap-2 px-3 py-5 text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                Searching...
              </p>
            )}
            {trimmed && !loading && (
              <CommandEmpty>
                <Swap>
                  {failed
                    ? 'Search is unavailable right now.'
                    : `No active product matches "${trimmed}".`}
                </Swap>
              </CommandEmpty>
            )}
            {results.length > 0 && (
              <CommandGroup heading="Products">
                {results.map((product) => {
                  const status = stockStatus(product.quantity, product.reorderLevel);
                  const selected = value?.id === product.id;
                  return (
                    <CommandItem
                      key={product.id}
                      value={product.id}
                      onSelect={() => {
                        onChange(product);
                        setOpen(false);
                      }}
                    >
                      <Package aria-hidden="true" />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate">{product.name}</span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {product.sku}
                        </span>
                      </span>
                      <span
                        className={cn(
                          'shrink-0 text-xs tabular-nums',
                          status === 'in_stock'
                            ? 'text-muted-foreground'
                            : 'font-medium text-warning',
                          status === 'out_of_stock' && 'text-destructive dark:text-red-400',
                        )}
                      >
                        <Swap>{`${formatNumber(product.quantity)} in stock`}</Swap>
                      </span>
                      <Check
                        className={cn('size-4', selected ? 'opacity-100' : 'opacity-0')}
                        aria-hidden="true"
                      />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
