import type { MovementType } from '@/lib/constants';
import { movementDelta } from '@/lib/metrics';

/**
 * Helpers for the "Register movement" form. The form always asks for a positive
 * number of units; for an adjustment the user also picks whether units were
 * found (add) or lost (remove), and the form sends the signed delta the server
 * expects (DECISIONS.md "Adjustment semantics"). Pure, so it is unit-tested.
 */

export type AdjustmentDirection = 'add' | 'remove';

/** The `quantity` sent to registerMovement: units for IN/OUT, signed delta for ADJUSTMENT. */
export function movementQuantity(
  type: MovementType,
  units: number,
  direction: AdjustmentDirection,
): number {
  const magnitude = Math.abs(units);
  if (type !== 'ADJUSTMENT') return magnitude;
  return direction === 'remove' ? -magnitude : magnitude;
}

/** Stock after applying the movement (may be negative: the preview warns, the server refuses). */
export function stockAfterMovement(
  current: number,
  type: MovementType,
  units: number,
  direction: AdjustmentDirection,
): number {
  return current + movementDelta(type, movementQuantity(type, units, direction));
}

/** Parses the quantity input; anything that is not a positive whole number is null. */
export function parseUnits(raw: unknown): number | null {
  const text = typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw.trim() : '';
  if (!/^\d+$/.test(text.replace(/,/g, ''))) return null;
  const value = Number(text.replace(/,/g, ''));
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export const REASON_PLACEHOLDERS: Record<MovementType, string> = {
  IN: 'e.g. Purchase order PO-1042, customer return',
  OUT: 'e.g. Counter sale, online order #5521',
  ADJUSTMENT: 'e.g. Stock count, damaged in storage',
};
