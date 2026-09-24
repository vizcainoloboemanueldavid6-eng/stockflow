import { describe, expect, it } from 'vitest';
import { ROLES } from '@/lib/constants';
import { can, PERMISSIONS, permissionsFor, userChangeRefusal } from '@/lib/permissions';

const DELETE_PERMISSIONS = PERMISSIONS.filter((p) => p.endsWith(':delete'));
const USER_MANAGEMENT = PERMISSIONS.filter((p) => p.startsWith('user:'));

describe('permission matrix', () => {
  it('gives ADMIN every permission', () => {
    for (const permission of PERMISSIONS) expect(can('ADMIN', permission)).toBe(true);
  });

  it('lets STAFF view everything, create/edit products and register movements', () => {
    for (const permission of [
      'dashboard:view',
      'product:view',
      'movement:view',
      'category:view',
      'supplier:view',
      'report:view',
      'report:export',
      'product:create',
      'product:update',
      'movement:create',
      'password:change',
    ] as const) {
      expect(can('STAFF', permission), permission).toBe(true);
    }
  });

  it('never lets STAFF delete anything', () => {
    expect(DELETE_PERMISSIONS.length).toBeGreaterThanOrEqual(4);
    for (const permission of DELETE_PERMISSIONS)
      expect(can('STAFF', permission), permission).toBe(false);
    expect(can('STAFF', 'product:archive')).toBe(false);
  });

  it('never lets STAFF manage users', () => {
    for (const permission of USER_MANAGEMENT)
      expect(can('STAFF', permission), permission).toBe(false);
  });

  it('keeps STAFF out of category and supplier maintenance', () => {
    for (const permission of [
      'category:create',
      'category:update',
      'supplier:create',
      'supplier:update',
    ] as const) {
      expect(can('STAFF', permission), permission).toBe(false);
    }
  });

  it('makes DEMO an admin that cannot change passwords or delete users', () => {
    expect(can('DEMO', 'password:change')).toBe(false);
    expect(can('DEMO', 'user:set-password')).toBe(false);
    expect(can('DEMO', 'user:delete')).toBe(false);
    // Changing the shared demo login's email would lock every other visitor out.
    expect(can('DEMO', 'profile:change-email')).toBe(false);

    for (const permission of [
      'product:delete',
      'product:archive',
      'supplier:delete',
      'category:delete',
      'user:view',
      'user:create',
      'user:update',
      'report:export',
    ] as const) {
      expect(can('DEMO', permission), permission).toBe(true);
    }
    expect(permissionsFor('DEMO')).toHaveLength(PERMISSIONS.length - 4);
  });

  it('denies everything without a role', () => {
    for (const permission of PERMISSIONS) {
      expect(can(null, permission)).toBe(false);
      expect(can(undefined, permission)).toBe(false);
    }
  });

  it('lists permissions per role consistently with can()', () => {
    for (const role of ROLES) {
      const listed = new Set(permissionsFor(role));
      for (const permission of PERMISSIONS)
        expect(listed.has(permission)).toBe(can(role, permission));
    }
  });
});

describe('userChangeRefusal', () => {
  const admin = { id: 'a1', role: 'ADMIN' as const };
  const otherAdmin = { id: 'a2', role: 'ADMIN' as const };
  const staff = { id: 's1', role: 'STAFF' as const };
  const demo = { id: 'd1', role: 'DEMO' as const };

  it('allows an admin to manage other users', () => {
    expect(userChangeRefusal(admin, staff, 'update')).toBeNull();
    expect(userChangeRefusal(admin, staff, 'role', { newRole: 'ADMIN' })).toBeNull();
    expect(userChangeRefusal(admin, staff, 'set-password')).toBeNull();
    expect(userChangeRefusal(admin, staff, 'delete')).toBeNull();
  });

  it('stops users from deleting themselves or changing their own role', () => {
    expect(userChangeRefusal(admin, admin, 'delete')).toMatch(/your own account/);
    expect(userChangeRefusal(admin, admin, 'role', { newRole: 'STAFF' })).toMatch(/your own role/);
  });

  it('sends people to the Password section instead of resetting their own password', () => {
    expect(userChangeRefusal(admin, admin, 'set-password')).toMatch(/Password section/);
    expect(userChangeRefusal(admin, admin, 'update')).toBeNull();
  });

  it('keeps at least one admin', () => {
    expect(userChangeRefusal(admin, otherAdmin, 'delete', { adminCount: 1 })).toMatch(/one admin/);
    expect(
      userChangeRefusal(admin, otherAdmin, 'role', { newRole: 'STAFF', adminCount: 1 }),
    ).toMatch(/one admin/);
    expect(userChangeRefusal(admin, otherAdmin, 'delete', { adminCount: 2 })).toBeNull();
  });

  it('limits DEMO to staff accounts and never to deletes or passwords', () => {
    expect(userChangeRefusal(demo, staff, 'update')).toBeNull();
    expect(userChangeRefusal(demo, staff, 'role', { newRole: 'DEMO' })).toBeNull();
    expect(userChangeRefusal(demo, staff, 'role', { newRole: 'ADMIN' })).toMatch(/admin role/);
    expect(userChangeRefusal(demo, admin, 'update')).toMatch(/only manage staff/);
    expect(userChangeRefusal(demo, staff, 'delete')).toMatch(/permission/);
    expect(userChangeRefusal(demo, staff, 'set-password')).toMatch(/permission/);
  });

  it('refuses everything to STAFF', () => {
    for (const change of ['update', 'role', 'set-password', 'delete'] as const) {
      expect(userChangeRefusal(staff, admin, change)).toMatch(/permission/);
    }
  });
});
