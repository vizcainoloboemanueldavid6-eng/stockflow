import type { Role } from '@/lib/constants';

/**
 * Capability matrix. This file is the single definition of "who may do what":
 * server actions and route handlers enforce it through requirePermission()
 * (src/lib/actions/guard.ts), and the UI uses can() only to hide controls.
 * It is pure and isomorphic, so it is safe to import from client components.
 */
export const PERMISSIONS = [
  'dashboard:view',
  'product:view',
  'product:create',
  'product:update',
  'product:archive',
  'product:delete',
  'movement:view',
  'movement:create',
  'category:view',
  'category:create',
  'category:update',
  'category:delete',
  'supplier:view',
  'supplier:create',
  'supplier:update',
  'supplier:delete',
  'report:view',
  'report:export',
  'user:view',
  'user:create',
  'user:update',
  'user:set-password',
  'user:delete',
  'profile:update',
  'profile:change-email',
  'password:change',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const VIEW_ALL: Permission[] = [
  'dashboard:view',
  'product:view',
  'movement:view',
  'category:view',
  'supplier:view',
  'report:view',
  'report:export',
];

/** Everything a signed-in user may do to their own account. */
const OWN_ACCOUNT: Permission[] = ['profile:update', 'profile:change-email', 'password:change'];

/**
 * DEMO is ADMIN minus anything that would let one visitor lock the shared demo
 * account (or the other seeded accounts) for everyone else until the next reset.
 */
const DEMO_DENIED: Permission[] = [
  'password:change',
  'user:set-password',
  'user:delete',
  'profile:change-email',
];

const MATRIX: Record<Role, ReadonlySet<Permission>> = {
  ADMIN: new Set(PERMISSIONS),
  STAFF: new Set<Permission>([
    ...VIEW_ALL,
    'product:create',
    'product:update',
    'movement:create',
    ...OWN_ACCOUNT,
  ]),
  DEMO: new Set(PERMISSIONS.filter((permission) => !DEMO_DENIED.includes(permission))),
};

export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return MATRIX[role]?.has(permission) ?? false;
}

export function permissionsFor(role: Role): Permission[] {
  return PERMISSIONS.filter((permission) => MATRIX[role].has(permission));
}

/**
 * `shared`: one of the three seeded accounts while the public demo is on (computed on
 * the server by sharedDemoAccount() in src/lib/config.ts). Their credentials are
 * published, so they are locked for everyone.
 */
type UserRef = { id: string; role: Role; shared?: boolean };

export type UserChange = 'update' | 'role' | 'set-password' | 'delete';

/** Why a shared demo account cannot be changed (Settings -> Users and the server). */
export const SHARED_ACCOUNT_MESSAGE =
  'A shared demo account: its role, password and email stay as published, so every visitor can use it.';

/**
 * Rules for acting on *another* user that a flat matrix cannot express.
 * Returns the reason a change is refused, or null when it is allowed.
 * The caller still needs the matching permission; this adds the relational checks.
 *
 * - Nobody deletes themselves or changes their own role (no accidental lock-out), and
 *   nobody resets their own password here (that path skips the current-password check).
 * - A shared demo account keeps its role and password and cannot be deleted, whoever
 *   asks (renaming it is harmless and allowed).
 * - DEMO may rename STAFF accounts, but not touch ADMIN or other DEMO accounts, and it
 *   cannot change anyone's role: turning a Staff account into a Demo one would take it
 *   out of DEMO's own reach, and the published Staff login would stop showing Staff.
 * - The last remaining ADMIN can be neither demoted nor deleted.
 */
export function userChangeRefusal(
  actor: UserRef,
  target: UserRef,
  change: UserChange,
  options: { newRole?: Role; adminCount?: number } = {},
): string | null {
  const permission: Record<UserChange, Permission> = {
    update: 'user:update',
    role: 'user:update',
    'set-password': 'user:set-password',
    delete: 'user:delete',
  };
  if (!can(actor.role, permission[change])) return "You don't have permission to do that.";

  const self = actor.id === target.id;
  if (self && change === 'delete') return 'You cannot delete your own account.';
  if (self && change === 'role') return 'You cannot change your own role.';
  if (self && change === 'set-password') {
    return 'Change your own password in the Password section, which asks for the current one.';
  }

  if (target.shared && change !== 'update') return SHARED_ACCOUNT_MESSAGE;

  if (actor.role === 'DEMO') {
    if (target.role !== 'STAFF' && !self) {
      return 'The demo account can only manage staff accounts.';
    }
    if (change === 'role' && options.newRole !== 'STAFF') {
      return 'The demo account cannot change roles; staff accounts stay staff.';
    }
  }

  const removesAdmin =
    target.role === 'ADMIN' &&
    (change === 'delete' || (change === 'role' && options.newRole !== 'ADMIN'));
  if (removesAdmin && options.adminCount !== undefined && options.adminCount <= 1) {
    return 'At least one admin account must remain.';
  }

  return null;
}
