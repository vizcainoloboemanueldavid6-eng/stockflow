'use client';

import * as React from 'react';
import Link from 'next/link';
import { zodResolver } from '@hookform/resolvers/zod';
import { CircleAlert, LoaderCircle, Sparkles } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { PasswordInput } from '@/components/auth/password-input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { login, loginAsDemo } from '@/lib/actions/auth';
import { applyFieldErrors } from '@/lib/forms';
import { type LoginInput, loginSchema } from '@/lib/validations/auth';

export function LoginForm({
  callbackUrl,
  demoEnabled,
  registrationEnabled,
}: {
  callbackUrl: string | null;
  demoEnabled: boolean;
  registrationEnabled: boolean;
}) {
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<'form' | 'demo' | null>(null);

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  // On success the actions redirect, so the spinner stays until the dashboard loads;
  // it is only cleared when sign-in fails.
  async function onSubmit(values: LoginInput) {
    setError(null);
    setPending('form');
    try {
      const failure = await login(values, callbackUrl);
      if (failure) {
        applyFieldErrors(form, failure.fieldErrors);
        setError(failure.error);
        form.setValue('password', '');
        form.setFocus('password');
        setPending(null);
      }
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
      setPending(null);
    }
  }

  async function onDemo() {
    setError(null);
    setPending('demo');
    try {
      const failure = await loginAsDemo();
      if (failure) {
        setError(failure.error);
        setPending(null);
      }
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
      setPending(null);
    }
  }

  const busy = pending !== null;

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in to StockFlow</h1>
        <p className="text-sm text-muted-foreground">
          Welcome back. Enter your details to continue.
        </p>
      </div>

      {demoEnabled && (
        <div className="space-y-2 rounded-lg border border-primary/25 bg-primary/5 p-4">
          <p className="text-sm font-medium">Just looking around?</p>
          <p className="text-sm text-muted-foreground">
            Explore a fully working inventory with 60 products and three months of history. No
            sign-up needed.
          </p>
          <Button
            type="button"
            className="w-full"
            onClick={onDemo}
            disabled={busy}
            data-testid="demo-login"
          >
            {pending === 'demo' ? (
              <LoaderCircle className="animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles aria-hidden="true" />
            )}
            Try the demo
          </Button>
        </div>
      )}

      {demoEnabled && (
        <div className="flex items-center gap-3 text-xs uppercase tracking-wide text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          or sign in with email
          <span className="h-px flex-1 bg-border" />
        </div>
      )}

      {error && (
        <Alert variant="destructive" aria-live="polite">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    autoComplete="email"
                    placeholder="you@company.com"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <PasswordInput autoComplete="current-password" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button
            type="submit"
            variant={demoEnabled ? 'outline' : 'default'}
            className="w-full"
            disabled={busy}
          >
            {pending === 'form' && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            Sign in
          </Button>
        </form>
      </Form>

      {registrationEnabled && (
        <p className="text-center text-sm text-muted-foreground">
          New here?{' '}
          <Link
            href="/register"
            className="font-medium text-link underline-offset-4 hover:underline"
          >
            Create an account
          </Link>
        </p>
      )}
    </div>
  );
}
