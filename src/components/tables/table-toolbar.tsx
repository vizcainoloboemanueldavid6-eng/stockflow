'use client';

import * as React from 'react';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

/** Radix Select cannot hold an empty value, so "no filter" travels as this sentinel. */
const ALL = '__all';

/** Filters above a table: two columns on phones (search spans both), one wrapping row from `sm`. */
export function TableToolbar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role="search"
      className={cn(
        'mb-3 grid grid-cols-2 gap-2 sm:flex sm:flex-row sm:flex-wrap sm:items-center',
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Search box that reports its value after the user pauses typing (300 ms), so the
 * URL - and the server query - is not updated on every keystroke. Follows the URL
 * when it changes from elsewhere (e.g. "Clear filters").
 */
export function DebouncedSearchInput({
  value,
  onChange,
  placeholder,
  label,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  className?: string;
}) {
  const [draft, setDraft] = React.useState(value);
  const latest = React.useRef(onChange);
  latest.current = onChange;

  React.useEffect(() => setDraft(value), [value]);

  React.useEffect(() => {
    if (draft.trim() === value.trim()) return;
    const timer = window.setTimeout(() => latest.current(draft), 300);
    return () => window.clearTimeout(timer);
  }, [draft, value]);

  return (
    <div className={cn('relative col-span-2 w-full sm:w-64', className)}>
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        type="search"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') latest.current(draft);
        }}
        placeholder={placeholder}
        aria-label={label}
        className="pl-8 pr-8 [&::-webkit-search-cancel-button]:hidden"
      />
      {draft && (
        <button
          type="button"
          onClick={() => {
            setDraft('');
            latest.current('');
          }}
          className="absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Clear search"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export type FilterOption = { value: string; label: string; swatch?: string };

/** A Select whose first entry means "no filter" (`value` undefined). */
export function FilterSelect({
  value,
  onChange,
  options,
  allLabel,
  label,
  className,
  extraOptions,
}: {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  options: FilterOption[];
  allLabel: string;
  label: string;
  className?: string;
  /** Options listed after a separator (e.g. "No supplier"). */
  extraOptions?: FilterOption[];
}) {
  return (
    <Select
      value={value ?? ALL}
      onValueChange={(next) => onChange(next === ALL ? undefined : next)}
    >
      <SelectTrigger
        aria-label={label}
        className={cn('w-full sm:w-44', value && 'border-primary/50', className)}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        <SelectSeparator />
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.swatch && (
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: option.swatch }}
                aria-hidden="true"
              />
            )}
            {option.label}
          </SelectItem>
        ))}
        {extraOptions?.length ? (
          <>
            <SelectSeparator />
            {extraOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </>
        ) : null}
      </SelectContent>
    </Select>
  );
}

export function ClearFiltersButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className="col-span-2 h-9 justify-self-start sm:self-auto"
    >
      <X aria-hidden="true" />
      Clear filters
    </Button>
  );
}
