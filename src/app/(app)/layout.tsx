import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/layout/app-shell';
import { DemoBanner } from '@/components/layout/demo-banner';
import { getCurrentUser } from '@/lib/actions/guard';
import { SIDEBAR_COOKIE } from '@/lib/navigation';

/**
 * Frame for every signed-in page. The middleware already rejected guests; this
 * re-reads the user from the database so a deleted account (whose JWT is still
 * valid) is signed out instead of seeing the app.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/logout');

  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === 'collapsed';

  return (
    <div className="flex min-h-dvh flex-col">
      <DemoBanner />
      <AppShell user={user} defaultCollapsed={collapsed}>
        {children}
      </AppShell>
    </div>
  );
}
