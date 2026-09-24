'use server';

import { revalidatePath } from 'next/cache';
import { hashPassword } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import { userChangeRefusal } from '@/lib/permissions';
import { byIdSchema } from '@/lib/validations/catalog';
import { userCreateSchema, userUpdateSchema } from '@/lib/validations/user';
import { createAction } from './guard';

/*
 * User management (Settings -> Users). The matrix gives it to ADMIN, and to DEMO
 * without deletes; userChangeRefusal() adds the relational rules: nobody deletes or
 * demotes themselves, the last admin stays, and DEMO only manages STAFF accounts.
 */

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
      const target = await tx.user.findUnique({ where: { id }, select: { id: true, role: true } });
      if (!target) throw new NotFoundError('This user no longer exists.');
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

/** ADMIN only (DEMO lacks user:delete). Their movements stay, attributed to "deleted user". */
export const deleteUser = createAction(
  {
    permission: 'user:delete',
    schema: byIdSchema,
    deniedMessage: 'Only administrators can delete users.',
  },
  async ({ id }, { user }) => {
    const deleted = await prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({
        where: { id },
        select: { id: true, name: true, role: true },
      });
      if (!target) throw new NotFoundError('This user no longer exists.');
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
