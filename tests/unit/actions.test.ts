import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * The stage-2 server actions called directly - the way a hand-crafted request would
 * call them - with the session and the database mocked. Proves the role rules live
 * on the server: refused calls never open a transaction.
 */
const mocks = vi.hoisted(() => {
  const tx = {
    product: { findUnique: vi.fn(), delete: vi.fn(), update: vi.fn() },
    category: { findUnique: vi.fn(), delete: vi.fn(), update: vi.fn() },
    supplier: { findUnique: vi.fn(), delete: vi.fn() },
    user: { findUnique: vi.fn(), count: vi.fn(), update: vi.fn(), delete: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return {
    auth: vi.fn(),
    findCurrentUser: vi.fn(),
    transaction: vi.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
    productLookup: vi.fn(),
    categoryLookup: vi.fn(),
    tx,
  };
});

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth', () => ({
  auth: mocks.auth,
  hashPassword: vi.fn(async () => 'hash'),
  verifyPassword: vi.fn(async () => true),
}));
vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: mocks.findCurrentUser },
    product: { findUnique: mocks.productLookup },
    category: { findMany: mocks.categoryLookup },
    $transaction: mocks.transaction,
  },
}));

const products = await import('@/lib/actions/products');
const catalog = await import('@/lib/actions/catalog');
const users = await import('@/lib/actions/users');
const account = await import('@/lib/actions/account');
const { DEMO_EMAIL_MESSAGE, DEMO_PASSWORD_MESSAGE } = await import('@/lib/constants');
const { SHARED_ACCOUNT_MESSAGE } = await import('@/lib/permissions');

type Role = 'ADMIN' | 'STAFF' | 'DEMO';

function signInAs(role: Role) {
  const id = `${role.toLowerCase()}-id`;
  mocks.auth.mockResolvedValue({ user: { id, role } });
  mocks.findCurrentUser.mockResolvedValue({ id, name: role, email: `${id}@x.test`, role });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.transaction.mockImplementation(async (fn) => fn(mocks.tx));
});

