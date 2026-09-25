'use server';

import { revalidatePath } from 'next/cache';
import type { Prisma } from '@prisma/client';
import { hashPassword } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { sharedDemoAccount } from '@/lib/config';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import { userChangeRefusal } from '@/lib/permissions';
import { assertUnique } from '@/lib/unique-checks';
import { byIdSchema } from '@/lib/validations/catalog';
import { userCreateSchema, userSetPasswordSchema, userUpdateSchema } from '@/lib/validations/user';
import { createAction } from './guard';

/*
 * User management (Settings -> Users). The matrix gives it to ADMIN, and to DEMO
 * without deletes; userChangeRefusal() adds the relational rules: nobody deletes or
 * demotes themselves, the last admin stays, DEMO only renames STAFF accounts, and the
 * shared demo accounts keep their role and password while the public demo is on.
 */

/** The account an action targets, flagged when it is one of the locked shared demo accounts. */
async function findTarget(db: Pick<Prisma.TransactionClient, 'user'>, id: string) {
  const target = await db.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!target) throw new NotFoundError('This user no longer exists.');
  return { ...target, shared: sharedDemoAccount(target.email) };
}

function revalidateUsers() {
  revalidatePath('/settings');
  revalidatePath('/movements');
}

export const createUser = createAction(
  { permission: 'user:create', schema: userCreateSchema },
  async ({ password, ...input }, { user }) => {
    if (user.role === 'DEMO' && input.role !== 'STAFF') {
      throw new ForbiddenError('The demo account can only create staff accounts.');
    }
    await assertUnique('userEmail', input.email);
    const passwordHash = await hashPassword(password);
    const created = await prisma.$transaction(async (tx) => {
      const saved = await tx.user.create({
        data: { ...input, passwordHash },
        select: { id: true, name: true },
      });
      await audit(tx, {
        userId: user.id,
        action: 'user.create',
        entity: 'User',
        entityId: saved.id,
      });
      return saved;
    });
    revalidateUsers();
    return created;
  },
);

/** Rename and/or change the role of another account (or rename yourself). */
export const updateUser = createAction(
  { permission: 'user:update', schema: userUpdateSchema },
  async ({ id, name, role }, { user }) => {
    const updated = await prisma.$transaction(async (tx) => {
      const target = await findTarget(tx, id);
      const roleChanges = role !== target.role;
      const adminCount = roleChanges
        ? await tx.user.count({ where: { role: 'ADMIN' } })
        : undefined;
      const refusal = userChangeRefusal(user, target, roleChanges ? 'role' : 'update', {
        newRole: role,
        adminCount,
      });
      if (refusal) throw new ForbiddenError(refusal);

      const saved = await tx.user.update({
        where: { id },
        data: { name, role },
        select: { id: true, name: true, role: true },
      });
      await audit(tx, {
        userId: user.id,
        action: roleChanges ? 'user.role-change' : 'user.update',
        entity: 'User',
        entityId: id,
      });
      return saved;
    });
    revalidateUsers();
    return updated;
  },
);

/**
 * An admin sets a new password for another account (e.g. a colleague who forgot
 * theirs). DEMO lacks user:set-password; your own password is changed in the
 * Password section, which checks the current one.
 */
export const setUserPassword = createAction(
  {
    permission: 'user:set-password',
    schema: userSetPasswordSchema,
    deniedMessage: 'Only administrators can reset passwords.',
  },
  async ({ id, password }, { user }) => {
    const target = await findTarget(prisma, id);
    const refusal = userChangeRefusal(user, target, 'set-password');
    if (refusal) throw new ForbiddenError(refusal);

    const passwordHash = await hashPassword(password);
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { passwordHash } });
      await audit(tx, {
        userId: user.id,
        action: 'user.set-password',
        entity: 'User',
        entityId: id,
      });
    });
    return { id, name: target.name };
  },
);

/** ADMIN only (DEMO lacks user:delete). Their movements stay, attributed to "deleted user". */
export const deleteUser = createAction(
  {
    permission: 'user:delete',
    schema: byIdSchema,
    deniedMessage: 'Only administrators can delete users.',
  },
  async ({ id }, { user }) => {
    const deleted = await prisma.$transaction(async (tx) => {
      const target = await findTarget(tx, id);
      const adminCount = await tx.user.count({ where: { role: 'ADMIN' } });
      const refusal = userChangeRefusal(user, target, 'delete', { adminCount });
      if (refusal) throw new ForbiddenError(refusal);

      await tx.user.delete({ where: { id } });
      await audit(tx, { userId: user.id, action: 'user.delete', entity: 'User', entityId: id });
      return { id, name: target.name };
    });
    revalidateUsers();
    return deleted;
  },
);
