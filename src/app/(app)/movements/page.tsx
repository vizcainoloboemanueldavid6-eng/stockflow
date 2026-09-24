import type { Metadata } from 'next';
import { ArrowLeftRight, Download } from 'lucide-react';
import { MovementDialog } from '@/components/inventory/movement-dialog';
import { PageHeader } from '@/components/layout/page-header';
import { MovementsTable } from '@/components/tables/movements-table';
import { Button } from '@/components/ui/button';
import { requirePagePermission } from '@/lib/actions/guard';
import { prisma } from '@/lib/db';
import { can } from '@/lib/permissions';
import { listMovements, movementUserOptions } from '@/lib/queries/movements';
import { parseSearchParams, type RawSearchParams } from '@/lib/search-params';
import { movementListQuerySchema } from '@/lib/validations/movement';

export const metadata: Metadata = { title: 'Movements' };

export default async function MovementsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const user = await requirePagePermission('movement:view');
  const query = parseSearchParams(movementListQuerySchema, await searchParams);
  const sort = query.sort === 'quantity' ? 'quantity' : 'createdAt';

  const [list, users, historyCount, productFilter] = await Promise.all([
    listMovements({ ...query, sort }),
    movementUserOptions(),
    prisma.stockMovement.count(),
    query.product
      ? prisma.product.findUnique({
          where: { id: query.product },
          select: { id: true, name: true },
        })
      : Promise.resolve(null),
  ]);

  const canMove = can(user.role, 'movement:create');
  const canExport = can(user.role, 'report:export');

  const exportParams = new URLSearchParams();
  for (const key of ['from', 'to', 'type', 'user', 'product'] as const) {
    const value = query[key];
    if (value) exportParams.set(key, value);
  }
  const exportHref = `/api/export/movements${exportParams.size ? `?${exportParams}` : ''}`;

  const registerButton = canMove ? (
    <MovementDialog
      trigger={
        <Button data-testid="register-movement">
          <ArrowLeftRight aria-hidden="true" />
          Register movement
        </Button>
      }
    />
  ) : null;

  return (
    <>
      <PageHeader
        title="Movements"
        description="Every stock in, stock out and adjustment, newest first. Stock only changes here."
        actions={
          <>
            {canExport && historyCount > 0 && (
              <Button asChild variant="outline">
                <a href={exportHref} download data-testid="export-movements">
                  <Download aria-hidden="true" />
                  Export CSV
                </a>
              </Button>
            )}
            {registerButton}
          </>
        }
      />
      <MovementsTable
        rows={list.rows}
        total={list.total}
        page={list.page}
        pageCount={list.pageCount}
        pageSize={list.pageSize}
        query={{
          from: query.from,
          to: query.to,
          type: query.type,
          user: query.user,
          sort,
          dir: query.dir,
        }}
        users={users}
        productFilter={productFilter}
        historyEmpty={historyCount === 0}
        emptyAction={registerButton}
      />
    </>
  );
}
