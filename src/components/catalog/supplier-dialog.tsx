'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { LoaderCircle } from 'lucide-react';
import { type Resolver, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { createSupplier, updateSupplier } from '@/lib/actions/catalog';
import { applyFieldErrors } from '@/lib/forms';
import { type SupplierInput, supplierSchema } from '@/lib/validations/catalog';

export type EditableSupplier = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
};

type FormValues = { name: string; email: string; phone: string; notes: string };

/** Create or edit a supplier. Uncontrolled with `trigger`, or controlled. */
export function SupplierDialog({
  supplier,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  supplier?: EditableSupplier | null;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{supplier ? 'Edit supplier' : 'Add supplier'}</DialogTitle>
          <DialogDescription>
            Only the name is required; contact details are optional.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <SupplierForm
            key={supplier?.id ?? 'new'}
            supplier={supplier ?? null}
            onDone={() => setOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function SupplierForm({
  supplier,
  onDone,
}: {
  supplier: EditableSupplier | null;
  onDone: () => void;
}) {
  const [pending, setPending] = React.useState(false);
  const form = useForm<FormValues, unknown, SupplierInput>({
    resolver: zodResolver(supplierSchema) as unknown as Resolver<
      FormValues,
      unknown,
      SupplierInput
    >,
    defaultValues: {
      name: supplier?.name ?? '',
      email: supplier?.email ?? '',
      phone: supplier?.phone ?? '',
      notes: supplier?.notes ?? '',
    },
  });

  async function onSubmit(values: SupplierInput) {
    setPending(true);
    try {
      const result = supplier
        ? await updateSupplier({ ...values, id: supplier.id })
        : await createSupplier(values);
      if (!result.ok) {
        const leftovers = applyFieldErrors(form, result.fieldErrors);
        if (!result.fieldErrors || leftovers.length) toast.error(result.error);
        return;
      }
      toast.success(supplier ? 'Supplier updated' : 'Supplier added', {
        description: result.data.name,
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
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input autoComplete="organization" placeholder="e.g. Harbor Parts Co." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Email <span className="font-normal text-muted-foreground">(optional)</span>
                </FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    autoComplete="email"
                    placeholder="orders@vendor.example"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Phone <span className="font-normal text-muted-foreground">(optional)</span>
                </FormLabel>
                <FormControl>
                  <Input type="tel" autoComplete="tel" placeholder="+1 555 0100" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Notes <span className="font-normal text-muted-foreground">(optional)</span>
              </FormLabel>
              <FormControl>
                <Textarea
                  rows={3}
                  placeholder="Lead times, minimum order, account number..."
                  {...field}
                />
              </FormControl>
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
            {supplier ? 'Save changes' : 'Add supplier'}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
