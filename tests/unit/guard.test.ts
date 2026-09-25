import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

/*
 * requirePermission()/createAction() with the session and the database mocked:
 * proves the check happens on the server, before input parsing or any handler work.
 */
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/db', () => ({ prisma: { user: { findUnique: mocks.findUnique } } }));

const { BUSY_MESSAGE, createAction, requirePermission, toActionError } =
  await import('@/lib/actions/guard');
const { Prisma } = await import('@prisma/client');
const { InsufficientStockError } = await import('@/lib/errors');

function signInAs(role: 'ADMIN' | 'STAFF' | 'DEMO' | null) {
  if (!role) {
    mocks.auth.mockResolvedValue(null);
    return;
  }
  const id = `${role.toLowerCase()}-id`;
  mocks.auth.mockResolvedValue({ user: { id, role } });
  mocks.findUnique.mockResolvedValue({ id, name: role, email: `${id}@x.test`, role });
}

describe('requirePermission', () => {
  beforeEach(() => {
    mocks.auth.mockReset();
    mocks.findUnique.mockReset();
  });

  it('rejects anonymous callers', async () => {
    signInAs(null);
    await expect(requirePermission('product:view')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('rejects a session whose user no longer exists', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'gone', role: 'ADMIN' } });
    mocks.findUnique.mockResolvedValue(null);
    await expect(requirePermission('product:view')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('uses the role stored in the database, not the one in the token', async () => {
    mocks.auth.mockResolvedValue({ user: { id: 'u1', role: 'ADMIN' } });
    mocks.findUnique.mockResolvedValue({ id: 'u1', name: 'U', email: 'u@x.test', role: 'STAFF' });
    await expect(requirePermission('supplier:delete')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('returns the user when allowed', async () => {
    signInAs('STAFF');
    await expect(requirePermission('movement:create')).resolves.toMatchObject({ role: 'STAFF' });
  });

  it('with DEMO_ENABLED=false an existing DEMO session counts as signed out', async () => {
    vi.stubEnv('DEMO_ENABLED', 'false');
    try {
      signInAs('DEMO');
      await expect(requirePermission('product:view')).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
      signInAs('ADMIN');
      await expect(requirePermission('product:view')).resolves.toMatchObject({ role: 'ADMIN' });
    } finally {
      vi.unstubAllEnvs();
    }
    signInAs('DEMO');
    await expect(requirePermission('product:view')).resolves.toMatchObject({ role: 'DEMO' });
  });
});

describe('createAction', () => {
  const handler = vi.fn(async (input: { id: string }) => ({ deleted: input.id }));
  const deleteSupplier = createAction(
    { permission: 'supplier:delete', schema: z.object({ id: z.string().min(1) }) },
    handler,
  );

  beforeEach(() => {
    handler.mockClear();
    mocks.auth.mockReset();
    mocks.findUnique.mockReset();
  });

  it('refuses STAFF before running the handler (calling the action directly)', async () => {
    signInAs('STAFF');
    const result = await deleteSupplier({ id: 'sup_1' });
    expect(result).toEqual({
      ok: false,
      code: 'FORBIDDEN',
      error: "You don't have permission to do that.",
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('checks the permission before validating input', async () => {
    signInAs('STAFF');
    const result = await deleteSupplier({ id: '' });
    expect(result).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });

  it('returns field errors for invalid input', async () => {
    signInAs('ADMIN');
    const result = await deleteSupplier({ id: '' });
    expect(result).toMatchObject({
      ok: false,
      code: 'VALIDATION',
      fieldErrors: { id: [expect.any(String)] },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it('runs the handler for an allowed role', async () => {
    signInAs('DEMO');
    await expect(deleteSupplier({ id: 'sup_1' })).resolves.toEqual({
      ok: true,
      data: { deleted: 'sup_1' },
    });
  });

  it('maps domain errors to safe messages', async () => {
    signInAs('ADMIN');
    handler.mockRejectedValueOnce(new InsufficientStockError(2, 5));
    await expect(deleteSupplier({ id: 'x' })).resolves.toEqual({
      ok: false,
      code: 'INSUFFICIENT_STOCK',
      error: 'Not enough stock: 2 available, tried to remove 5.',
    });
  });

  it('hides unexpected errors behind a generic message', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(toActionError(new Error('connection string leaked'))).toEqual({
      ok: false,
      code: 'INTERNAL',
      error: 'Something went wrong. Please try again.',
    });
    expect(spy).toHaveBeenCalled();
  });

  it('reports database contention as "busy, try again", not as a failure', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const known = (code: string, message: string) =>
      new Prisma.PrismaClientKnownRequestError(message, { code, clientVersion: 'test' });
    for (const error of [
      known('P2028', 'Transaction API error: Unable to start a transaction in the given time.'),
      known('P1008', 'Operations timed out after `5s`'),
      known('P2034', 'Transaction failed due to a write conflict or a deadlock.'),
      new Prisma.PrismaClientUnknownRequestError('SqliteFailure: database is locked', {
        clientVersion: 'test',
      }),
    ]) {
      expect(toActionError(error)).toEqual({ ok: false, code: 'BUSY', error: BUSY_MESSAGE });
    }
  });
});
