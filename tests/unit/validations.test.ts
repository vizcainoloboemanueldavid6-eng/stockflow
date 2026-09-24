import { describe, expect, it } from 'vitest';
import {
  categorySchema,
  changePasswordSchema,
  fieldErrorsOf,
  listQuerySchema,
  loginSchema,
  movementSchema,
  productCreateSchema,
  productListQuerySchema,
  registerSchema,
  supplierSchema,
  userCreateSchema,
} from '@/lib/validations';

const validProduct = {
  sku: ' aud-101 ',
  name: 'Wireless Earbuds',
  description: '',
  categoryId: 'cat_1',
  supplierId: '',
  unitCost: '18.50',
  salePrice: 39.99,
  reorderLevel: '15',
  imageUrl: '',
};

function errorsOf(result: { success: boolean; error?: unknown }) {
  if (result.success) return {};
  return fieldErrorsOf(result.error as Parameters<typeof fieldErrorsOf>[0]);
}

describe('auth schemas', () => {
  it('normalises the login email', () => {
    const result = loginSchema.parse({ email: '  Admin@StockFlow.Test ', password: 'x' });
    expect(result.email).toBe('admin@stockflow.test');
  });

  it('rejects a malformed email and an empty password', () => {
    const errors = errorsOf(loginSchema.safeParse({ email: 'not-an-email', password: '' }));
    expect(errors.email?.[0]).toMatch(/valid email/);
    expect(errors.password?.[0]).toMatch(/password/);
  });

  it('requires matching, reasonably strong passwords on sign-up', () => {
    expect(
      registerSchema.safeParse({
        name: 'Jo Doe',
        email: 'jo@example.com',
        password: 'longenough1',
        confirmPassword: 'longenough1',
      }).success,
    ).toBe(true);

    const mismatch = errorsOf(
      registerSchema.safeParse({
        name: 'Jo Doe',
        email: 'jo@example.com',
        password: 'longenough1',
        confirmPassword: 'longenough2',
      }),
    );
    expect(mismatch.confirmPassword?.[0]).toMatch(/do not match/);

    const weak = errorsOf(
      registerSchema.safeParse({
        name: 'Jo',
        email: 'jo@example.com',
        password: 'short',
        confirmPassword: 'short',
      }),
    );
    expect(weak.password?.[0]).toMatch(/at least 8/);

    const noDigit = errorsOf(
      registerSchema.safeParse({
        name: 'Jo',
        email: 'jo@example.com',
        password: 'onlyletters',
        confirmPassword: 'onlyletters',
      }),
    );
    expect(noDigit.password?.[0]).toMatch(/letter and one number/);
  });

  it('rejects passwords longer than bcrypt can hash', () => {
    const long = 'a1'.repeat(40); // 80 bytes
    expect(
      errorsOf(
        userCreateSchema.safeParse({ name: 'Jo', email: 'a@b.co', role: 'STAFF', password: long }),
      ).password,
    ).toBeDefined();
  });

  it('refuses reusing the current password', () => {
    const errors = errorsOf(
      changePasswordSchema.safeParse({
        currentPassword: 'Admin#2026x1',
        newPassword: 'Admin#2026x1',
        confirmPassword: 'Admin#2026x1',
      }),
    );
    expect(errors.newPassword?.[0]).toMatch(/different/);
  });
});

describe('product schema', () => {
  it('normalises form input (strings, blanks, case)', () => {
    const product = productCreateSchema.parse(validProduct);
    expect(product).toMatchObject({
      sku: 'AUD-101',
      description: null,
      supplierId: null,
      unitCost: 18.5,
      salePrice: 39.99,
      reorderLevel: 15,
      imageUrl: null,
    });
    expect(product.initialQuantity).toBeUndefined();
  });

  it('rejects negative money, three decimals and non-integer reorder levels', () => {
    const errors = errorsOf(
      productCreateSchema.safeParse({
        ...validProduct,
        unitCost: -1,
        salePrice: '9.999',
        reorderLevel: 2.5,
      }),
    );
    expect(errors.unitCost?.[0]).toMatch(/negative/);
    expect(errors.salePrice?.[0]).toMatch(/two decimals/);
    expect(errors.reorderLevel?.[0]).toMatch(/whole number/);
  });

  it('requires a category and a valid SKU', () => {
    const errors = errorsOf(
      productCreateSchema.safeParse({ ...validProduct, categoryId: '', sku: 'a b' }),
    );
    expect(errors.categoryId).toEqual(['Choose a category.']);
    expect(errors.sku).toBeDefined();
  });

  it('accepts only http(s) image links', () => {
    expect(
      productCreateSchema.safeParse({ ...validProduct, imageUrl: 'https://img.example/p.png' })
        .success,
    ).toBe(true);
    expect(
      productCreateSchema.safeParse({ ...validProduct, imageUrl: 'javascript:alert(1)' }).success,
    ).toBe(false);
  });

  it('never accepts a negative opening stock', () => {
    expect(productCreateSchema.safeParse({ ...validProduct, initialQuantity: -3 }).success).toBe(
      false,
    );
    expect(
      productCreateSchema.parse({ ...validProduct, initialQuantity: '12' }).initialQuantity,
    ).toBe(12);
  });
});

