import bcrypt from 'bcryptjs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * The real server actions against the real database, with only the session mocked:
 * what happens when a signed-in STAFF user (or DEMO) calls a guarded action directly,
 * bypassing the UI. Complements tests/e2e/permissions.spec.ts, which replays the same
 * calls over HTTP against the production build.
 *
 * WARNING: re-seeds the database configured in .env (like database.test.ts).
 */
const session = vi.hoisted(() => ({
  current: null as null | { user: { id: string; role: string } },
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => session.current),
  hashPassword: (password: string) => bcrypt.hash(password, 4),
  verifyPassword: (password: string, hash: string) => bcrypt.compare(password, hash),
}));

const { prisma } = await import('@/lib/db');
const { seedDatabase } = await import('@/lib/seed');
const products = await import('@/lib/actions/products');
const catalog = await import('@/lib/actions/catalog');
const users = await import('@/lib/actions/users');
const account = await import('@/lib/actions/account');
const { listProducts, findProductsForExport } = await import('@/lib/queries/products');
const { productListQuerySchema } = await import('@/lib/validations/product');

type Seeded = { id: string; role: string; passwordHash: string };
let admin: Seeded;
let staff: Seeded;
let demo: Seeded;
let productId: string;
let categoryId: string;
let supplierId: string;

/** Signs in as a seeded user; `claimedRole` forges the role inside the session token. */
function signInAs(user: Seeded, claimedRole = user.role) {
  session.current = { user: { id: user.id, role: claimedRole } };
}

beforeAll(async () => {
  await seedDatabase(prisma, { mode: 'reset-demo' });
  const byRole = async (role: 'ADMIN' | 'STAFF' | 'DEMO') =>
    prisma.user.findFirstOrThrow({
      where: { role },
      select: { id: true, role: true, passwordHash: true },
    });
  [admin, staff, demo] = await Promise.all([byRole('ADMIN'), byRole('STAFF'), byRole('DEMO')]);

  // Records nothing references, so only the role decides whether a delete may happen.
  const category = await prisma.category.create({
    data: { name: 'Integration: unused category', color: '#2563EB' },
  });
  const spare = await prisma.category.findFirstOrThrow({ where: { name: 'Audio' } });
  const supplier = await prisma.supplier.create({ data: { name: 'Integration: unused supplier' } });
  const product = await prisma.product.create({
    data: {
      sku: 'INT-DELETE-1',
      name: 'Integration delete target',
      categoryId: spare.id,
      unitCost: 1,
      salePrice: 2,
      reorderLevel: 1,
    },
  });
  categoryId = category.id;
  supplierId = supplier.id;
  productId = product.id;
});

beforeEach(() => {
  session.current = null;
});

afterAll(async () => {
  await prisma.product.deleteMany({ where: { sku: 'INT-DELETE-1' } });
  await prisma.category.deleteMany({ where: { name: 'Integration: unused category' } });
  await prisma.supplier.deleteMany({ where: { name: 'Integration: unused supplier' } });
  await prisma.$disconnect();
});

const auditRows = (entityId: string) => prisma.auditLog.count({ where: { entityId } });

describe('STAFF calling the delete actions directly', () => {
  it.each([
    ['deleteProduct', () => products.deleteProduct({ id: productId })],
    ['setProductArchived', () => products.setProductArchived({ id: productId, archived: true })],
    ['deleteCategory', () => catalog.deleteCategory({ id: categoryId })],
    ['deleteSupplier', () => catalog.deleteSupplier({ id: supplierId })],
    ['deleteUser', () => users.deleteUser({ id: demo.id })],
  ] as const)('%s is refused and nothing changes', async (_name, call) => {
    signInAs(staff);
    await expect(call()).resolves.toMatchObject({ ok: false, code: 'FORBIDDEN' });

    expect(await prisma.product.findUnique({ where: { id: productId } })).toMatchObject({
      archived: false,
    });
    expect(await prisma.category.count({ where: { id: categoryId } })).toBe(1);
    expect(await prisma.supplier.count({ where: { id: supplierId } })).toBe(1);
    expect(await prisma.user.count({ where: { id: demo.id } })).toBe(1);
    for (const id of [productId, categoryId, supplierId, demo.id]) {
      expect(await auditRows(id)).toBe(0);
    }
  });

  it('a session that claims ADMIN for the staff account is still refused', async () => {
    // The guard re-reads the role from the database instead of trusting the token.
    signInAs(staff, 'ADMIN');
    await expect(products.deleteProduct({ id: productId })).resolves.toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
    });
    expect(await prisma.product.count({ where: { id: productId } })).toBe(1);
  });

  it('without a session the action answers UNAUTHORIZED', async () => {
    await expect(products.deleteProduct({ id: productId })).resolves.toMatchObject({
      ok: false,
      code: 'UNAUTHORIZED',
    });
    expect(await prisma.product.count({ where: { id: productId } })).toBe(1);
  });
});

