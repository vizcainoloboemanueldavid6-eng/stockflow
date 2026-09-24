'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Info, LoaderCircle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { PasswordInput } from '@/components/auth/password-input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { changePassword } from '@/lib/actions/account';
import { DEMO_PASSWORD_MESSAGE, PASSWORD_MIN_LENGTH } from '@/lib/constants';
import { applyFieldErrors } from '@/lib/forms';
import { type ChangePasswordInput, changePasswordSchema } from '@/lib/validations/user';

/**
 * Change your own password (current one required). For the shared demo account
 * the form is disabled with the reason; the server action refuses it as well.
 */
export function PasswordForm({ allowed }: { allowed: boolean }) {
  const [pending, setPending] = React.useState(false);
  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  async function onSubmit(values: ChangePasswordInput) {
    setPending(true);
    try {
      const result = await changePassword(values);
      if (!result.ok) {
        const leftovers = applyFieldErrors(form, result.fieldErrors);
        if (!result.fieldErrors || leftovers.length) toast.error(result.error);
        return;
      }
      form.reset();
      toast.success('Password changed', {
        description: 'Use the new password the next time you sign in.',
      });
    } catch {
      toast.error('Could not reach the server. Check your connection and try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="max-w-lg space-y-4">
      {!allowed && (
        <Alert variant="info" data-testid="demo-password-notice">
          <Info aria-hidden="true" />
          <AlertDescription>{DEMO_PASSWORD_MESSAGE}</AlertDescription>
        </Alert>
      )}
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4" noValidate>
          <fieldset disabled={!allowed || pending} className="grid gap-4 disabled:opacity-60">
            <FormField
              control={form.control}
              name="currentPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Current password</FormLabel>
                  <FormControl>
                    <PasswordInput autoComplete="current-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="newPassword"
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
            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm new password</FormLabel>
                  <FormControl>
                    <PasswordInput autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div>
              <Button type="submit" disabled={!allowed || pending}>
                {pending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
                Change password
              </Button>
            </div>
          </fieldset>
        </form>
      </Form>
    </div>
  );
}
