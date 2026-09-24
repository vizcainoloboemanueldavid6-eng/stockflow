import {
  ArrowLeftRight,
  ChartColumn,
  LayoutDashboard,
  type LucideIcon,
  Package,
  Settings,
  Tags,
  Truck,
} from 'lucide-react';
import type { Permission } from '@/lib/permissions';

/**
 * Single source for the sidebar, the mobile drawer and the command palette.
 * `permission` hides an entry the role cannot open (the page itself still checks).
 */
export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  description: string;
  permission?: Permission;
  keywords?: string[];
};

export type NavSection = { label: string; items: NavItem[] };

export const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Inventory',
    items: [
      {
        href: '/dashboard',
        label: 'Dashboard',
        icon: LayoutDashboard,
        description: 'Stock value, alerts and trends',
        permission: 'dashboard:view',
        keywords: ['home', 'overview', 'kpi', 'charts'],
      },
      {
        href: '/products',
        label: 'Products',
        icon: Package,
        description: 'Catalogue, prices and stock levels',
        permission: 'product:view',
        keywords: ['items', 'catalog', 'sku', 'stock'],
      },
      {
        href: '/movements',
        label: 'Movements',
        icon: ArrowLeftRight,
        description: 'Stock in, stock out and adjustments',
        permission: 'movement:view',
        keywords: ['in', 'out', 'adjustment', 'history', 'receive', 'sell'],
      },
    ],
  },
  {
    label: 'Catalogue',
    items: [
      {
        href: '/suppliers',
        label: 'Suppliers',
        icon: Truck,
        description: 'Vendors and contacts',
        permission: 'supplier:view',
        keywords: ['vendors', 'purchasing', 'contacts'],
      },
      {
        href: '/categories',
        label: 'Categories',
        icon: Tags,
        description: 'Product groups and colours',
        permission: 'category:view',
        keywords: ['groups', 'tags'],
      },
    ],
  },
  {
    label: 'Insights',
    items: [
      {
        href: '/reports',
        label: 'Reports',
        icon: ChartColumn,
        description: 'CSV exports and stock valuation',
        permission: 'report:view',
        keywords: ['export', 'csv', 'valuation'],
      },
    ],
  },
];

export const SETTINGS_ITEM: NavItem = {
  href: '/settings',
  label: 'Settings',
  icon: Settings,
  description: 'Profile, password, theme and users',
  keywords: ['profile', 'password', 'theme', 'users', 'account'],
};

export const ALL_NAV_ITEMS: NavItem[] = [...NAV_SECTIONS.flatMap((s) => s.items), SETTINGS_ITEM];

/** Active when on the page itself or any page below it (/products/abc -> Products). */
export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Cookie holding the desktop sidebar state, read on the server to avoid a layout jump. */
export const SIDEBAR_COOKIE = 'sf_sidebar';
