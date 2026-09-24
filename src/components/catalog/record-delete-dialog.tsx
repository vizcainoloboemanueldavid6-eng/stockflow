'use client';

import Link from 'next/link';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/inventory/confirm-dialog';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import type { ActionResult } from '@/lib/actions/guard';

/**
 * Delete confirmation for a category or supplier. While products still point at
 * the record the dialog explains why it cannot be deleted and links to those
 * products instead of offering the button; the server action refuses the same
 * case on its own (with the same explanation), whatever the UI shows.
 */
export function RecordDeleteDialog({
  open,
  onOpenChange,
  kind,
  name,
  productCount,
  productsHref,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: 'category' | 'supplier';
  name: string;
  productCount: number;
  productsHref: string;
  onDelete: () => Promise<ActionResult<{ id: string; name: string }>>;
}) {
  if (productCount > 0) {
    const products = productCount === 1 ? '1 product' : `${productCount} products`;
    return (
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{`"${name}" is still in use`}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  {`${products} (archived ones included) ${productCount === 1 ? 'uses' : 'use'} this ${kind}, so it cannot be deleted.`}
                </p>
                <p>
                  {kind === 'category'
                    ? 'Move those products to another category first, then delete it.'
                    : 'Assign those products to another supplier (or none) first, then delete it.'}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
            <Button asChild>
              <Link href={productsHref}>View {products}</Link>
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Delete ${kind} "${name}"?`}
      description={<p>No products use it. This cannot be undone.</p>}
      confirmLabel="Delete"
      destructive
      onConfirm={async () => {
        try {
          const result = await onDelete();
          if (!result.ok) {
            toast.error(result.error);
            return false;
          }
          toast.success(kind === 'category' ? 'Category deleted' : 'Supplier deleted', {
            description: result.data.name,
          });
          return true;
        } catch {
          toast.error('Could not reach the server. Check your connection and try again.');
          return false;
        }
      }}
    />
  );
}