describe('STAFF is refused by the server, not just hidden in the UI', () => {
  const calls: [string, () => Promise<unknown>][] = [
    ['deleteProduct', () => products.deleteProduct({ id: 'p1' })],
    ['setProductArchived', () => products.setProductArchived({ id: 'p1', archived: true })],
    ['createCategory', () => catalog.createCategory({ name: 'Drones', color: '#2563EB' })],
    ['deleteCategory', () => catalog.deleteCategory({ id: 'c1' })],
    [
      'createSupplier',
      () => catalog.createSupplier({ name: 'Harbor Parts', email: '', phone: '', notes: '' }),
    ],
    ['deleteSupplier', () => catalog.deleteSupplier({ id: 's1' })],
    [
      'createUser',
      () =>
        users.createUser({
          name: 'New Person',
          email: 'new@x.test',
          role: 'ADMIN',
          password: 'Password1',
        }),
    ],
    ['updateUser', () => users.updateUser({ id: 'u1', name: 'Someone', role: 'ADMIN' })],
    ['deleteUser', () => users.deleteUser({ id: 'u1' })],
    ['setUserPassword', () => users.setUserPassword({ id: 'u1', password: 'Fresh#2026x' })],
  ];

  it.each(calls)('%s returns FORBIDDEN without touching the database', async (_name, call) => {
    signInAs('STAFF');
    await expect(call()).resolves.toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

describe('DEMO restrictions', () => {
  it('cannot change its password, with an explanation', async () => {
    signInAs('DEMO');
    const result = await account.changePassword({
      currentPassword: 'Demo#2026',
      newPassword: 'Another#2027',
      confirmPassword: 'Another#2027',
    });
    expect(result).toEqual({ ok: false, code: 'FORBIDDEN', error: DEMO_PASSWORD_MESSAGE });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('cannot change its email but may rename itself', async () => {
    signInAs('DEMO');
    await expect(
      account.updateProfile({ name: 'Visitor', email: 'someone-else@x.test' }),
    ).resolves.toEqual({ ok: false, code: 'FORBIDDEN', error: DEMO_EMAIL_MESSAGE });

    mocks.tx.user.update.mockResolvedValue({
      id: 'demo-id',
      name: 'Visitor',
      email: 'demo-id@x.test',
    });
    await expect(
      account.updateProfile({ name: 'Visitor', email: 'demo-id@x.test' }),
    ).resolves.toMatchObject({ ok: true });
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'profile.update', entity: 'User' }),
    });
  });

  it('cannot delete users', async () => {
    signInAs('DEMO');
    await expect(users.deleteUser({ id: 'staff-id' })).resolves.toEqual({
      ok: false,
      code: 'FORBIDDEN',
      error: 'Only administrators can delete users.',
    });
  });

  it("cannot reset other people's passwords", async () => {
    signInAs('DEMO');
    await expect(
      users.setUserPassword({ id: 'staff-id', password: 'Fresh#2026x' }),
    ).resolves.toEqual({
      ok: false,
      code: 'FORBIDDEN',
      error: 'Only administrators can reset passwords.',
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('can only create staff accounts', async () => {
    signInAs('DEMO');
    await expect(
      users.createUser({
        name: 'Boss',
        email: 'boss@x.test',
        role: 'ADMIN',
        password: 'Password1',
      }),
    ).resolves.toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('may delete products (like an admin)', async () => {
    signInAs('DEMO');
    mocks.tx.product.findUnique.mockResolvedValue({
      id: 'p1',
      name: 'Spare Cable',
      _count: { movements: 0 },
    });
    await expect(products.deleteProduct({ id: 'p1' })).resolves.toEqual({
      ok: true,
      data: { id: 'p1', name: 'Spare Cable' },
    });
    expect(mocks.tx.product.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'product.delete', entityId: 'p1' }),
    });
  });
});

describe('shared demo accounts while the public demo is on', () => {
  const seededAdmin = {
    id: 'admin-id',
    name: 'Admin User',
    email: 'admin@stockflow.test',
    role: 'ADMIN' as const,
  };
  const seededStaff = {
    id: 'staff-id',
    name: 'Staff User',
    email: 'staff@stockflow.test',
    role: 'STAFF' as const,
  };

  function signInAsSeeded(user: typeof seededAdmin | typeof seededStaff) {
    mocks.auth.mockResolvedValue({ user: { id: user.id, role: user.role } });
    mocks.findCurrentUser.mockResolvedValue(user);
  }

  const passwordChange = {
    currentPassword: 'Admin#2026',
    newPassword: 'Another#2027',
    confirmPassword: 'Another#2027',
  };

  it('keep their published password and email, whatever the role', async () => {
    for (const user of [seededAdmin, seededStaff]) {
      signInAsSeeded(user);
      await expect(account.changePassword(passwordChange)).resolves.toEqual({
        ok: false,
        code: 'FORBIDDEN',
        error: DEMO_PASSWORD_MESSAGE,
      });
      await expect(
        account.updateProfile({ name: user.name, email: 'taken-over@x.test' }),
      ).resolves.toEqual({ ok: false, code: 'FORBIDDEN', error: DEMO_EMAIL_MESSAGE });
    }
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('cannot be deleted, demoted or given a new password, even by an admin', async () => {
    signInAsSeeded(seededAdmin);
    mocks.tx.user.findUnique.mockResolvedValue(seededStaff);
    mocks.tx.user.count.mockResolvedValue(1);
    for (const call of [
      () => users.deleteUser({ id: 'staff-id' }),
      () => users.updateUser({ id: 'staff-id', name: 'Staff User', role: 'DEMO' }),
    ]) {
      await expect(call()).resolves.toEqual({
        ok: false,
        code: 'FORBIDDEN',
        error: SHARED_ACCOUNT_MESSAGE,
      });
    }
    mocks.findCurrentUser.mockResolvedValueOnce(seededAdmin).mockResolvedValueOnce(seededStaff);
    await expect(
      users.setUserPassword({ id: 'staff-id', password: 'Fresh#2026x' }),
    ).resolves.toMatchObject({ ok: false, error: SHARED_ACCOUNT_MESSAGE });
    expect(mocks.tx.user.update).not.toHaveBeenCalled();
    expect(mocks.tx.user.delete).not.toHaveBeenCalled();
  });

  it('are ordinary accounts on a real deployment (DEMO_ENABLED=false)', async () => {
    vi.stubEnv('DEMO_ENABLED', 'false');
    try {
      signInAsSeeded(seededAdmin);
      await expect(account.changePassword(passwordChange)).resolves.toEqual({
        ok: true,
        data: null,
      });
      mocks.tx.user.findUnique.mockResolvedValue(seededStaff);
      mocks.tx.user.count.mockResolvedValue(1);
      await expect(users.deleteUser({ id: 'staff-id' })).resolves.toMatchObject({ ok: true });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('DEMO may rename a staff account but not change its role', async () => {
    signInAs('DEMO');
    mocks.tx.user.findUnique.mockResolvedValue({
      id: 'visitor-staff',
      name: 'Visitor',
      email: 'visitor@x.test',
      role: 'STAFF',
    });
    await expect(
      users.updateUser({ id: 'visitor-staff', name: 'Visitor', role: 'DEMO' }),
    ).resolves.toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
      error: expect.stringMatching(/cannot change roles/),
    });
    mocks.tx.user.update.mockResolvedValue({ id: 'visitor-staff', name: 'Renamed', role: 'STAFF' });
    await expect(
      users.updateUser({ id: 'visitor-staff', name: 'Renamed', role: 'STAFF' }),
    ).resolves.toMatchObject({ ok: true });
  });
});

describe('referential rules with clear messages', () => {
  it('refuses to delete a product that has stock history', async () => {
    signInAs('ADMIN');
    mocks.tx.product.findUnique.mockResolvedValue({
      id: 'p1',
      name: 'USB Hub',
      _count: { movements: 12 },
    });
    const result = await products.deleteProduct({ id: 'p1' });
    expect(result).toMatchObject({ ok: false, code: 'CONFLICT' });
    expect(result.ok === false && result.error).toMatch(/12 stock movements.*Archive it instead/);
    expect(mocks.tx.product.delete).not.toHaveBeenCalled();
  });

  it('refuses to delete a category still used by products', async () => {
    signInAs('ADMIN');
    mocks.tx.category.findUnique.mockResolvedValue({
      id: 'c1',
      name: 'Audio',
      _count: { products: 9 },
    });
    const result = await catalog.deleteCategory({ id: 'c1' });
    expect(result).toMatchObject({ ok: false, code: 'CONFLICT' });
    expect(result.ok === false && result.error).toMatch(/"Audio" is still used by 9 products/);
    expect(mocks.tx.category.delete).not.toHaveBeenCalled();
  });

  it('refuses to delete a supplier still used by one product', async () => {
    signInAs('ADMIN');
    mocks.tx.supplier.findUnique.mockResolvedValue({
      id: 's1',
      name: 'Northgate',
      _count: { products: 1 },
    });
    const result = await catalog.deleteSupplier({ id: 's1' });
    expect(result.ok === false && result.error).toMatch(/still used by 1 product /);
  });

  it('deletes an unused supplier and audits it', async () => {
    signInAs('ADMIN');
    mocks.tx.supplier.findUnique.mockResolvedValue({
      id: 's2',
      name: 'Unused',
      _count: { products: 0 },
    });
    await expect(catalog.deleteSupplier({ id: 's2' })).resolves.toMatchObject({ ok: true });
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'supplier.delete', entityId: 's2' }),
    });
  });

  it('keeps the last admin', async () => {
    signInAs('ADMIN');
    mocks.tx.user.findUnique.mockResolvedValue({ id: 'other-admin', role: 'ADMIN' });
    mocks.tx.user.count.mockResolvedValue(1);
    await expect(
      users.updateUser({ id: 'other-admin', name: 'Other Admin', role: 'STAFF' }),
    ).resolves.toEqual({
      ok: false,
      code: 'FORBIDDEN',
      error: 'At least one admin account must remain.',
    });
    mocks.tx.user.findUnique.mockResolvedValue({ id: 'admin-id', role: 'ADMIN', name: 'Admin' });
    mocks.tx.user.count.mockResolvedValue(2);
    await expect(users.deleteUser({ id: 'admin-id' })).resolves.toMatchObject({
      ok: false,
      error: 'You cannot delete your own account.',
    });
  });

  it('lets an admin set a new password for someone else (audited), never their own', async () => {
    signInAs('ADMIN');
    const admin = { id: 'admin-id', name: 'ADMIN', email: 'admin-id@x.test', role: 'ADMIN' };
    mocks.findCurrentUser
      .mockResolvedValueOnce(admin)
      .mockResolvedValueOnce({ id: 'staff-id', name: 'Staff', role: 'STAFF' });
    await expect(
      users.setUserPassword({ id: 'staff-id', password: 'Fresh#2026x' }),
    ).resolves.toEqual({ ok: true, data: { id: 'staff-id', name: 'Staff' } });
    expect(mocks.tx.user.update).toHaveBeenCalledWith({
      where: { id: 'staff-id' },
      data: { passwordHash: 'hash' },
    });
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'user.set-password', entityId: 'staff-id' }),
    });

    vi.clearAllMocks();
    signInAs('ADMIN');
    await expect(
      users.setUserPassword({ id: 'admin-id', password: 'Fresh#2026x' }),
    ).resolves.toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
      error: expect.stringMatching(/Password section/),
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('reports a taken SKU or category name on the field, before any write', async () => {
    signInAs('ADMIN');
    mocks.productLookup.mockResolvedValue({ id: 'other-product' });
    await expect(
      products.createProduct({
        sku: 'CBL-101',
        name: 'Duplicate',
        description: '',
        categoryId: 'c1',
        supplierId: '',
        unitCost: '1.00',
        salePrice: '2.00',
        reorderLevel: '1',
        imageUrl: '',
      }),
    ).resolves.toEqual({
      ok: false,
      code: 'VALIDATION',
      error: 'Another product already uses this SKU.',
      fieldErrors: { sku: ['Another product already uses this SKU.'] },
    });

    mocks.categoryLookup.mockResolvedValue([
      { id: 'c-audio', name: 'Audio' },
      { id: 'c-cables', name: 'Cables & Adapters' },
    ]);
    // Names differ only in case or spaces: still the same name.
    for (const name of ['Audio', 'audio', 'AUDIO', '  cables & adapters ']) {
      await expect(catalog.createCategory({ name, color: '#2563EB' })).resolves.toMatchObject({
        ok: false,
        code: 'VALIDATION',
        fieldErrors: { name: [expect.stringMatching(/already/)] },
      });
    }
    await expect(
      catalog.updateCategory({ id: 'c-cables', name: 'AUDIO', color: '#2563EB' }),
    ).resolves.toMatchObject({ ok: false, code: 'VALIDATION' });
    // Renaming a category to its own name, in another case, is not a conflict.
    mocks.tx.category.update.mockResolvedValue({ id: 'c-audio', name: 'AUDIO' });
    await expect(
      catalog.updateCategory({ id: 'c-audio', name: 'AUDIO', color: '#2563EB' }),
    ).resolves.toMatchObject({ ok: true });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });
});
