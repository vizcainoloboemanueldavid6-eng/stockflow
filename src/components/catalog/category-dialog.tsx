'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { LoaderCircle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { ColorPicker } from '@/components/catalog/color-picker';
import { CategoryLabel } from '@/components/inventory/badges';
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
import { createCategory, updateCategory } from '@/lib/actions/catalog';
import { CATEGORY_COLORS } from '@/lib/constants';
import { applyFieldErrors } from '@/lib/forms';
import { type CategoryInput, categorySchema } from '@/lib/validations/catalog';

export type EditableCategory = { id: string; name: string; color: string };

/** Create or rename/recolour a category. Uncontrolled with `trigger`, or controlled. */
export function CategoryDialog({
  category,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  category?: EditableCategory | null;
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{category ? 'Edit category' : 'Add category'}</DialogTitle>
          <DialogDescription>
            The colour marks the category in tables, filters and the valuation report.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <CategoryForm
            key={category?.id ?? 'new'}
            category={category ?? null}
            onDone={() => setOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CategoryForm({
  category,
  onDone,
}: {
  category: EditableCategory | null;
  onDone: () => void;
}) {
  const [pending, setPending] = React.useState(false);
  const form = useForm<CategoryInput>({
    resolver: zodResolver(categorySchema),
    defaultValues: { name: category?.name ?? '', color: category?.color ?? CATEGORY_COLORS[0] },
  });
  const name = form.watch('name');
  const color = form.watch('color');

  async function onSubmit(values: CategoryInput) {
    setPending(true);
    try {
      const result = category
        ? await updateCategory({ ...values, id: category.id })
        : await createCategory(values);
      if (!result.ok) {
        const leftovers = applyFieldErrors(form, result.fieldErrors);
        if (!result.fieldErrors || leftovers.length) toast.error(result.error);
        return;
      }
      toast.success(category ? 'Category updated' : 'Category added', {
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
                <Input autoComplete="off" placeholder="e.g. Cables & adapters" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="color"
          render={({ field, fieldState }) => (
            <FormItem>
              <FormLabel>Colour</FormLabel>
              <FormControl>
                <ColorPicker
                  value={field.value}
                  onChange={field.onChange}
                  invalid={Boolean(fieldState.error)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
          <span className="mr-2 text-muted-foreground">Preview:</span>
          <CategoryLabel
            name={name.trim() || 'Category name'}
            color={/^#[0-9a-fA-F]{6}$/.test(color) ? color : '#64748B'}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            {category ? 'Save changes' : 'Add category'}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
