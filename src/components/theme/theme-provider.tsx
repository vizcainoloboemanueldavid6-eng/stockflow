'use client';

import * as React from 'react';

/**
 * Light / dark / system theme with no flash of the wrong theme:
 *  - THEME_SCRIPT runs inline in <head> before first paint and sets the `dark`
 *    class from localStorage (or the OS preference);
 *  - this provider only mirrors that state for React and applies later changes.
 * Components that merely need to *look* different per theme should use Tailwind
 * `dark:` classes, not this hook, so the server HTML is already correct.
 */
export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'stockflow-theme';

/** Inlined in the root layout <head>. Keep it tiny and dependency-free. */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');var d=t==='dark'||((t!=='light')&&window.matchMedia('(prefers-color-scheme: dark)').matches);var e=document.documentElement;e.classList.toggle('dark',d);e.style.colorScheme=d?'dark':'light';}catch(_){}})();`;

type ThemeContextValue = {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
};

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

function readStoredTheme(): Theme {
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyTheme(resolved: ResolvedTheme) {
  const root = document.documentElement;
  // Suppress transitions for the frame in which the palette swaps.
  root.classList.add('[&_*]:!transition-none');
  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;
  window.requestAnimationFrame(() => root.classList.remove('[&_*]:!transition-none'));
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Server render and first client render agree on 'system'/'light'; the effect
  // below syncs with what the inline script already applied to <html>.
  const [theme, setThemeState] = React.useState<Theme>('system');
  const [resolvedTheme, setResolvedTheme] = React.useState<ResolvedTheme>('light');

  React.useEffect(() => {
    const stored = readStoredTheme();
    setThemeState(stored);
    setResolvedTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light');
  }, []);

  // Follow the OS while in "system" mode.
  React.useEffect(() => {
    if (theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const next: ResolvedTheme = media.matches ? 'dark' : 'light';
      applyTheme(next);
      setResolvedTheme(next);
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);

  // Keep several tabs in sync.
  React.useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) return;
      const next = readStoredTheme();
      const resolved: ResolvedTheme =
        next === 'dark' || (next === 'system' && systemPrefersDark()) ? 'dark' : 'light';
      applyTheme(resolved);
      setThemeState(next);
      setResolvedTheme(resolved);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setTheme = React.useCallback((next: Theme) => {
    try {
      if (next === 'system') window.localStorage.removeItem(THEME_STORAGE_KEY);
      else window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage can be unavailable (private mode); the choice still applies to this page.
    }
    const resolved: ResolvedTheme =
      next === 'dark' || (next === 'system' && systemPrefersDark()) ? 'dark' : 'light';
    applyTheme(resolved);
    setThemeState(next);
    setResolvedTheme(resolved);
  }, []);

  const value = React.useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = React.useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside <ThemeProvider>');
  return context;
}
