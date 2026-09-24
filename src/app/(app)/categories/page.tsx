import type { Metadata } from 'next';
import { Plus } from 'lucide-react';
import { CategoriesTable } from '@/components/catalog/categories-table';
import { CategoryDialog } from '@/components/catalog/category-dialog';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { requirePagePermission } from '@/lib/actions/guard';
import { can } from '@/lib/permissions';
import { listCategories } from '@/lib/queries/catalog';

export const metadata: Metadata = { title: 'Categories' };

export default async function CategoriesPage() {
  const user = await requirePagePermission('category:view');
  const rows = await listCategories();
  const permissions = {
    create: can(user.role, 'category:create'),
    update: can(user.role, 'category:update'),
    delete: can(user.role, 'category:delete'),
  };
  const addButton = (testId: string) =>
    permissions.create ? (
      <CategoryDialog
        trigger={
          <Button data-testid={testId}>
            <Plus aria-hidden="true" />
            Add category
          </Button>
        }
      />
    ) : null;

  return (
    <>
      <PageHeader
        title="Categories"
        description={
          permissions.create
            ? 'Group products and give each group a colour. A category in use cannot be deleted.'
            : 'How products are grouped. Only admins can change categories.'
        }
        actions={addButton('add-category')}
      />
      <CategoriesTable
        rows={rows}
        permissions={permissions}
        emptyAction={addButton('add-category-empty')}
      />
    </>
  );
}
