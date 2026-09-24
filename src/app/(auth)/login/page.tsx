import type { Metadata } from 'next';
import { LoginForm } from '@/components/auth/login-form';
import { demoEnabled, registrationEnabled } from '@/lib/config';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string | string[] }>;
}) {
  const { callbackUrl } = await searchParams;
  return (
    <LoginForm
      callbackUrl={typeof callbackUrl === 'string' ? callbackUrl : null}
      demoEnabled={demoEnabled()}
      registrationEnabled={registrationEnabled()}
    />
  );
}
