'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { LoaderCircle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
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
import { Input } from '@/components/ui/input';
import { updateProfile } from '@/lib/actions/account';
import { DEMO_EMAIL_MESSAGE } from '@/lib/constants';
import { applyFieldErrors } from '@/lib/forms';
import { type ProfileInput, profileSchema } from '@/lib/validations/user';

/** Name and sign-in email of the current user. The shared demo account keeps its email. */
export function ProfileForm({
  name,
  email,
  canChangeEmail,
}: {
  name: string;
  email: string;
  canChangeEmail: boolean;
}) {
  const [pending, setPending] = React.useState(false);
  const form = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name, email },
  });

  async function onSubmit(values: ProfileInput) {
    setPending(true);
    try {
      const result = await updateProfile(values);
      if (!result.ok) {
        const leftovers = applyFieldErrors(form, result.fieldErrors);
        if (!result.fieldErrors || leftovers.length) toast.error(result.error);
        return;
      }
      form.reset({ name: result.data.name, email: result.data.email });
      toast.success('Profile saved');
    } catch {
      toast.error('Could not reach the server. Check your connection and try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid max-w-lg gap-4" noValidate>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Full name</FormLabel>
              <FormControl>
                <Input autoComplete="name" {...field} />
              </FormControl>
              <FormDescription>Shown in the movement history next to your changes.</FormDescription>
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
                <Input type="email" autoComplete="email" readOnly={!canChangeEmail} {...field} />
              </FormControl>
              <FormDescription>
                {canChangeEmail ? 'You sign in with this address.' : DEMO_EMAIL_MESSAGE}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <div>
          <Button type="submit" disabled={pending || !form.formState.isDirty}>
            {pending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            Save profile
          </Button>
        </div>
      </form>
    </Form>
  );
}
