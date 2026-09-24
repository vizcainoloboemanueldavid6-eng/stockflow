import type { Metadata } from 'next';
import { Plus } from 'lucide-react';
import { SupplierDialog } from '@/components/catalog/supplier-dialog';
import { SuppliersTable } from '@/components/catalog/suppliers-table';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { requirePagePermission } from '@/lib/actions/guard';
import { can } from '@/lib/permissions';
import { listSuppliers } from '@/lib/queries/catalog';

export const metadata: Metadata = { title: 'Suppliers' };

export default async function SuppliersPage() {
  const user = await requirePagePermission('supplier:view');
  const rows = await listSuppliers();
  const permissions = {
    create: can(user.role, 'supplier:create'),
    update: can(user.role, 'supplier:update'),
    delete: can(user.role, 'supplier:delete'),
  };
  const addButton = (testId: string) =>
    permissions.create ? (
      <SupplierDialog
        trigger={
          <Button data-testid={testId}>
            <Plus aria-hidden="true" />
            Add supplier
          </Button>
        }
      />
    ) : null;

  return (
    <>
      <PageHeader
        title="Suppliers"
        description={
          permissions.create
            ? 'The vendors you buy from. A supplier still linked to products cannot be deleted.'
            : 'The vendors products are bought from. Only admins can change suppliers.'
        }
        actions={addButton('add-supplier')}
      />
      <SuppliersTable
        rows={rows}
        permissions={permissions}
        emptyAction={addButton('add-supplier-empty')}
      />
    </>
  );
}
