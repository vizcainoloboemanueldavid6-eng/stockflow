/**
 * Enum values mirrored from prisma/schema.prisma as plain string unions so client
 * components and Zod schemas can use them without importing @prisma/client into
 * the browser bundle. The literal types are identical to Prisma's `$Enums`, so
 * values flow between the two without casts.
 */
export const ROLES = ['ADMIN', 'STAFF', 'DEMO'] as const;
export type Role = (typeof ROLES)[number];

export const MOVEMENT_TYPES = ['IN', 'OUT', 'ADJUSTMENT'] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Admin',
  STAFF: 'Staff',
  DEMO: 'Demo',
};

export const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  IN: 'Stock in',
  OUT: 'Stock out',
  ADJUSTMENT: 'Adjustment',
};

/** Stock status derived from quantity and reorder level (used by filters and badges). */
export const STOCK_STATUSES = ['in_stock', 'low_stock', 'out_of_stock'] as const;
export type StockStatus = (typeof STOCK_STATUSES)[number];

export const STOCK_STATUS_LABELS: Record<StockStatus, string> = {
  in_stock: 'In stock',
  low_stock: 'Low stock',
  out_of_stock: 'Out of stock',
};

/**
 * A product is "low stock" when quantity is at or below its reorder level
 * (and above zero); "out of stock" at zero. One definition, used everywhere.
 */
export function stockStatus(quantity: number, reorderLevel: number): StockStatus {
  if (quantity <= 0) return 'out_of_stock';
  if (quantity <= reorderLevel) return 'low_stock';
  return 'in_stock';
}

export const APP_NAME = 'StockFlow';

/** Password rules shared by register, change-password and user management. */
export const PASSWORD_MIN_LENGTH = 8;
/** bcrypt only looks at the first 72 bytes; longer input is rejected instead of silently truncated. */
export const PASSWORD_MAX_BYTES = 72;
