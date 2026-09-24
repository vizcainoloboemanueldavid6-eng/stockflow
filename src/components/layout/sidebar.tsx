'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Logo } from '@/components/brand/logo';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { Role } from '@/lib/constants';
import { isActivePath, NAV_SECTIONS, type NavItem, SETTINGS_ITEM } from '@/lib/navigation';
import { can } from '@/lib/permissions';
import { cn } from '@/lib/utils';

function NavLink({
  item,
  collapsed,
  active,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  active: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={cn(
        'group flex h-9 items-center gap-3 rounded-md px-2.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
        collapsed && 'justify-center px-0',
      )}
    >
      <Icon className="size-[18px] shrink-0" aria-hidden="true" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );

  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Navigation used both by the desktop sidebar (collapsible to icons) and the
 * mobile drawer (always expanded). Entries the role cannot open are hidden.
 */
export function SidebarNav({
  role,
  collapsed = false,
  onNavigate,
  onToggleCollapsed,
}: {
  role: Role;
  collapsed?: boolean;
  onNavigate?: () => void;
  onToggleCollapsed?: () => void;
}) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col">
      <div
        className={cn(
          'flex h-14 shrink-0 items-center border-b border-sidebar-border px-4',
          collapsed && 'justify-center px-0',
        )}
      >
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="StockFlow home"
        >
          <Logo collapsed={collapsed} />
        </Link>
      </div>

      <nav aria-label="Main" className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {NAV_SECTIONS.map((section) => {
          const items = section.items.filter(
            (item) => !item.permission || can(role, item.permission),
          );
          if (!items.length) return null;
          return (
            <div key={section.label} className="space-y-1">
              {collapsed ? (
                <div className="mx-auto mb-2 h-px w-6 bg-sidebar-border" aria-hidden="true" />
              ) : (
                <p className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {section.label}
                </p>
              )}
              <ul className="space-y-1">
                {items.map((item) => (
                  <li key={item.href}>
                    <NavLink
                      item={item}
                      collapsed={collapsed}
                      active={isActivePath(pathname, item.href)}
                      onNavigate={onNavigate}
                    />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="space-y-1 border-t border-sidebar-border px-3 py-3">
        <NavLink
          item={SETTINGS_ITEM}
          collapsed={collapsed}
          active={isActivePath(pathname, SETTINGS_ITEM.href)}
          onNavigate={onNavigate}
        />
        {onToggleCollapsed && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onToggleCollapsed}
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                aria-expanded={!collapsed}
                className={cn(
                  'flex h-9 w-full items-center gap-3 rounded-md px-2.5 text-sm font-medium text-muted-foreground outline-none transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-ring',
                  collapsed && 'justify-center px-0',
                )}
              >
                {collapsed ? (
                  <PanelLeftOpen className="size-[18px]" aria-hidden="true" />
                ) : (
                  <PanelLeftClose className="size-[18px]" aria-hidden="true" />
                )}
                {!collapsed && <span>Collapse</span>}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {collapsed ? 'Expand sidebar' : 'Collapse sidebar'}{' '}
              <kbd className="ml-1 font-sans opacity-70">Ctrl B</kbd>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
