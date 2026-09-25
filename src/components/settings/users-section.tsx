'use client';

import * as React from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Info,
  KeyRound,
  LoaderCircle,
  MoreHorizontal,
  Pencil,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { PasswordInput } from '@/components/auth/password-input';
import { ConfirmDialog } from '@/components/inventory/confirm-dialog';
import { EmptyState } from '@/components/layout/empty-state';
import { UserAvatar } from '@/components/layout/user-menu';
import { DataTable } from '@/components/tables/data-table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createUser, deleteUser, setUserPassword, updateUser } from '@/lib/actions/users';
import { PASSWORD_MIN_LENGTH, ROLE_LABELS, ROLES, type Role } from '@/lib/constants';
import { applyFieldErrors } from '@/lib/forms';
import { formatNumber } from '@/lib/format';
import { SHARED_ACCOUNT_MESSAGE, userChangeRefusal } from '@/lib/permissions';
import type { UserRow } from '@/lib/queries/catalog';
import { passwordSchema } from '@/lib/validations/common';
import {
  type UserCreateInput,
  userCreateSchema,
  type UserUpdateInput,
  userUpdateSchema,
} from '@/lib/validations/user';

export type UserPermissions = {
  create: boolean;
  update: boolean;
  setPassword: boolean;
  delete: boolean;
};

type Actor = { id: string; role: Role };

const ROLE_VARIANT: Record<Role, 'info' | 'secondary' | 'outline'> = {
  ADMIN: 'info',
  STAFF: 'secondary',
  DEMO: 'outline',
};

const ROLE_HINTS: Record<Role, string> = {
  ADMIN: 'Everything, including users and deletes.',
  STAFF: 'Products and movements; no deletes, no user management.',
  DEMO: 'Like an admin, but cannot change passwords or roles, or delete users.',
};

/** Roles the actor may assign when editing: DEMO changes no roles (server: userChangeRefusal). */
function assignableRoles(actor: Actor): Role[] {
  return actor.role === 'DEMO' ? ['STAFF'] : [...ROLES];
}

/** Roles for a new account: DEMO only creates STAFF accounts (server: createUser). */
function creatableRoles(actor: Actor): Role[] {
  return actor.role === 'DEMO' ? ['STAFF'] : [...ROLES];
}

/**
 * Settings -> Users. ADMIN manages every account; DEMO can view, add and edit
 * staff accounts but not delete users or reset passwords. Each server action
 * re-checks the same rules (userChangeRefusal) whatever this UI shows.
 */
