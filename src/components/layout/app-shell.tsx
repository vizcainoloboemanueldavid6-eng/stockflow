'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { Menu, Search } from 'lucide-react';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { SIDEBAR_COOKIE } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import { CommandPalette } from './command-palette';
import { SidebarNav } from './sidebar';
import { type ShellUser, UserMenu } from './user-menu';

function useIsMac() {
  const [isMac, setIsMac] = React.useState(false);
  React.useEffect(() => {
    setIsMac(/Mac|iPhone|iPad/.test(navigator.userAgent));
  }, []);
  return isMac;
}

/**
 * Authenticated application frame:
 *  - desktop: sticky sidebar that collapses to icons (state kept in a cookie so the
 *    server renders the right width; Ctrl/Cmd+B toggles it);
 *  - phones and tablets (< lg): the same navigation in a left drawer (a fixed 240px
 *    sidebar would leave a portrait tablet only ~480px for the tables);
 *  - topbar: drawer button, global search (Ctrl/Cmd+K), theme and account menus.
 */
export function AppShell({
  user,
  defaultCollapsed,
  children,
}: {
  user: ShellUser;
  defaultCollapsed: boolean;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = React.useState(defaultCollapsed);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const pathname = usePathname();
  const isMac = useIsMac();

  const toggleCollapsed = React.useCallback(() => {
    setCollapsed((value) => {
      const next = !value;
      document.cookie = `${SIDEBAR_COOKIE}=${next ? 'collapsed' : 'expanded'}; path=/; max-age=31536000; samesite=lax`;
      return next;
    });
  }, []);

  // Close the drawer after navigating.
  React.useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 'k') {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      } else if (key === 'b') {
        event.preventDefault();
        toggleCollapsed();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleCollapsed]);

  return (
    <div className="flex min-h-dvh w-full">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>

      <aside
        data-collapsed={collapsed}
        className={cn(
          'sticky top-0 hidden h-dvh shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-out lg:block',
          collapsed ? 'w-16' : 'w-60',
        )}
      >
        <SidebarNav role={user.role} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 gap-0 bg-sidebar p-0 text-sidebar-foreground">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">Main navigation menu</SheetDescription>
          <SidebarNav role={user.role} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:px-4 lg:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            data-testid="open-navigation"
          >
            <Menu aria-hidden="true" />
          </Button>

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border border-input bg-muted/40 px-3 text-sm text-muted-foreground shadow-sm outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring sm:max-w-sm"
            aria-label="Search products and pages"
            aria-keyshortcuts={isMac ? 'Meta+K' : 'Control+K'}
            data-testid="open-search"
          >
            <Search className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">Search products and pages...</span>
            <kbd className="ml-auto hidden shrink-0 rounded border bg-background px-1.5 py-0.5 font-sans text-[11px] font-medium sm:inline">
              {isMac ? '⌘ K' : 'Ctrl K'}
            </kbd>
          </button>

          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <UserMenu user={user} />
          </div>
        </header>

        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 px-4 py-6 outline-none sm:px-6 lg:px-8"
        >
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} role={user.role} />
    </div>
  );
}
