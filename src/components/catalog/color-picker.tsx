'use client';

import * as React from 'react';
import { Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { CATEGORY_COLORS } from '@/lib/constants';
import { cn } from '@/lib/utils';

/**
 * Category colour: ten preset swatches (a radio group, arrow keys move between
 * them) plus any custom colour through the native picker or a hex code.
 */
export function ColorPicker({
  value,
  onChange,
  id,
  invalid = false,
  ...rest
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  invalid?: boolean;
  'aria-describedby'?: string;
}) {
  const normalized = value.toUpperCase();
  const isPreset = (CATEGORY_COLORS as readonly string[]).includes(normalized);
  const validHex = /^#[0-9A-F]{6}$/.test(normalized);
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    const step =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + CATEGORY_COLORS.length) % CATEGORY_COLORS.length;
    onChange(CATEGORY_COLORS[next]!);
    refs.current[next]?.focus();
  }

  return (
    <div className="space-y-3">
      <div
        role="radiogroup"
        aria-label="Preset colours"
        className="flex flex-wrap gap-2"
        id={id}
        aria-describedby={rest['aria-describedby']}
      >
        {CATEGORY_COLORS.map((color, index) => {
          const checked = normalized === color;
          const focusable = checked || (!isPreset && index === 0);
          return (
            <button
              key={color}
              ref={(node) => {
                refs.current[index] = node;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={color}
              tabIndex={focusable ? 0 : -1}
              onClick={() => onChange(color)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cn(
                'flex size-8 items-center justify-center rounded-full outline-none ring-offset-2 ring-offset-background transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring',
                checked && 'ring-2 ring-foreground',
              )}
              style={{ backgroundColor: color }}
            >
              {checked && <Check className="size-4 text-white" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <label className="relative size-9 shrink-0 cursor-pointer overflow-hidden rounded-md border border-input">
          <span className="sr-only">Custom colour</span>
          <input
            type="color"
            value={validHex ? normalized.toLowerCase() : '#2563eb'}
            onChange={(event) => onChange(event.target.value.toUpperCase())}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
          <span
            className="block size-full"
            style={{ backgroundColor: validHex ? normalized : 'transparent' }}
            aria-hidden="true"
          />
        </label>
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value.trim())}
          maxLength={7}
          spellCheck={false}
          aria-label="Hex colour code"
          aria-invalid={invalid || undefined}
          className="w-28 font-mono uppercase"
          placeholder="#2563EB"
        />
        <span className="text-xs text-muted-foreground">Or pick any colour</span>
      </div>
    </div>
  );
}
