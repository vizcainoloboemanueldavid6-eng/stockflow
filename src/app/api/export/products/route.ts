import { errorResponse, requirePermission } from '@/lib/actions/guard';
import { STOCK_STATUS_LABELS } from '@/lib/constants';
import { csvFilename, csvMoney, csvResponse, toCsv } from '@/lib/csv';
import { appTimeZone, dayKey } from '@/lib/dates';
import { formatIsoMinute } from '@/lib/format';
import { findProductsForExport } from '@/lib/queries/products';
import { parseSearchParams } from '@/lib/search-params';
import { productListQuerySchema } from '@/lib/validations/product';

export const dynamic = 'force-dynamic';

const HEADER = [
  'SKU',
  'Name',
  'Category',
  'Supplier',
  'Quantity',
  'Reorder level',
  'Stock status',
  'Unit cost',
  'Sale price',
  'Stock value at cost',
  'Archived',
  'Description',
  'Created',
  'Updated',
];

/**
 * GET /api/export/products - every product matching the same filters as the
 * /products table (search, category, supplier, status, archived; no pagination).
 * Requires report:export.
 */
export async function GET(request: Request) {
  try {
    await requirePermission('report:export');
    const query = parseSearchParams(productListQuerySchema, new URL(request.url).searchParams);
    const products = await findProductsForExport(query, query.sort, query.dir);
    const timeZone = appTimeZone();

    const csv = toCsv(
      HEADER,
      products.map((product) => [
        product.sku,
        product.name,
        product.categoryName,
        product.supplierName,
        product.quantity,
        product.reorderLevel,
        STOCK_STATUS_LABELS[product.status],
        csvMoney(product.unitCost),
        csvMoney(product.salePrice),
        csvMoney(product.stockValue),
        product.archived ? 'Yes' : 'No',
        product.description,
        formatIsoMinute(product.createdAt, timeZone),
        formatIsoMinute(product.updatedAt, timeZone),
      ]),
    );
    return csvResponse(csv, csvFilename('products', dayKey(new Date(), timeZone)));
  } catch (error) {
    return errorResponse(error);
  }
}
