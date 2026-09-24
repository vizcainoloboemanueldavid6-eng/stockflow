import 'server-only';
import { appTimeZone } from '@/lib/dates';
import { prisma, toNumber } from '@/lib/db';
import { formatDate } from '@/lib/format';
import { valuationByCategory, type Valuation } from '@/lib/metrics';

export type CategoryRow = {
  id: string;
  name: string;
  color: string;
  /** Every product in the category, archived ones included (they still reference it). */
  productCount: number;
  activeCount: number;
};

export async function listCategories(): Promise<CategoryRow[]> {
  const [categories, active] = await Promise.all([
    prisma.category.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, color: true, _count: { select: { products: true } } },
    }),
    prisma.product.groupBy({
      by: ['categoryId'],
      where: { archived: false },
      _count: { _all: true },
    }),
  ]);
  const activeById = new Map(active.map((row) => [row.categoryId, row._count._all]));
  return categories.map((category) => ({
    id: category.id,
    name: category.name,
    color: category.color,
    productCount: category._count.products,
    activeCount: activeById.get(category.id) ?? 0,
  }));
}

export type SupplierRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  productCount: number;
};

export async function listSuppliers(): Promise<SupplierRow[]> {
  const suppliers = await prisma.supplier.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      notes: true,
      _count: { select: { products: true } },
    },
  });
  return suppliers.map(({ _count, ...supplier }) => ({
    ...supplier,
    productCount: _count.products,
  }));
}

/** Stock valuation per category (non-archived products), for /reports. */
export async function getValuation(): Promise<Valuation> {
  const [products, categories] = await Promise.all([
    prisma.product.findMany({
      where: { archived: false },
      select: { categoryId: true, quantity: true, unitCost: true, salePrice: true },
    }),
    prisma.category.findMany({ select: { id: true, name: true, color: true } }),
  ]);
  return valuationByCategory(
    products.map((product) => ({
      categoryId: product.categoryId,
      quantity: product.quantity,
      unitCost: toNumber(product.unitCost),
      salePrice: toNumber(product.salePrice),
    })),
    categories,
  );
}

export type UserRow = {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'STAFF' | 'DEMO';
  createdLabel: string;
  movementCount: number;
};

export async function listUsers(): Promise<UserRow[]> {
  const users = await prisma.user.findMany({
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      _count: { select: { movements: true } },
    },
  });
  const timeZone = appTimeZone();
  return users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdLabel: formatDate(user.createdAt, timeZone),
    movementCount: user._count.movements,
  }));
}