describe('movement schema', () => {
  const base = { productId: 'prod_1', reason: '' };

  it('requires a positive quantity for IN and OUT', () => {
    expect(movementSchema.safeParse({ ...base, type: 'IN', quantity: 5 }).success).toBe(true);
    for (const type of ['IN', 'OUT'] as const) {
      for (const quantity of [0, -2]) {
        const errors = errorsOf(movementSchema.safeParse({ ...base, type, quantity }));
        expect(errors.quantity?.[0], `${type} ${quantity}`).toMatch(/at least 1/);
      }
    }
  });

  it('accepts a signed, non-zero ADJUSTMENT', () => {
    expect(movementSchema.parse({ ...base, type: 'ADJUSTMENT', quantity: '-3' }).quantity).toBe(-3);
    expect(movementSchema.safeParse({ ...base, type: 'ADJUSTMENT', quantity: 4 }).success).toBe(
      true,
    );
    expect(
      errorsOf(movementSchema.safeParse({ ...base, type: 'ADJUSTMENT', quantity: 0 }))
        .quantity?.[0],
    ).toMatch(/at least one unit/);
  });

  it('rejects fractional units, unknown types and blank quantities', () => {
    expect(movementSchema.safeParse({ ...base, type: 'OUT', quantity: 1.5 }).success).toBe(false);
    expect(movementSchema.safeParse({ ...base, type: 'TRANSFER', quantity: 1 }).success).toBe(
      false,
    );
    expect(movementSchema.safeParse({ ...base, type: 'IN', quantity: '' }).success).toBe(false);
  });

  it('turns a blank reason into null', () => {
    expect(
      movementSchema.parse({ ...base, type: 'IN', quantity: 1, reason: '   ' }).reason,
    ).toBeNull();
  });
});

describe('catalog schemas', () => {
  it('validates category colours as hex', () => {
    expect(categorySchema.parse({ name: 'Audio', color: '#8b5cf6' }).color).toBe('#8B5CF6');
    expect(categorySchema.safeParse({ name: 'Audio', color: 'purple' }).success).toBe(false);
  });

  it('treats supplier contact fields as optional but validates them when present', () => {
    expect(supplierSchema.parse({ name: 'Acme Parts', email: '', phone: '', notes: '' })).toEqual({
      name: 'Acme Parts',
      email: null,
      phone: null,
      notes: null,
    });
    expect(supplierSchema.safeParse({ name: 'Acme Parts', email: 'nope', phone: '' }).success).toBe(
      false,
    );
    expect(
      supplierSchema.safeParse({ name: 'Acme Parts', email: '', phone: 'call me' }).success,
    ).toBe(false);
    expect(
      supplierSchema.parse({ name: 'Acme', email: 'Sales@Acme.Example', phone: '+1 555-0100' })
        .email,
    ).toBe('sales@acme.example');
  });
});

describe('list query schemas', () => {
  it('falls back to safe defaults for garbage search params', () => {
    expect(
      listQuerySchema.parse({ page: 'abc', pageSize: '100000', dir: 'sideways' }),
    ).toMatchObject({
      page: 1,
      pageSize: 10,
      dir: 'asc',
    });
    expect(productListQuerySchema.parse({ status: 'weird', archived: 'nope' })).toMatchObject({
      status: undefined,
      archived: 'active',
    });
  });
});
