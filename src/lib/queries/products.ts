import 'server-only';
import type { Prisma } from '@prisma/client';
import { cache } from 'react';
import { type StockStatus, stockStatus } from '@/lib/constants';
import { appTimeZone } from '@/lib/dates';
import { prisma, productTextWhere, toNumber } from '@/lib/db';
import { formatDate } from '@/lib/format';
import { productOrderBy } from '@/lib/list-options';
import { lineValueCents } from '@/lib/metrics';
import { paginate } from '@/lib/search-params';
import type { ProductListQuery } from '@/lib/validations/product';

/** A product as the tables, dialogs and detail page need it: plain JSON, no Decimals. */
export type ProductRow = {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  supplierId: string | null;
  supplierName: string | null;
  unitCost: number;
  salePrice: number;
  quantity: number;
  reorderLevel: number;
  imageUrl: string | null;
  archived: boolean;
  status: StockStatus;
  /** quantity x unitCost */
  stockValue: number;
  movementCount: number;
  updatedLabel: string;
  createdLabel: string;
};

const productSelect = {
  id: true,
  sku: true,
  name: true,
  description: true,
  categoryId: true,
  supplierId: true,
  unitCost: true,
  salePrice: true,
  quantity: true,
  reorderLevel: true,
  imageUrl: true,
  archived: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { name: true, color: true } },
  supplier: { select: { name: true } },
  _count: { select: { movements: true } },
} satisfies Prisma.ProductSelect;

type SelectedProduct = Prisma.ProductGetPayload<{ select: typeof productSelect }>;

function toProductRow(product: SelectedProduct, timeZone: string): ProductRow {
  const unitCost = toNumber(product.unitCost);
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    description: product.description,
    categoryId: product.categoryId,
    categoryName: product.category.name,
    categoryColor: product.category.color,
    supplierId: product.supplierId,
    supplierName: product.supplier?.name ?? null,
    unitCost,
    salePrice: toNumber(product.salePrice),
    quantity: product.quantity,
    reorderLevel: product.reorderLevel,
    imageUrl: product.imageUrl,
    archived: product.archived,
    status: stockStatus(product.quantity, product.reorderLevel),
    stockValue: lineValueCents(product.quantity, unitCost) / 100,
    movementCount: product._count.movements,
    updatedLabel: formatDate(product.updatedAt, timeZone),
    createdLabel: formatDate(product.createdAt, timeZone),
  };
}

export type ProductFilters = Pick<
  ProductListQuery,
  'q' | 'category' | 'supplier' | 'status' | 'archived'
>;

/**
 * WHERE clause for the product list and the products CSV export.
 * Stock status compares two columns (quantity vs reorderLevel) with a field
 * reference, so filtering and counting happen in the database, page by page.
 * `supplier=none` selects products without a supplier.
 */
export async function productWhere(filters: ProductFilters): Promise<Prisma.ProductWhereInput> {
  const and: Prisma.ProductWhereInput[] = [];
  if (filters.archived !== 'all') and.push({ archived: filters.archived === 'archived' });
  if (filters.q) and.push(await productTextWhere(filters.q));
  if (filters.category) and.push({ categoryId: filters.category });
  if (filters.supplier === 'none') and.push({ supplierId: null });
  else if (filters.supplier) and.push({ supplierId: filters.supplier });

  const reorderLevel = prisma.product.fields.reorderLevel;
  if (filters.status === 'out_of_stock') and.push({ quantity: { lte: 0 } });
  if (filters.status === 'low_stock') and.push({ quantity: { gt: 0, lte: reorderLevel } });
  if (filters.status === 'in_stock') {
    and.push({ quantity: { gt: 0 } }, { quantity: { gt: reorderLevel } });
  }
  return and.length ? { AND: and } : {};
}

export type ProductList = {
  rows: ProductRow[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
};

export async function listProducts(query: ProductListQuery): Promise<ProductList> {
  const where = await productWhere(query);
  const total = await prisma.product.count({ where });
  const { page, pageCount, skip, take } = paginate(total, query.page, query.pageSize);
  const products = await prisma.product.findMany({
    where,
    orderBy: productOrderBy(query.sort, query.dir),
    skip,
    take,
    select: productSelect,
  });
  const timeZone = appTimeZone();
  return {
    rows: products.map((product) => toProductRow(product, timeZone)),
    total,
    page,
    pageCount,
    pageSize: take,
  };
}

/** Every product matching the filters, in table order (CSV export). */
export async function findProductsForExport(
  filters: ProductFilters,
  sort?: string,
  dir: 'asc' | 'desc' = 'asc',
) {
  const products = await prisma.product.findMany({
    where: await productWhere(filters),
    orderBy: productOrderBy(sort, dir),
    select: productSelect,
  });
  const timeZone = appTimeZone();
  return products.map((product) => ({
    ...toProductRow(product, timeZone),
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  }));
}

/** One product; memoised per request (the detail page's metadata and body both ask). */
export const getProduct = cache(async (id: string): Promise<ProductRow | null> => {
  const product = await prisma.product.findUnique({ where: { id }, select: productSelect });
  return product ? toProductRow(product, appTimeZone()) : null;
});

export type Option = { id: string; name: string };
export type CategoryOption = Option & { color: string };

/** Choices for the product form and the table filters. */
export async function productFormOptions(): Promise<{
  categories: CategoryOption[];
  suppliers: Option[];
}> {
  const [categories, suppliers] = await Promise.all([
    prisma.category.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, color: true },
    }),
    prisma.supplier.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);
  return { categories, suppliers };
}

/** Units in / out over the product's whole history (detail page summary). */
export async function productMovementTotals(productId: string) {
  const grouped = await prisma.stockMovement.groupBy({
    by: ['type'],
    where: { productId },
    _sum: { quantity: true },
    _count: { _all: true },
  });
  const read = (type: 'IN' | 'OUT' | 'ADJUSTMENT') => grouped.find((g) => g.type === type);
  return {
    received: read('IN')?._sum.quantity ?? 0,
    sold: read('OUT')?._sum.quantity ?? 0,
    adjusted: read('ADJUSTMENT')?._sum.quantity ?? 0,
    movements: grouped.reduce((sum, g) => sum + g._count._all, 0),
  };
}
