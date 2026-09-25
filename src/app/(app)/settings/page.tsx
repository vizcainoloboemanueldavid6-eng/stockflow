import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { KeyRound, Palette, UserRound, Users } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { PasswordForm } from '@/components/settings/password-form';
import { ProfileForm } from '@/components/settings/profile-form';
import { ThemePicker } from '@/components/settings/theme-picker';
import { UsersSection } from '@/components/settings/users-section';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getCurrentUser } from '@/lib/actions/guard';
import { sharedDemoAccount } from '@/lib/config';
import { ROLE_LABELS } from '@/lib/constants';
import { prisma } from '@/lib/db';
import { can } from '@/lib/permissions';
import { listUsers } from '@/lib/queries/catalog';
import { firstValues, type RawSearchParams } from '@/lib/search-params';

export const metadata: Metadata = { title: 'Settings' };

const TABS = ['account', 'appearance', 'users'] as const;
type Tab = (typeof TABS)[number];

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const canViewUsers = can(user.role, 'user:view');
  const requested = firstValues(await searchParams).tab as Tab | undefined;
  const tab: Tab =
    requested && TABS.includes(requested) && (requested !== 'users' || canViewUsers)
      ? requested
      : 'account';

  // A seeded account while the public demo is on: its sign-in details stay as published.
  const shared = sharedDemoAccount(user.email);
  const [users, adminCount] = canViewUsers
    ? await Promise.all([listUsers(), prisma.user.count({ where: { role: 'ADMIN' } })])
    : [[], 0];

  return (
    <>
      <PageHeader
        title="Settings"
        description={
          <>
            Signed in as {user.email}{' '}
            <Badge variant="info" className="ml-1 align-middle">
              {ROLE_LABELS[user.role]}
            </Badge>
          </>
        }
      />
      <Tabs defaultValue={tab} className="gap-6">
        <TabsList className="w-full justify-start overflow-x-auto sm:w-fit">
          <TabsTrigger value="account">
            <UserRound aria-hidden="true" />
            Account
          </TabsTrigger>
          <TabsTrigger value="appearance">
            <Palette aria-hidden="true" />
            Appearance
          </TabsTrigger>
          {canViewUsers && (
            <TabsTrigger value="users">
              <Users aria-hidden="true" />
              Users
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="account" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserRound className="size-4 text-muted-foreground" aria-hidden="true" />
                Profile
              </CardTitle>
              <CardDescription>Your name and the email you sign in with.</CardDescription>
            </CardHeader>
            <CardContent>
              <ProfileForm
                name={user.name}
                email={user.email}
                canChangeEmail={can(user.role, 'profile:change-email') && !shared}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="size-4 text-muted-foreground" aria-hidden="true" />
                Password
              </CardTitle>
              <CardDescription>Enter your current password to choose a new one.</CardDescription>
            </CardHeader>
            <CardContent>
              <PasswordForm allowed={can(user.role, 'password:change') && !shared} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="appearance">
          <Card>
            <CardHeader>
              <CardTitle>Theme</CardTitle>
              <CardDescription>
                Saved in this browser. The toggle in the top bar does the same.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ThemePicker />
            </CardContent>
          </Card>
        </TabsContent>

        {canViewUsers && (
          <TabsContent value="users">
            <Card>
              <CardHeader>
                <CardTitle>Users</CardTitle>
                <CardDescription>Who can sign in, and with which role.</CardDescription>
              </CardHeader>
              <CardContent>
                <UsersSection
                  users={users}
                  actor={{ id: user.id, role: user.role }}
                  adminCount={adminCount}
                  permissions={{
                    create: can(user.role, 'user:create'),
                    update: can(user.role, 'user:update'),
                    setPassword: can(user.role, 'user:set-password'),
                    delete: can(user.role, 'user:delete'),
                  }}
                />
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </>
  );
}
