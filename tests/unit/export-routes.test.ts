import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * The two CSV Route Handlers end to end (session and data mocked): who may download,
 * and that the file a spreadsheet opens has exactly the rows and values given,
 * whatever characters the product names contain.
 */
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findUser: vi.fn(),
  products: vi.fn(),
  movements: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/db', () => ({ prisma: { user: { findUnique: mocks.findUser } } }));
vi.mock('@/lib/queries/products', () => ({ findProductsForExport: mocks.products }));
vi.mock('@/lib/queries/movements', () => ({ findMovementsForExport: mocks.movements }));

process.env.APP_TIME_ZONE = 'UTC';
const productsRoute = await import('@/app/api/export/products/route');
const movementsRoute = await import('@/app/api/export/movements/route');

/** Independent RFC 4180 reader: quoted fields, doubled quotes, CRLF records. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\r' && text[i + 1] === '\n') {
      rows.push([...row, field]);
      row = [];
      field = '';
      i++;
    } else field += char;
  }
  if (field || row.length) rows.push([...row, field]);
  return rows;
}

async function readCsv(response: Response) {
  const bytes = new Uint8Array(await response.arrayBuffer());
  expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  return parseCsv(new TextDecoder().decode(bytes.subarray(3)));
}

function signInAs(role: 'ADMIN' | 'STAFF' | 'DEMO' | null) {
  if (!role) {
    mocks.auth.mockResolvedValue(null);
    return;
  }
  mocks.auth.mockResolvedValue({ user: { id: 'u1', role } });
  mocks.findUser.mockResolvedValue({ id: 'u1', name: 'Tester', email: 'u1@x.test', role });
}

const created = new Date('2026-09-01T08:05:00Z');
const product = (over: Record<string, unknown>) => ({
  sku: 'CBL-101',
  name: 'USB-C Cable',
  categoryName: 'Cables & Adapters',
  supplierName: 'Northgate Components',
  quantity: 12,
  reorderLevel: 5,
  status: 'in_stock',
  unitCost: 2.5,
  salePrice: 7,
  stockValue: 30,
  archived: false,
  description: null,
  createdAt: created,
  updatedAt: created,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/export/products', () => {
  it('needs a session', async () => {
    signInAs(null);
    const response = await productsRoute.GET(new Request('http://app.test/api/export/products'));
    expect(response.status).toBe(401);
    expect(mocks.products).not.toHaveBeenCalled();
  });

  it.each(['ADMIN', 'STAFF', 'DEMO'] as const)('lets %s download the file', async (role) => {
    signInAs(role);
    mocks.products.mockResolvedValue([product({})]);
    const response = await productsRoute.GET(new Request('http://app.test/api/export/products'));
    expect(response.status).toBe(200);
  });

  it('writes one row per product, with every awkward value intact', async () => {
    signInAs('STAFF');
    const tricky = [
      product({ name: 'Cable, braided "Pro" 2 m', description: 'Line one\nLine two' }),
      product({ sku: 'SMH-201', name: '=HYPERLINK("http://x")', status: 'low_stock' }),
      product({ sku: 'AUD-301', name: 'Écouteurs sans fil – 10 €', supplierName: null }),
      product({ sku: 'PWR-401', name: '  padded  ', quantity: 0, status: 'out_of_stock' }),
      product({ sku: 'CMP-501', name: 'Archived mouse', archived: true, unitCost: 1234.5 }),
    ];
    mocks.products.mockResolvedValue(tricky);

    const response = await productsRoute.GET(
      new Request('http://app.test/api/export/products?q=x&status=low_stock&sort=name&dir=desc'),
    );
    expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(response.headers.get('content-disposition')).toMatch(
      /^attachment; filename="stockflow-products-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
    // The table's filters and order reach the query unchanged.
    expect(mocks.products).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'x', status: 'low_stock' }),
      'name',
      'desc',
    );

    const rows = await readCsv(response);
    expect(rows).toHaveLength(1 + tricky.length);
    for (const row of rows) expect(row).toHaveLength(14);
    const [, first, formula, accents, padded, archived] = rows;
    expect(first.slice(0, 2)).toEqual(['CBL-101', 'Cable, braided "Pro" 2 m']);
    expect(first[11]).toBe('Line one\nLine two');
    expect(first.slice(4, 10)).toEqual(['12', '5', 'In stock', '2.50', '7.00', '30.00']);
    expect(first[12]).toBe('2026-09-01 08:05');
    expect(formula[1]).toBe(`'=HYPERLINK("http://x")`); // shown as text, never run
    expect(formula[6]).toBe('Low stock');
    expect(accents[1]).toBe('Écouteurs sans fil – 10 €');
    expect(accents[3]).toBe('');
    expect(padded[1]).toBe('  padded  ');
    expect(padded[6]).toBe('Out of stock');
    expect(archived[7]).toBe('1234.50');
    expect(archived[10]).toBe('Yes');
  });
});

describe('GET /api/export/movements', () => {
  it('writes signed changes and keeps deleted users readable', async () => {
    signInAs('STAFF');
    const at = new Date('2026-09-20T23:59:00Z');
    mocks.movements.mockResolvedValue([
      {
        at,
        type: 'OUT',
        delta: -3,
        reason: 'Order #12, "rush"',
        product: { sku: 'CBL-101', name: 'USB-C Cable' },
        user: { name: 'Staff User' },
      },
      {
        at,
        type: 'ADJUSTMENT',
        delta: -1,
        reason: null,
        product: { sku: 'CBL-101', name: 'USB-C Cable' },
        user: null,
      },
      {
        at,
        type: 'IN',
        delta: 12,
        reason: '-5 damaged on arrival',
        product: { sku: 'AUD-301', name: 'Earbuds' },
        user: { name: 'Admin User' },
      },
    ]);
    const response = await movementsRoute.GET(
      new Request('http://app.test/api/export/movements?from=2026-09-01&to=2026-09-30'),
    );
    expect(response.headers.get('content-disposition')).toMatch(/stockflow-movements-/);
    const rows = await readCsv(response);
    expect(rows).toEqual([
      ['Date', 'Type', 'SKU', 'Product', 'Change (units)', 'Reason', 'User'],
      [
        '2026-09-20 23:59',
        'Stock out',
        'CBL-101',
        'USB-C Cable',
        '-3',
        'Order #12, "rush"',
        'Staff User',
      ],
      ['2026-09-20 23:59', 'Adjustment', 'CBL-101', 'USB-C Cable', '-1', '', 'Deleted user'],
      [
        '2026-09-20 23:59',
        'Stock in',
        'AUD-301',
        'Earbuds',
        '12',
        "'-5 damaged on arrival",
        'Admin User',
      ],
    ]);
    expect(mocks.movements).toHaveBeenCalledWith(
      expect.objectContaining({ from: '2026-09-01', to: '2026-09-30' }),
    );
  });
});
