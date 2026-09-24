import type { Metadata } from 'next';
import Link from 'next/link';
import { RegisterForm } from '@/components/auth/register-form';
import { Button } from '@/components/ui/button';
import { registrationEnabled } from '@/lib/config';

export const metadata: Metadata = { title: 'Create account' };
// ALLOW_REGISTRATION is read per request, so flipping it needs no rebuild.
export const dynamic = 'force-dynamic';

export default function RegisterPage() {
  if (!registrationEnabled()) {
    return (
      <div className="space-y-4 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Registration is closed</h1>
        <p className="text-sm text-muted-foreground">
          New accounts on this workspace are created by an administrator. Ask yours for an
          invitation, or sign in if you already have an account.
        </p>
        <Button asChild className="w-full">
          <Link href="/login">Go to sign in</Link>
        </Button>
      </div>
    );
  }
  return <RegisterForm />;
}
