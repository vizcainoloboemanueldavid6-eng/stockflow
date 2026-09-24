'use client';

import { Check } from 'lucide-react';
import { useTheme } from '@/components/theme/theme-provider';
import { THEME_OPTIONS } from '@/components/theme/theme-toggle';
import { cn } from '@/lib/utils';

const DESCRIPTIONS = {
  light: 'Bright background, best in well-lit rooms.',
  dark: 'Dim background, easier on the eyes at night.',
  system: 'Follows your device setting automatically.',
} as const;

/** Light / dark / system as three selectable cards; stored in this browser. */
export function ThemePicker() {
  const { theme, setTheme } = useTheme();
  return (
    <div role="radiogroup" aria-label="Theme" className="grid gap-3 sm:grid-cols-3">
      {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
        const checked = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => setTheme(value)}
            data-testid={`theme-${value}`}
            className={cn(
              'relative flex flex-col items-start gap-2 rounded-lg border p-4 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
              checked ? 'border-primary bg-primary/5' : 'hover:bg-muted/60',
            )}
          >
            <span
              className={cn(
                'flex size-9 items-center justify-center rounded-md',
                checked ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
              )}
              aria-hidden="true"
            >
              <Icon className="size-4" />
            </span>
            <span className="font-medium">{label}</span>
            <span className="text-xs text-muted-foreground">{DESCRIPTIONS[value]}</span>
            {checked && (
              <Check className="absolute right-3 top-3 size-4 text-link" aria-hidden="true" />
            )}
          </button>
        );
      })}
    </div>
  );
}
