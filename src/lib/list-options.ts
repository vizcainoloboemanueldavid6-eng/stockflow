import type { Prisma } from '@prisma/client';

/**
 * Sortable columns of the server-side tables and their Prisma orderBy. Only keys
 * listed here are accepted; anything else in the URL falls back to the default,
 * so a crafted `?sort=` can never reach the query. Pure and client-safe (type-only
 * Prisma import) - the table headers use the same keys.
 */

export const PRODUCT_SORT_KEYS = [
  'name',
  'sku',
  'category',
  'supplier',
  'quantity',
  'reorderLevel',
  'unitCost',
  'salePrice',
  'updatedAt',
] as const;
export type ProductSortKey = (typeof PRODUCT_SORT_KEYS)[number];

export const PRODUCT_LIST_DEFAULTS = { sort: 'name', dir: 'asc', pageSize: 10 } as const;

export function isProductSortKey(value: string | undefined): value is ProductSortKey {
  return PRODUCT_SORT_KEYS.includes(value as ProductSortKey);
}

type SortDir = 'asc' | 'desc';

/** orderBy for the products table; ties are broken by name then id so pages never overlap. */
export function productOrderBy(
  sort: string | undefined,
  dir: SortDir,
): Prisma.ProductOrderByWithRelationInput[] {
  const key: ProductSortKey = isProductSortKey(sort) ? sort : PRODUCT_LIST_DEFAULTS.sort;
  const primary: Prisma.ProductOrderByWithRelationInput =
    key === 'category'
      ? { category: { name: dir } }
      : key === 'supplier'
        ? { supplier: { name: dir } }
        : { [key]: dir };
  const tail: Prisma.ProductOrderByWithRelationInput[] =
    key === 'name' ? [{ id: 'asc' }] : [{ name: 'asc' }, { id: 'asc' }];
  return [primary, ...tail];
}

export const MOVEMENT_SORT_KEYS = ['createdAt', 'quantity'] as const;
export type MovementSortKey = (typeof MOVEMENT_SORT_KEYS)[number];

export const MOVEMENT_LIST_DEFAULTS = { sort: 'createdAt', dir: 'desc', pageSize: 10 } as const;

/** orderBy for the movement history (newest first by default). */
export function movementOrderBy(
  sort: string | undefined,
  dir: SortDir,
): Prisma.StockMovementOrderByWithRelationInput[] {
  const key: MovementSortKey = MOVEMENT_SORT_KEYS.includes(sort as MovementSortKey)
    ? (sort as MovementSortKey)
    : 'createdAt';
  return key === 'createdAt'
    ? [{ createdAt: dir }, { id: dir }]
    : [{ quantity: dir }, { createdAt: 'desc' }, { id: 'desc' }];
}

export const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;
