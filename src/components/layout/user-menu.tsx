'use client';

import * as React from 'react';
import Link from 'next/link';
import { LogOut, Settings } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { logout } from '@/lib/actions/auth';
import { ROLE_LABELS, type Role } from '@/lib/constants';
import { cn, initials } from '@/lib/utils';

export type ShellUser = { id: string; name: string; email: string; role: Role };

export function UserAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-link',
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

export function UserMenu({ user }: { user: ShellUser }) {
  const [pending, startTransition] = React.useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-9 gap-2 px-1.5 sm:px-2"
          aria-label={`Account menu for ${user.name}`}
          data-testid="user-menu"
        >
          <UserAvatar name={user.name} />
          <span className="hidden max-w-[10rem] truncate text-sm font-medium lg:inline">
            {user.name}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <div className="flex items-center gap-3">
            <UserAvatar name={user.name} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user.name}</p>
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            </div>
          </div>
          <Badge variant="info" className="mt-2">
            {ROLE_LABELS[user.role]}
          </Badge>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings aria-hidden="true" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={pending}
          onSelect={() =>
            startTransition(async () => {
              await logout();
            })
          }
          data-testid="sign-out"
        >
          <LogOut aria-hidden="true" />
          {pending ? 'Signing out...' : 'Sign out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
