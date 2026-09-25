'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Archive,
  ArchiveRestore,
  ArrowLeftRight,
  Eye,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/inventory/confirm-dialog';
import { MovementDialog } from '@/components/inventory/movement-dialog';
import { ProductDialog } from '@/components/inventory/product-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { deleteProduct, setProductArchived } from '@/lib/actions/products';
import type { CategoryOption, Option, ProductRow } from '@/lib/queries/products';
import { Swap } from '@/lib/safe-text';

/** What the signed-in role may do; computed on the server with can(), enforced by the actions. */
export type ProductPermissions = {
  create: boolean;
  update: boolean;
  archive: boolean;
  delete: boolean;
  move: boolean;
};

type Pending = 'archive' | 'unarchive' | 'delete' | null;

/** Archive / restore / delete with toasts; shared by the table menu and the detail page. */
function useProductMutations(product: ProductRow, onDeleted?: () => void) {
  const setArchived = React.useCallback(
    async (archived: boolean) => {
      try {
        const result = await setProductArchived({ id: product.id, archived });
        if (!result.ok) {
          toast.error(result.error);
          return false;
        }
        toast.success(archived ? 'Product archived' : 'Product restored', {
          description: archived
            ? `${product.name} is hidden from the active list and cannot move stock.`
            : `${product.name} is active again.`,
        });
        return true;
      } catch {
        toast.error('Could not reach the server. Check your connection and try again.');
        return false;
      }
    },
    [product.id, product.name],
  );

  const remove = React.useCallback(async () => {
    try {
      const result = await deleteProduct({ id: product.id });
      if (!result.ok) {
        toast.error(result.error);
        return false;
      }
      toast.success('Product deleted', { description: product.name });
      onDeleted?.();
      return true;
    } catch {
      toast.error('Could not reach the server. Check your connection and try again.');
      return false;
    }
  }, [product.id, product.name, onDeleted]);

  return { setArchived, remove };
}

function ProductConfirmDialogs({
  product,
  pending,
  onClose,
  onDeleted,
}: {
  product: ProductRow;
  pending: Pending;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const { setArchived, remove } = useProductMutations(product, onDeleted);
  return (
    <>
      <ConfirmDialog
        open={pending === 'archive'}
        onOpenChange={(open) => !open && onClose()}
        title={`Archive ${product.name}?`}
        description={
          <p>
            Archived products leave the active list, the dashboard and the valuation, and cannot
            move stock. Their movement history is kept, and you can restore them at any time.
          </p>
        }
        confirmLabel="Archive"
        onConfirm={() => setArchived(true)}
      />
      <ConfirmDialog
        open={pending === 'unarchive'}
        onOpenChange={(open) => !open && onClose()}
        title={`Restore ${product.name}?`}
        description={<p>The product returns to the active list and can move stock again.</p>}
        confirmLabel="Restore"
        onConfirm={() => setArchived(false)}
      />
      <ConfirmDialog
        open={pending === 'delete'}
        onOpenChange={(open) => !open && onClose()}
        title={`Delete ${product.name}?`}
        description={
          <p>
            This permanently removes the product. It is only possible while the product has no stock
            movements; otherwise archive it to keep its history.
          </p>
        }
        confirmLabel="Delete permanently"
        destructive
        onConfirm={remove}
      />
    </>
  );
}

/** Row menu for the products table. */
export function ProductActionsMenu({
  product,
  categories,
  suppliers,
  permissions,
}: {
  product: ProductRow;
  categories: CategoryOption[];
  suppliers: Option[];
  permissions: ProductPermissions;
}) {
  const [editing, setEditing] = React.useState(false);
  const [pending, setPending] = React.useState<Pending>(null);
  const hasHistory = product.movementCount > 0;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={`Actions for ${product.name}`}
            data-testid="product-actions"
          >
            <MoreHorizontal aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="truncate text-xs font-medium text-muted-foreground">
            {product.sku}
          </DropdownMenuLabel>
          <DropdownMenuItem asChild>
            <Link href={`/products/${product.id}`}>
              <Eye aria-hidden="true" />
              View details
            </Link>
          </DropdownMenuItem>
          {permissions.update && (
            <DropdownMenuItem onSelect={() => setEditing(true)}>
              <Pencil aria-hidden="true" />
              Edit
            </DropdownMenuItem>
          )}
          {permissions.archive && (
            <DropdownMenuItem
              onSelect={() => setPending(product.archived ? 'unarchive' : 'archive')}
            >
              {product.archived ? (
                <ArchiveRestore aria-hidden="true" />
              ) : (
                <Archive aria-hidden="true" />
              )}
              <Swap>{product.archived ? 'Restore' : 'Archive'}</Swap>
            </DropdownMenuItem>
          )}
          {permissions.delete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                disabled={hasHistory}
                onSelect={() => setPending('delete')}
              >
                <Trash2 aria-hidden="true" />
                <span className="flex flex-col">
                  Delete
                  {hasHistory && (
                    <span className="text-xs font-normal text-muted-foreground">
                      Has stock history, archive instead
                    </span>
                  )}
                </span>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {permissions.update && (
        <ProductDialog
          product={product}
          categories={categories}
          suppliers={suppliers}
          open={editing}
          onOpenChange={setEditing}
        />
      )}
      <ProductConfirmDialogs product={product} pending={pending} onClose={() => setPending(null)} />
    </>
  );
}

/** Buttons in the product detail header. */
export function ProductDetailActions({
  product,
  categories,
  suppliers,
  permissions,
}: {
  product: ProductRow;
  categories: CategoryOption[];
  suppliers: Option[];
  permissions: ProductPermissions;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState<Pending>(null);
  const hasHistory = product.movementCount > 0;

  return (
    <>
      {permissions.move && !product.archived && (
        <MovementDialog
          lockProduct
          product={{
            id: product.id,
            sku: product.sku,
            name: product.name,
            quantity: product.quantity,
            reorderLevel: product.reorderLevel,
          }}
          trigger={
            <Button>
              <ArrowLeftRight aria-hidden="true" />
              Register movement
            </Button>
          }
        />
      )}
      {permissions.update && (
        <ProductDialog
          product={product}
          categories={categories}
          suppliers={suppliers}
          trigger={
            <Button variant="outline">
              <Pencil aria-hidden="true" />
              Edit
            </Button>
          }
        />
      )}
      {(permissions.archive || permissions.delete) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" aria-label="More actions">
              <MoreHorizontal aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {permissions.archive && (
              <DropdownMenuItem
                onSelect={() => setPending(product.archived ? 'unarchive' : 'archive')}
              >
                {product.archived ? (
                  <ArchiveRestore aria-hidden="true" />
                ) : (
                  <Archive aria-hidden="true" />
                )}
                <Swap>{product.archived ? 'Restore product' : 'Archive product'}</Swap>
              </DropdownMenuItem>
            )}
            {permissions.delete && (
              <DropdownMenuItem
                variant="destructive"
                disabled={hasHistory}
                onSelect={() => setPending('delete')}
              >
                <Trash2 aria-hidden="true" />
                <span className="flex flex-col">
                  Delete product
                  {hasHistory && (
                    <span className="text-xs font-normal text-muted-foreground">
                      Has stock history, archive instead
                    </span>
                  )}
                </span>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <ProductConfirmDialogs
        product={product}
        pending={pending}
        onClose={() => setPending(null)}
        onDeleted={() => router.push('/products')}
      />
    </>
  );
}
