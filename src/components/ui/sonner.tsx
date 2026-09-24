'use client';

import { Toaster as Sonner, type ToasterProps } from 'sonner';
import { useTheme } from '@/components/theme/theme-provider';

/**
 * Toasts (shadcn/ui's current toast component is Sonner; the older Radix
 * `toast` is deprecated upstream). Trigger them anywhere on the client with
 * `import { toast } from 'sonner'` -> toast.success('Saved') / toast.error(msg).
 */
function Toaster(props: ToasterProps) {
  const { resolvedTheme } = useTheme();
  return (
    <Sonner
      theme={resolvedTheme}
      position="bottom-right"
      closeButton
      richColors
      className="toaster group"
      toastOptions={{ duration: 4500 }}
      style={
        {
          '--normal-bg': 'hsl(var(--popover))',
          '--normal-text': 'hsl(var(--popover-foreground))',
          '--normal-border': 'hsl(var(--border))',
        } as React.CSSProperties
      }
      {...props}
    />
  );
}

export { Toaster };
