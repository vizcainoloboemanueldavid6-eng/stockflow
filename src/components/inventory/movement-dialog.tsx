'use client';

import * as React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowDownLeft, ArrowUpRight, LoaderCircle, Scale } from 'lucide-react';
import { type Resolver, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { ProductCombobox } from '@/components/inventory/product-combobox';
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
import { Textarea } from '@/components/ui/textarea';
import type { ProductSearchHit } from '@/hooks/use-product-search';
import { registerMovement } from '@/lib/actions/movements';
import { MOVEMENT_TYPE_LABELS, type MovementType } from '@/lib/constants';
import { formatNumber } from '@/lib/format';
import { applyFieldErrors } from '@/lib/forms';
import {
  type AdjustmentDirection,
  movementQuantity,
  parseUnits,
  REASON_PLACEHOLDERS,
  stockAfterMovement,
} from '@/lib/movement-form';
import { cn } from '@/lib/utils';
import { type MovementInput, movementSchema } from '@/lib/validations/movement';

type FormValues = { productId: string; type: MovementType; quantity: string; reason: string };

const TYPE_OPTIONS: { value: MovementType; icon: typeof Scale; hint: string }[] = [
  { value: 'IN', icon: ArrowDownLeft, hint: 'Received from a supplier or returned' },
  { value: 'OUT', icon: ArrowUpRight, hint: 'Sold or shipped to a customer' },
  { value: 'ADJUSTMENT', icon: Scale, hint: 'Correction after a count, damage or loss' },
];

/**
 * "Register movement" dialog: stock in, stock out or adjustment for one product.
 * Validation is the shared Zod schema; the server (registerMovement) re-checks
 * permission and stock in one transaction and refuses anything that would take
 * stock below zero - that refusal is shown as an error toast.
 */
export function MovementDialog({
  trigger,
  product: presetProduct = null,
  defaultType = 'OUT',
  lockProduct = false,
}: {
  trigger: React.ReactNode;
  product?: ProductSearchHit | null;
  defaultType?: MovementType;
  lockProduct?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Register movement</DialogTitle>
          <DialogDescription>
            Stock only changes through movements, so every unit stays accounted for.
          </DialogDescription>
        </DialogHeader>
        {open && (
          <MovementForm
            presetProduct={presetProduct}
            defaultType={defaultType}
            lockProduct={lockProduct}
            onDone={() => setOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function MovementForm({
  presetProduct,
  defaultType,
  lockProduct,
  onDone,
}: {
  presetProduct: ProductSearchHit | null;
  defaultType: MovementType;
  lockProduct: boolean;
  onDone: () => void;
}) {
  const [product, setProduct] = React.useState<ProductSearchHit | null>(presetProduct);
  const [direction, setDirection] = React.useState<AdjustmentDirection>('remove');
  const [pending, setPending] = React.useState(false);

  const form = useForm<FormValues, unknown, MovementInput>({
    resolver: zodResolver(movementSchema) as unknown as Resolver<
      FormValues,
      unknown,
      MovementInput
    >,
    defaultValues: {
      productId: presetProduct?.id ?? '',
      type: defaultType,
      quantity: '',
      reason: '',
    },
  });

  const type = form.watch('type');
  const units = parseUnits(form.watch('quantity'));
  const after =
    product && units !== null ? stockAfterMovement(product.quantity, type, units, direction) : null;

  async function onSubmit(values: MovementInput) {
    setPending(true);
    try {
      const result = await registerMovement({
        ...values,
        quantity: movementQuantity(values.type, values.quantity, direction),
      });
      if (!result.ok) {
        if (result.code === 'INSUFFICIENT_STOCK') {
          form.setError('quantity', { type: 'server', message: result.error });
          toast.error(result.error, { description: 'Nothing was changed.' });
          return;
        }
        const leftovers = applyFieldErrors(form, result.fieldErrors);
        if (!result.fieldErrors || leftovers.length) toast.error(result.error);
        return;
      }
      const { data } = result;
      const change = data.delta > 0 ? `+${formatNumber(data.delta)}` : formatNumber(data.delta);
      toast.success(`${MOVEMENT_TYPE_LABELS[values.type]} recorded`, {
        description: `${data.productName}: ${change} units, ${formatNumber(data.quantity)} now in stock.`,
      });
      if (data.lowStock) {
        toast.warning(`${data.productName} is at or below its reorder level`, {
          description: 'It now appears in the low stock alerts.',
        });
      }
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
          name="type"
          render={({ field }) => (
            <FormItem>
              <span id="movement-type-label" className="text-sm font-medium leading-none">
                Type
              </span>
              <div
                role="radiogroup"
                aria-labelledby="movement-type-label"
                className="grid grid-cols-3 gap-2"
              >
                {TYPE_OPTIONS.map(({ value, icon: Icon }) => {
                  const checked = field.value === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      onClick={() => field.onChange(value)}
                      className={cn(
                        'flex flex-col items-center gap-1 rounded-md border px-2 py-2.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring sm:text-sm',
                        checked
                          ? 'border-primary bg-primary/10 text-link'
                          : 'border-input text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      <Icon className="size-4" aria-hidden="true" />
                      {MOVEMENT_TYPE_LABELS[value]}
                    </button>
                  );
                })}
              </div>
              <FormDescription>
                {TYPE_OPTIONS.find((option) => option.value === field.value)?.hint}
              </FormDescription>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="productId"
          render={({ field, fieldState }) => (
            <FormItem>
              <FormLabel>Product</FormLabel>
              <FormControl>
                <ProductCombobox
                  value={product}
                  disabled={lockProduct}
                  invalid={Boolean(fieldState.error)}
                  onChange={(next) => {
                    setProduct(next);
                    field.onChange(next?.id ?? '');
                    form.clearErrors('quantity');
                  }}
                  onBlur={field.onBlur}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          {type === 'ADJUSTMENT' && (
            <div className="grid gap-2">
              <span className="text-sm font-medium leading-none" id="adjust-direction-label">
                Direction
              </span>
              <div
                role="radiogroup"
                aria-labelledby="adjust-direction-label"
                className="grid grid-cols-2 gap-2"
              >
                {(['remove', 'add'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={direction === value}
                    onClick={() => setDirection(value)}
                    className={cn(
                      'h-9 rounded-md border text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                      direction === value
                        ? 'border-primary bg-primary/10 text-link'
                        : 'border-input text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    {value === 'remove' ? 'Remove units' : 'Add units'}
                  </button>
                ))}
              </div>
            </div>
          )}
          <FormField
            control={form.control}
            name="quantity"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Quantity (units)</FormLabel>
                <FormControl>
                  <Input
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="0"
                    {...field}
                    onChange={(event) => {
                      field.onChange(event);
                      if (form.formState.errors.quantity?.type === 'server') {
                        form.clearErrors('quantity');
                      }
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {product && (
          <p
            className={cn(
              'rounded-md border px-3 py-2 text-sm',
              after !== null && after < 0
                ? 'border-destructive/30 bg-destructive/5 text-destructive dark:text-red-400'
                : 'bg-muted/40 text-muted-foreground',
            )}
            aria-live="polite"
            data-testid="stock-preview"
          >
            {formatNumber(product.quantity)} in stock
            {after !== null && (
              <>
                {' '}
                → <span className="font-semibold tabular-nums">{formatNumber(after)}</span> after
                this movement
                {after < 0 && ' — more than is on hand, so it will be refused'}
              </>
            )}
          </p>
        )}

        <FormField
          control={form.control}
          name="reason"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Reason <span className="font-normal text-muted-foreground">(optional)</span>
              </FormLabel>
              <FormControl>
                <Textarea rows={2} placeholder={REASON_PLACEHOLDERS[type]} {...field} />
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
            Record {MOVEMENT_TYPE_LABELS[type].toLowerCase()}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
