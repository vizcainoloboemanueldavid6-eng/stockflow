'use server';

import { revalidatePath } from 'next/cache';
import { hashPassword, verifyPassword } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { sharedDemoAccount } from '@/lib/config';
import { DEMO_EMAIL_MESSAGE, DEMO_PASSWORD_MESSAGE } from '@/lib/constants';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { can } from '@/lib/permissions';
import { assertUnique } from '@/lib/unique-checks';
import { changePasswordSchema, profileSchema } from '@/lib/validations/user';
import { createAction } from './guard';

/*
 * The signed-in user's own account (Settings -> Profile / Password).
 * The DEMO role, and every shared demo account while the public demo is on (the three
 * seeded accounts, whose credentials are published), may rename themselves but not
 * change their email or password: either would lock every other visitor out of that
 * login until the next reset.
 */

export const updateProfile = createAction(
  { permission: 'profile:update', schema: profileSchema },
  async ({ name, email }, { user }) => {
    if (
      email !== user.email &&
      (!can(user.role, 'profile:change-email') || sharedDemoAccount(user.email))
    ) {
      throw new ForbiddenError(DEMO_EMAIL_MESSAGE);
    }
    if (email !== user.email) await assertUnique('userEmail', email, user.id);
    const updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.user.update({
        where: { id: user.id },
        data: { name, email },
        select: { id: true, name: true, email: true },
      });
      await audit(tx, {
        userId: user.id,
        action: 'profile.update',
        entity: 'User',
        entityId: user.id,
      });
      return saved;
    });
    revalidatePath('/', 'layout');
    return updated;
  },
);

export const changePassword = createAction(
  {
    permission: 'password:change',
    schema: changePasswordSchema,
    deniedMessage: DEMO_PASSWORD_MESSAGE,
  },
  async ({ currentPassword, newPassword }, { user }) => {
    if (sharedDemoAccount(user.email)) throw new ForbiddenError(DEMO_PASSWORD_MESSAGE);
    const row = await prisma.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true },
    });
    if (!row) throw new NotFoundError('Your account no longer exists.');
    if (!(await verifyPassword(currentPassword, row.passwordHash))) {
      throw new ValidationError('Your current password is not correct.', {
        currentPassword: ['This is not your current password.'],
      });
    }
    const passwordHash = await hashPassword(newPassword);
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      await audit(tx, {
        userId: user.id,
        action: 'user.password-change',
        entity: 'User',
        entityId: user.id,
      });
    });
    return null;
  },
);