export function UsersSection({
  users,
  actor,
  adminCount,
  permissions,
}: {
  users: UserRow[];
  actor: Actor;
  adminCount: number;
  permissions: UserPermissions;
}) {
  const [creating, setCreating] = React.useState(false);

  const columns = React.useMemo<ColumnDef<UserRow>[]>(
    () => [
      {
        id: 'name',
        header: 'User',
        cell: ({ row }) => {
          const user = row.original;
          return (
            <div className="flex min-w-0 items-center gap-3">
              <UserAvatar name={user.name} className="hidden sm:flex" />
              <div className="flex min-w-0 max-w-[9rem] flex-col sm:max-w-[14rem] xl:max-w-xs">
                <span className="truncate font-medium">
                  {user.name}
                  {user.id === actor.id && (
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span>
                  )}
                </span>
                <span className="truncate text-xs text-muted-foreground">{user.email}</span>
              </div>
            </div>
          );
        },
      },
      {
        id: 'role',
        header: 'Role',
        cell: ({ row }) => (
          <Badge variant={ROLE_VARIANT[row.original.role]}>{ROLE_LABELS[row.original.role]}</Badge>
        ),
      },
      {
        id: 'created',
        header: 'Joined',
        meta: { className: 'hidden xl:table-cell' },
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.createdLabel}</span>
        ),
      },
      {
        id: 'movements',
        header: 'Movements',
        meta: { numeric: true, className: 'hidden sm:table-cell' },
        cell: ({ row }) => formatNumber(row.original.movementCount),
      },
      {
        id: 'actions',
        header: '',
        meta: { label: 'Actions', className: 'w-0 pl-0 text-right' },
        cell: ({ row }) => (
          <UserRowActions
            user={row.original}
            actor={actor}
            adminCount={adminCount}
            permissions={permissions}
          />
        ),
      },
    ],
    [actor, adminCount, permissions],
  );

  return (
    <div className="space-y-4" data-testid="users-section">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="max-w-xl text-sm text-muted-foreground">
          {users.length === 1 ? '1 account' : `${formatNumber(users.length)} accounts`} can sign in.
          Roles decide what each person can do.
        </p>
        {permissions.create && (
          <Button onClick={() => setCreating(true)} data-testid="add-user">
            <UserPlus aria-hidden="true" />
            Add user
          </Button>
        )}
      </div>

      {actor.role === 'DEMO' && (
        <Alert variant="info">
          <Info aria-hidden="true" />
          <AlertDescription>
            The demo account can view users, add staff accounts and rename them. It cannot delete
            users, reset passwords or change roles.
          </AlertDescription>
        </Alert>
      )}

      {users.length ? (
        <DataTable columns={columns} data={users} getRowId={(row) => row.id} caption="Users" />
      ) : (
        <EmptyState
          title="No users"
          description="Add the people who manage stock with you."
          action={
            permissions.create ? <Button onClick={() => setCreating(true)}>Add user</Button> : null
          }
        />
      )}

      {permissions.create && (
        <Dialog open={creating} onOpenChange={setCreating}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add user</DialogTitle>
              <DialogDescription>
                Share the password with them privately; they can change it in Settings.
              </DialogDescription>
            </DialogHeader>
            {creating && <CreateUserForm actor={actor} onDone={() => setCreating(false)} />}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function RoleSelect({
  value,
  onChange,
  roles,
  disabled,
  onBlur,
  ...rest
}: {
  value: Role;
  onChange: (role: Role) => void;
  roles: Role[];
  disabled?: boolean;
  onBlur?: () => void;
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as Role)} disabled={disabled}>
      <SelectTrigger onBlur={onBlur} {...rest}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {roles.map((role) => (
          <SelectItem key={role} value={role}>
            {ROLE_LABELS[role]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CreateUserForm({ actor, onDone }: { actor: Actor; onDone: () => void }) {
  const [pending, setPending] = React.useState(false);
  const roles = creatableRoles(actor);
  const form = useForm<UserCreateInput>({
    resolver: zodResolver(userCreateSchema),
    defaultValues: { name: '', email: '', role: 'STAFF', password: '' },
  });
  const role = form.watch('role');

  async function onSubmit(values: UserCreateInput) {
    setPending(true);
    try {
      const result = await createUser(values);
      if (!result.ok) {
        const leftovers = applyFieldErrors(form, result.fieldErrors);
        if (!result.fieldErrors || leftovers.length) toast.error(result.error);
        return;
      }
      toast.success('User added', {
        description: `${result.data.name} can sign in as ${ROLE_LABELS[values.role]}.`,
      });
      onDone();
    } catch {
      toast.error('Could not reach the server. Check your connection and try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Full name</FormLabel>
              <FormControl>
                <Input autoComplete="off" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="off" placeholder="name@company.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="role"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Role</FormLabel>
              <FormControl>
                <RoleSelect
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  roles={roles}
                />
              </FormControl>
              <FormDescription>{ROLE_HINTS[role]}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Initial password</FormLabel>
              <FormControl>
                <PasswordInput autoComplete="new-password" {...field} />
              </FormControl>
              <FormDescription>
                At least {PASSWORD_MIN_LENGTH} characters, with a letter and a number.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            Add user
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

function UserRowActions({
  user,
  actor,
  adminCount,
  permissions,
}: {
  user: UserRow;
  actor: Actor;
  adminCount: number;
  permissions: UserPermissions;
}) {
  const [dialog, setDialog] = React.useState<'edit' | 'password' | 'delete' | null>(null);
  const close = () => setDialog(null);

  // Same rules the server applies; a refused item is shown disabled with the reason.
  const editRefusal = userChangeRefusal(actor, user, 'update');
  const passwordRefusal = userChangeRefusal(actor, user, 'set-password');
  const deleteRefusal = userChangeRefusal(actor, user, 'delete', { adminCount });

  const anything = permissions.update || permissions.setPassword || permissions.delete;
  if (!anything) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={`Actions for ${user.name}`}
          >
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {permissions.update && (
            <MenuItemWithReason
              icon={Pencil}
              label="Edit name and role"
              reason={editRefusal}
              onSelect={() => setDialog('edit')}
            />
          )}
          {permissions.setPassword && (
            <MenuItemWithReason
              icon={KeyRound}
              label="Set a new password"
              reason={passwordRefusal}
              onSelect={() => setDialog('password')}
            />
          )}
          {permissions.delete && (
            <>
              <DropdownMenuSeparator />
              <MenuItemWithReason
                icon={Trash2}
                label="Delete user"
                reason={deleteRefusal}
                destructive
                onSelect={() => setDialog('delete')}
              />
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialog === 'edit'} onOpenChange={(open) => !open && close()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit {user.name}</DialogTitle>
            <DialogDescription>{user.email}</DialogDescription>
          </DialogHeader>
          {dialog === 'edit' && (
            <EditUserForm user={user} actor={actor} adminCount={adminCount} onDone={close} />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'password'} onOpenChange={(open) => !open && close()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Set a new password</DialogTitle>
            <DialogDescription>
              For {user.name}. Their current sessions stay signed in until they expire.
            </DialogDescription>
          </DialogHeader>
          {dialog === 'password' && <SetPasswordForm user={user} onDone={close} />}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={dialog === 'delete'}
        onOpenChange={(open) => !open && close()}
        title={`Delete ${user.name}?`}
        description={
          <p>
            They can no longer sign in. Their {formatNumber(user.movementCount)} recorded movements
            stay in the history, shown as &ldquo;Deleted user&rdquo;.
          </p>
        }
        confirmLabel="Delete user"
        destructive
        onConfirm={async () => {
          try {
            const result = await deleteUser({ id: user.id });
            if (!result.ok) {
              toast.error(result.error);
              return false;
            }
            toast.success('User deleted', { description: result.data.name });
            return true;
          } catch {
            toast.error('Could not reach the server. Check your connection and try again.');
            return false;
          }
        }}
      />
    </>
  );
}

/** A menu item that is disabled, with the reason underneath, when the rules refuse it. */
function MenuItemWithReason({
  icon: Icon,
  label,
  reason,
  destructive = false,
  onSelect,
}: {
  icon: typeof Pencil;
  label: string;
  reason: string | null;
  destructive?: boolean;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem
      variant={destructive ? 'destructive' : 'default'}
      disabled={Boolean(reason)}
      onSelect={onSelect}
    >
      <Icon aria-hidden="true" />
      <span className="flex flex-col">
        {label}
        {reason && <span className="text-xs font-normal text-muted-foreground">{reason}</span>}
      </span>
    </DropdownMenuItem>
  );
}

function EditUserForm({
  user,
  actor,
  adminCount,
  onDone,
}: {
  user: UserRow;
  actor: Actor;
  adminCount: number;
  onDone: () => void;
}) {
  const [pending, setPending] = React.useState(false);
  const self = user.id === actor.id;
  const roles = assignableRoles(actor);
  // Why the role cannot change at all: your own account, or a shared demo account.
  const roleLocked = self
    ? 'You cannot change your own role.'
    : user.shared
      ? SHARED_ACCOUNT_MESSAGE
      : null;
  const form = useForm<UserUpdateInput>({
    resolver: zodResolver(userUpdateSchema),
    defaultValues: { id: user.id, name: user.name, role: user.role },
  });
  const role = form.watch('role');
  const roleRefusal =
    role !== user.role
      ? userChangeRefusal(actor, user, 'role', { newRole: role, adminCount })
      : null;

  async function onSubmit(values: UserUpdateInput) {
    setPending(true);
    try {
      const result = await updateUser(values);
      if (!result.ok) {
        const leftovers = applyFieldErrors(form, result.fieldErrors);
        if (!result.fieldErrors || leftovers.length) toast.error(result.error);
        return;
      }
      toast.success('User updated', {
        description: `${result.data.name} is ${ROLE_LABELS[result.data.role]}.`,
      });
      onDone();
    } catch {
      toast.error('Could not reach the server. Check your connection and try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Full name</FormLabel>
              <FormControl>
                <Input autoComplete="off" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="role"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Role</FormLabel>
              <FormControl>
                <RoleSelect
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  roles={roles.includes(user.role) ? roles : [user.role, ...roles]}
                  disabled={Boolean(roleLocked)}
                />
              </FormControl>
              <FormDescription>{roleLocked ?? ROLE_HINTS[field.value]}</FormDescription>
              {roleRefusal && (
                <p className="text-xs font-medium text-destructive dark:text-red-400" role="alert">
                  {roleRefusal}
                </p>
              )}
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending || Boolean(roleRefusal)}>
            {pending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            Save changes
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

const setPasswordFormSchema = z.object({ password: passwordSchema });
type SetPasswordValues = z.infer<typeof setPasswordFormSchema>;

function SetPasswordForm({ user, onDone }: { user: UserRow; onDone: () => void }) {
  const [pending, setPending] = React.useState(false);
  const form = useForm<SetPasswordValues>({
    resolver: zodResolver(setPasswordFormSchema),
    defaultValues: { password: '' },
  });

  async function onSubmit(values: SetPasswordValues) {
    setPending(true);
    try {
      const result = await setUserPassword({ id: user.id, password: values.password });
      if (!result.ok) {
        const leftovers = applyFieldErrors(form, result.fieldErrors);
        if (!result.fieldErrors || leftovers.length) toast.error(result.error);
        return;
      }
      toast.success('Password updated', {
        description: `Share the new password with ${result.data.name} privately.`,
      });
      onDone();
    } catch {
      toast.error('Could not reach the server. Check your connection and try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>New password</FormLabel>
              <FormControl>
                <PasswordInput autoComplete="new-password" {...field} />
              </FormControl>
              <FormDescription>
                At least {PASSWORD_MIN_LENGTH} characters, with a letter and a number.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            Set password
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
