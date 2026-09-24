import { describe, expect, it } from 'vitest';
import {
  movementQuantity,
  parseUnits,
  REASON_PLACEHOLDERS,
  stockAfterMovement,
} from '@/lib/movement-form';
import { movementSchema } from '@/lib/validations/movement';

describe('movementQuantity: what the form sends to registerMovement', () => {
  it('sends positive units for stock in and stock out, whatever the direction toggle says', () => {
    expect(movementQuantity('IN', 5, 'remove')).toBe(5);
    expect(movementQuantity('OUT', 5, 'add')).toBe(5);
    expect(movementQuantity('OUT', -5, 'remove')).toBe(5);
  });

  it('turns an adjustment into a signed delta', () => {
    expect(movementQuantity('ADJUSTMENT', 2, 'remove')).toBe(-2);
    expect(movementQuantity('ADJUSTMENT', 2, 'add')).toBe(2);
    expect(movementQuantity('ADJUSTMENT', -2, 'add')).toBe(2);
  });

  it('produces values the shared schema accepts', () => {
    for (const [type, units, direction] of [
      ['IN', 3, 'add'],
      ['OUT', 3, 'add'],
      ['ADJUSTMENT', 3, 'remove'],
      ['ADJUSTMENT', 3, 'add'],
    ] as const) {
      const parsed = movementSchema.safeParse({
        productId: 'p1',
        type,
        quantity: movementQuantity(type, units, direction),
        reason: '',
      });
      expect(parsed.success).toBe(true);
    }
  });
});

describe('stockAfterMovement: the preview in the dialog', () => {
  it('adds stock in, subtracts stock out', () => {
    expect(stockAfterMovement(10, 'IN', 4, 'remove')).toBe(14);
    expect(stockAfterMovement(10, 'OUT', 4, 'add')).toBe(6);
  });

  it('applies adjustments in the chosen direction', () => {
    expect(stockAfterMovement(10, 'ADJUSTMENT', 3, 'remove')).toBe(7);
    expect(stockAfterMovement(10, 'ADJUSTMENT', 3, 'add')).toBe(13);
  });

  it('can go negative so the dialog can warn (the server still refuses it)', () => {
    expect(stockAfterMovement(2, 'OUT', 5, 'add')).toBe(-3);
    expect(stockAfterMovement(0, 'ADJUSTMENT', 1, 'remove')).toBe(-1);
  });
});

describe('parseUnits', () => {
  it('accepts positive whole numbers, with or without thousands separators', () => {
    expect(parseUnits('12')).toBe(12);
    expect(parseUnits(' 7 ')).toBe(7);
    expect(parseUnits('1,200')).toBe(1200);
    expect(parseUnits(3)).toBe(3);
  });

  it('rejects anything else', () => {
    for (const raw of ['', '0', '-3', '2.5', 'abc', '1e3', null, undefined, {}]) {
      expect(parseUnits(raw)).toBeNull();
    }
  });
});

it('has a reason hint for every movement type', () => {
  expect(Object.keys(REASON_PLACEHOLDERS).sort()).toEqual(['ADJUSTMENT', 'IN', 'OUT']);
});
