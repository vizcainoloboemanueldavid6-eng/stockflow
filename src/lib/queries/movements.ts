import 'server-only';
import type { Prisma } from '@prisma/client';
import type { MovementType } from '@/lib/constants';
import { appTimeZone, dayRange } from '@/lib/dates';
import { prisma } from '@/lib/db';
import { formatDateTime } from '@/lib/format';
import { movementOrderBy } from '@/lib/list-options';
import { movementDelta } from '@/lib/metrics';
import { paginate } from '@/lib/search-params';
import type { MovementListQuery } from '@/lib/validations/movement';

export type MovementRow = {
  id: string;
  type: MovementType;
  /** As stored: units for IN/OUT, signed delta for ADJUSTMENT. */
  quantity: number;
  /** Signed effect on stock. */
  delta: number;
  reason: string | null;
  createdAt: string;
  createdLabel: string;
  product: { id: string; sku: string; name: string; archived: boolean };
  user: { id: string; name: string } | null;
};

export type MovementFilters = Pick<MovementListQuery, 'from' | 'to' | 'type' | 'user' | 'product'>;

/** `user=none` selects movements whose user was deleted (or system jobs). */
export function movementWhere(
  filters: MovementFilters,
  timeZone: string,
): Prisma.StockMovementWhereInput {
  const where: Prisma.StockMovementWhereInput = {};
  if (filters.type) where.type = filters.type;
  if (filters.product) where.productId = filters.product;
  if (filters.user === 'none') where.userId = null;
  else if (filters.user) where.userId = filters.user;
  const range = dayRange(filters.from, filters.to, timeZone);
  if (range.gte || range.lt) where.createdAt = range;
  return where;
}

const movementSelect = {
  id: true,
  type: true,
  quantity: true,
  reason: true,
  createdAt: true,
  product: { select: { id: true, sku: true, name: true, archived: true } },
  user: { select: { id: true, name: true } },
} satisfies Prisma.StockMovementSelect;

type SelectedMovement = Prisma.StockMovementGetPayload<{ select: typeof movementSelect }>;

function toMovementRow(movement: SelectedMovement, timeZone: string): MovementRow {
  return {
    id: movement.id,
    type: movement.type,
    quantity: movement.quantity,
    delta: movementDelta(movement.type, movement.quantity),
    reason: movement.reason,
    createdAt: movement.createdAt.toISOString(),
    createdLabel: formatDateTime(movement.createdAt, timeZone),
    product: movement.product,
    user: movement.user,
  };
}

export type MovementList = {
  rows: MovementRow[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
};

export async function listMovements(query: MovementListQuery): Promise<MovementList> {
  const timeZone = appTimeZone();
  const where = movementWhere(query, timeZone);
  const total = await prisma.stockMovement.count({ where });
  const { page, pageCount, skip, take } = paginate(total, query.page, query.pageSize);
  const movements = await prisma.stockMovement.findMany({
    where,
    orderBy: movementOrderBy(query.sort, query.dir),
    skip,
    take,
    select: movementSelect,
  });
  return {
    rows: movements.map((movement) => toMovementRow(movement, timeZone)),
    total,
    page,
    pageCount,
    pageSize: take,
  };
}

/** Every movement matching the filters, newest first (CSV export). */
export async function findMovementsForExport(filters: MovementFilters) {
  const timeZone = appTimeZone();
  const movements = await prisma.stockMovement.findMany({
    where: movementWhere(filters, timeZone),
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: movementSelect,
  });
  return movements.map((movement) => ({
    ...toMovementRow(movement, timeZone),
    at: movement.createdAt,
  }));
}

/** People who can appear in the history's "User" filter. */
export async function movementUserOptions() {
  return prisma.user.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } });
}