describe('DEMO calling restricted actions directly', () => {
  it('cannot change its password, even with the right current password', async () => {
    signInAs(demo);
    const result = await account.changePassword({
      currentPassword: 'Demo#2026',
      newPassword: 'Another#2027',
      confirmPassword: 'Another#2027',
    });
    expect(result).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    const row = await prisma.user.findUniqueOrThrow({ where: { id: demo.id } });
    expect(row.passwordHash).toBe(demo.passwordHash);
  });

  it('cannot delete users', async () => {
    signInAs(demo);
    await expect(users.deleteUser({ id: staff.id })).resolves.toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
    });
    expect(await prisma.user.count({ where: { id: staff.id } })).toBe(1);
  });
});

describe('ADMIN (positive control)', () => {
  it('deletes the same records and writes the audit log', async () => {
    signInAs(admin);
    await expect(products.deleteProduct({ id: productId })).resolves.toMatchObject({ ok: true });
    await expect(catalog.deleteCategory({ id: categoryId })).resolves.toMatchObject({ ok: true });
    await expect(catalog.deleteSupplier({ id: supplierId })).resolves.toMatchObject({ ok: true });
    expect(await prisma.product.count({ where: { id: productId } })).toBe(0);
    expect(await prisma.category.count({ where: { id: categoryId } })).toBe(0);
    expect(await prisma.supplier.count({ where: { id: supplierId } })).toBe(0);
    const actions = await prisma.auditLog.findMany({
      where: { entityId: { in: [productId, categoryId, supplierId] } },
      select: { action: true, userId: true },
    });
    expect(actions.map((a) => a.action).sort()).toEqual([
      'category.delete',
      'product.delete',
      'supplier.delete',
    ]);
    for (const row of actions) expect(row.userId).toBe(admin.id);
  });
});

describe('product search takes % and _ literally', () => {
  const probes = [
    { sku: 'SRCH-PCT', name: 'Search probe 50% off' },
    { sku: 'SRCH-UND', name: 'Search probe snake_case' },
  ];

  beforeAll(async () => {
    const category = await prisma.category.findFirstOrThrow({ where: { name: 'Audio' } });
    await prisma.product.createMany({
      data: probes.map((p) => ({ ...p, categoryId: category.id, unitCost: 1, salePrice: 2 })),
    });
  });

  afterAll(async () => {
    await prisma.product.deleteMany({ where: { sku: { in: probes.map((p) => p.sku) } } });
  });

  const search = async (q: string) =>
    (await listProducts(productListQuerySchema.parse({ q, pageSize: '100' }))).rows.map(
      (row) => row.sku,
    );

  it('matches the characters, not "anything" (list, CSV export)', async () => {
    // Before the fix both matched all 62 products: LIKE read them as wildcards.
    expect(await search('%')).toEqual(['SRCH-PCT']);
    expect(await search('_')).toEqual(['SRCH-UND']);
    expect(await search('50% OFF')).toEqual(['SRCH-PCT']);
    expect(await search('e_c')).toEqual(['SRCH-UND']);
    expect(await search(String.fromCharCode(92))).toEqual([]); // a lone backslash
    const csv = await findProductsForExport({ q: '%', archived: 'active' });
    expect(csv.map((row) => row.sku)).toEqual(['SRCH-PCT']);
  });

  it('is still a case-insensitive substring search', async () => {
    expect((await search('SEARCH PROBE')).sort()).toEqual(['SRCH-PCT', 'SRCH-UND']);
    expect(await search('srch-und')).toEqual(['SRCH-UND']);
  });
});
