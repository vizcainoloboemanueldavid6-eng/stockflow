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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { createProduct, updateProduct } from '@/lib/actions/products';
import { applyFieldErrors } from '@/lib/forms';
import type { CategoryOption, Option, ProductRow } from '@/lib/queries/products';
import {
  type ProductCreateInput,
  productCreateSchema,
  productUpdateSchema,
} from '@/lib/validations/product';

/** Radix Select cannot hold an empty value; "no supplier" travels as this sentinel. */
const NO_SUPPLIER = '__none';

type FormValues = {
  id?: string;
  sku: string;
  name: string;
  description: string;
  categoryId: string;
  supplierId: string;
  unitCost: string;
  salePrice: string;
  reorderLevel: string;
  imageUrl: string;
  initialQuantity: string;
};

function toFormValues(product: ProductRow | null | undefined): FormValues {
  if (!product) {
    return {
      sku: '',
      name: '',
      description: '',
      categoryId: '',
      supplierId: '',
      unitCost: '',
      salePrice: '',
      reorderLevel: '5',
      imageUrl: '',
      initialQuantity: '0',
    };
  }
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    description: product.description ?? '',
    categoryId: product.categoryId,
    supplierId: product.supplierId ?? '',
    unitCost: product.unitCost.toFixed(2),
    salePrice: product.salePrice.toFixed(2),
    reorderLevel: String(product.reorderLevel),
    imageUrl: product.imageUrl ?? '',
    initialQuantity: '0',
  };
}

/**
 * Create or edit a product in a dialog. Same Zod schema on both sides; a SKU that
 * is already taken comes back from the server as a field error under "SKU".
 * Quantity is not editable here - stock only changes through movements (opening
 * stock on create is recorded as a stock-in movement).
 *
 * Uncontrolled (pass `trigger`) or controlled (`open` + `onOpenChange`).
 */
export function ProductDialog({
  product,
  categories,
  suppliers,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  product?: ProductRow | null;
  categories: CategoryOption[];
  suppliers: Option[];
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;
  const editing = Boolean(product);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit product' : 'Add product'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'Update the details. To change the quantity on hand, register a movement.'
              : 'Opening stock is recorded as a stock-in movement, so the history starts complete.'}
          </DialogDescription>
        </DialogHeader>
        {open && (
          <ProductForm
            key={product?.id ?? 'new'}
            product={product ?? null}
            categories={categories}
            suppliers={suppliers}
            onDone={() => setOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ProductForm({
  product,
  categories,
  suppliers,
  onDone,
}: {
  product: ProductRow | null;
  categories: CategoryOption[];
  suppliers: Option[];
  onDone: () => void;
}) {
  const editing = Boolean(product);
  const [pending, setPending] = React.useState(false);
  const schema = editing ? productUpdateSchema : productCreateSchema;

  const form = useForm<FormValues, unknown, ProductCreateInput & { id?: string }>({
    resolver: zodResolver(schema) as unknown as Resolver<
      FormValues,
      unknown,
      ProductCreateInput & { id?: string }
    >,
    defaultValues: toFormValues(product),
  });

  async function onSubmit(values: ProductCreateInput & { id?: string }) {
    setPending(true);
    try {
      const result =
        editing && product
          ? await updateProduct({ ...values, id: product.id })
          : await createProduct(values);
      if (!result.ok) {
        const leftovers = applyFieldErrors(form, result.fieldErrors);
        // Field errors (e.g. "A record with this SKU already exists.") show under their inputs.
        if (!result.fieldErrors || leftovers.length) toast.error(result.error);
        return;
      }
      toast.success(editing ? 'Product updated' : 'Product added', {
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
        <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input
                    autoComplete="off"
                    placeholder="e.g. Wireless mouse, graphite"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="sku"
            render={({ field }) => (
              <FormItem>
                <FormLabel>SKU</FormLabel>
                <FormControl>
                  <Input
                    autoComplete="off"
                    placeholder="e.g. MOU-104"
                    className="font-mono uppercase placeholder:normal-case"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="categoryId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Category</FormLabel>
                <Select value={field.value || undefined} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger onBlur={field.onBlur}>
                      <SelectValue placeholder="Choose a category" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        <span
                          className="size-2.5 rounded-full"
                          style={{ backgroundColor: category.color }}
                          aria-hidden="true"
                        />
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="supplierId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Supplier</FormLabel>
                <Select
                  value={field.value || NO_SUPPLIER}
                  onValueChange={(value) => field.onChange(value === NO_SUPPLIER ? '' : value)}
                >
                  <FormControl>
                    <SelectTrigger onBlur={field.onBlur}>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={NO_SUPPLIER}>No supplier</SelectItem>
                    {suppliers.length > 0 && <SelectSeparator />}
                    {suppliers.map((supplier) => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <FormField
            control={form.control}
            name="unitCost"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Unit cost ($)</FormLabel>
                <FormControl>
                  <Input inputMode="decimal" autoComplete="off" placeholder="0.00" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="salePrice"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Sale price ($)</FormLabel>
                <FormControl>
                  <Input inputMode="decimal" autoComplete="off" placeholder="0.00" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="reorderLevel"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Reorder level</FormLabel>
                <FormControl>
                  <Input inputMode="numeric" autoComplete="off" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {!editing && (
            <FormField
              control={form.control}
              name="initialQuantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Opening stock</FormLabel>
                  <FormControl>
                    <Input inputMode="numeric" autoComplete="off" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>
        <p className="-mt-2 text-xs text-muted-foreground">
          At or below the reorder level the product shows up in the low stock alerts.
        </p>

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Description <span className="font-normal text-muted-foreground">(optional)</span>
              </FormLabel>
              <FormControl>
                <Textarea rows={3} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="imageUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Image link <span className="font-normal text-muted-foreground">(optional)</span>
              </FormLabel>
              <FormControl>
                <Input type="url" inputMode="url" placeholder="https://" {...field} />
              </FormControl>
              <FormDescription>A full http(s) address of a product photo.</FormDescription>
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
            {editing ? 'Save changes' : 'Add product'}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
