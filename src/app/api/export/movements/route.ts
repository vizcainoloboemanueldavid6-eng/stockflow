import { errorResponse, requirePermission } from '@/lib/actions/guard';
import { MOVEMENT_TYPE_LABELS } from '@/lib/constants';
import { csvFilename, csvResponse, toCsv } from '@/lib/csv';
import { appTimeZone, dayKey } from '@/lib/dates';
import { formatIsoMinute } from '@/lib/format';
import { findMovementsForExport } from '@/lib/queries/movements';
import { parseSearchParams } from '@/lib/search-params';
import { movementListQuerySchema } from '@/lib/validations/movement';

export const dynamic = 'force-dynamic';

const HEADER = ['Date', 'Type', 'SKU', 'Product', 'Change (units)', 'Reason', 'User'];

/**
 * GET /api/export/movements - the movement history with the same filters as
 * /movements (from, to, type, user, product), newest first. Requires report:export.
 * "Change" is the signed effect on stock: +12 received, -3 sold, -1 written off.
 */
export async function GET(request: Request) {
  try {
    await requirePermission('report:export');
    const query = parseSearchParams(movementListQuerySchema, new URL(request.url).searchParams);
    const movements = await findMovementsForExport(query);
    const timeZone = appTimeZone();

    const csv = toCsv(
      HEADER,
      movements.map((movement) => [
        formatIsoMinute(movement.at, timeZone),
        MOVEMENT_TYPE_LABELS[movement.type],
        movement.product.sku,
        movement.product.name,
        movement.delta,
        movement.reason,
        movement.user?.name ?? 'Deleted user',
      ]),
    );
    return csvResponse(csv, csvFilename('movements', dayKey(new Date(), timeZone)));
  } catch (error) {
    return errorResponse(error);
  }
}
