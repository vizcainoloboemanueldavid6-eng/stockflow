import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { expect, pickOption, rowActions, signIn, test, toast, unique } from './fixtures';

/*
 * Feature pages (stage 2) against the seeded database, on the production build.
 * Tests that create records use unique names and remove what they create, so the
 * suite can also run repeatedly against one database (movements are append-only by
 * design, so the movement tests add a few rows per run).
 */

const PRODUCT_HEADER = [
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
const MOVEMENT_HEADER = ['Date', 'Type', 'SKU', 'Product', 'Change (units)', 'Reason', 'User'];

/** RFC 4180 reader (quoted fields, doubled quotes, CRLF), independent of the app's writer. */
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
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
    } else field += char;
  }
  if (field || row.length) rows.push([...row, field]);
  return rows;
}

/** The "of N <things>" total under a server-paged table. */
async function tableTotal(page: Page): Promise<number> {
  const text = await page
    .getByRole('navigation', { name: 'Pagination' })
    .getByText(/^Showing .* of [\d,]+ /)
    .textContent();
  return Number(text!.match(/of ([\d,]+)/)![1].replace(/,/g, ''));
}

/** Clicks a download link and returns the saved file's name and parsed rows. */
async function downloadCsv(page: Page, testId: string) {
  const pending = page.waitForEvent('download');
  await page.getByTestId(testId).click();
  const download = await pending;
  const bytes = await readFile((await download.path())!);
  expect([...bytes.subarray(0, 3)], 'UTF-8 BOM').toEqual([0xef, 0xbb, 0xbf]);
  return {
    filename: download.suggestedFilename(),
    rows: parseCsv(bytes.subarray(3).toString('utf8')),
  };
}

test.describe('as admin', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, 'admin');
  });

  test('dashboard: KPIs, both charts and the low-stock alerts', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
    await expect(page.getByTestId('kpi-inventory-value')).toHaveText(/^\$[\d,]+\.\d{2}$/);
    await expect(page.getByTestId('kpi-products')).toHaveText(/^\d+$/);
    await expect(page.getByTestId('kpi-low-stock')).toHaveText(/^\d+$/);
    await expect(page.getByTestId('kpi-movements-today')).toHaveText(/^\d+$/);
    // Two line series (in, out) and five best-seller bars.
    await expect(page.locator('.recharts-line-curve')).toHaveCount(2);
    await expect(page.locator('.recharts-bar-rectangle')).toHaveCount(5);
    // ...drawn from real data: each chart has an accessible table with the same numbers.
    const trend = page.locator('table:has(caption:text("Units in and out per day")) tbody tr');
    await expect(trend).toHaveCount(30);
    const totals = await trend.evaluateAll((rows) =>
      rows.reduce(
        (sum, row) => {
          const [units_in, units_out] = [...row.querySelectorAll('td')].map((td) =>
            Number(td.textContent?.replace(/,/g, '')),
          );
          return { in: sum.in + units_in, out: sum.out + units_out };
        },
        { in: 0, out: 0 },
      ),
    );
    expect(totals.in).toBeGreaterThan(0);
    expect(totals.out).toBeGreaterThan(0);
    for (const path of await page.locator('.recharts-line-curve').all()) {
      expect((await path.getAttribute('d'))?.length ?? 0).toBeGreaterThan(50);
    }
    const sold = await page
      .locator('table:has(caption:text("Units sold per product")) tbody td')
      .allTextContents();
    expect(sold).toHaveLength(5);
    const units = sold.map((text) => Number(text.replace(/,/g, '')));
    for (const value of units) expect(value).toBeGreaterThan(0);
    expect([...units].sort((a, b) => b - a)).toEqual(units); // best seller first
    const alerts = page.locator('#low-stock-alerts tbody tr');
    expect(await alerts.count()).toBeGreaterThan(0);
    await expect(alerts.first().getByRole('button', { name: /Restock/ })).toBeVisible();

    // The inventory value KPI and the valuation report agree to the cent.
    const kpi = await page.getByTestId('kpi-inventory-value').textContent();
    await page.goto('/reports');
    await expect(page.getByTestId('valuation-total')).toHaveText(kpi ?? '');
  });

  test('products: search, filter, sort and paginate through the URL', async ({ page }) => {
    await page.goto('/products');
    const rows = page.locator('table tbody tr');
    await expect(rows).toHaveCount(10);
    await expect(page.getByText(/Showing 1–10 of \d+ products/)).toBeVisible();

    await page.getByRole('button', { name: 'Next page' }).click();
    await page.waitForURL(/[?&]page=2/);
    await expect(page.getByText(/Showing 11–20 of/)).toBeVisible();

    await page.getByRole('searchbox', { name: /Search products/ }).fill('cable');
    await page.waitForURL(/[?&]q=cable/);
    await expect(page).not.toHaveURL(/page=2/);
    const names = await page.locator('table tbody tr td:first-child a').allTextContents();
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(name.toLowerCase()).toContain('cable');

    await page.goto('/products?status=out_of_stock');
    // loading.tsx streams a skeleton first; wait for the real rows.
    await expect(page.locator('table tbody tr').first()).toBeVisible();
    const badges = page.locator('table tbody tr [data-status]:visible');
    expect(await badges.count()).toBeGreaterThan(0);
    for (const status of await badges.evaluateAll((els) => els.map((el) => el.dataset.status))) {
      expect(status).toBe('out_of_stock');
    }

    await page.goto('/products');
    await expect(page.locator('table tbody tr')).toHaveCount(10);
    await page.getByRole('button', { name: 'Stock', exact: true }).click();
    await page.waitForURL(/sort=quantity/);
    const quantities = (await page.locator('table tbody tr td:nth-child(4)').allTextContents()).map(
      (text) => Number(text.replace(/,/g, '')),
    );
    const sorted = [...quantities].sort((a, b) => a - b);
    const descending = [...sorted].reverse();
    expect([sorted, descending]).toContainEqual(quantities);
  });

  test('products: duplicate SKU on the field, then create, edit, archive, restore and delete', async ({
    page,
  }) => {
    const sku = `E2E-${unique()}`;
    const name = `E2E test lamp ${sku}`;
    await page.goto('/products');
    await page.getByTestId('add-product').click();
    const dialog = page.getByRole('dialog', { name: 'Add product' });
    await dialog.getByLabel('Name').fill(name);
    await dialog.getByLabel('SKU').fill('CBL-101');
    await pickOption(page, 'Category', /Smart Home/);
    await dialog.getByLabel('Unit cost ($)').fill('4.50');
    await dialog.getByLabel('Sale price ($)').fill('12.99');
    await dialog.getByRole('button', { name: 'Add product' }).click();
    await expect(dialog.getByText('Another product already uses this SKU.')).toBeVisible();

    await dialog.getByLabel('SKU').fill(sku);
    await dialog.getByRole('button', { name: 'Add product' }).click();
    await expect(toast(page, 'Product added')).toBeVisible();
    await expect(dialog).toBeHidden();

    await page.goto(`/products?q=${sku}`);
    await expect(page.locator('table tbody tr')).toHaveCount(1);
    await rowActions(page, name);
    await page.getByRole('menuitem', { name: 'Edit' }).click();
    const edit = page.getByRole('dialog', { name: 'Edit product' });
    await edit.getByLabel('Name').fill(`${name} v2`);
    await edit.getByRole('button', { name: 'Save changes' }).click();
    await expect(toast(page, 'Product updated')).toBeVisible();
    await expect(page.getByRole('link', { name: `${name} v2` })).toBeVisible();

    await rowActions(page, `${name} v2`);
    await page.getByRole('menuitem', { name: 'Archive', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Archive' }).click();
    await expect(toast(page, 'Product archived')).toBeVisible();
    await expect(page.getByText('No products match these filters')).toBeVisible();

    await page.goto(`/products?q=${sku}&archived=archived`);
    await rowActions(page, `${name} v2`);
    await page.getByRole('menuitem', { name: 'Restore', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Restore' }).click();
    await expect(toast(page, 'Product restored')).toBeVisible();

    await page.goto(`/products?q=${sku}`);
    await rowActions(page, `${name} v2`);
    await page.getByRole('menuitem', { name: /Delete/ }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete permanently' }).click();
    await expect(toast(page, 'Product deleted')).toBeVisible();
    await expect(page.getByText('No products match these filters')).toBeVisible();
  });

  test('product detail: info, status badge and movement history', async ({ page }) => {
    await page.goto('/products?q=CBL-101');
    await page.locator('table tbody tr td:first-child a').first().click();
    await page.waitForURL(/\/products\/[^/?]+$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('USB-C');
    await expect(page.locator('[data-status]').first()).toBeVisible();
    await expect(page.getByText('Stock value at cost')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Movement history' })).toBeVisible();
    expect(await page.locator('table tbody tr').count()).toBeGreaterThan(0);
    await expect(page.getByText('Lifetime movements')).toBeVisible();
  });

  test('movements: overdraw is refused with a toast, a stock-in is recorded', async ({ page }) => {
    await page.goto('/movements');
    await page.getByTestId('register-movement').click();
    const dialog = page.getByRole('dialog', { name: 'Register movement' });
    await dialog.getByRole('radio', { name: 'Stock out' }).click();
    await dialog.getByTestId('product-combobox').click();
    await page.getByPlaceholder('Product name or SKU...').fill('CBL-103');
    await page.getByRole('option', { name: /CBL-103/ }).click();
    await dialog.getByLabel('Quantity (units)').fill('99999');
    await expect(dialog.getByTestId('stock-preview')).toContainText('will be refused');
    await dialog.getByRole('button', { name: 'Record stock out' }).click();
    await expect(
      toast(page, /Not enough stock: \d+ available, tried to remove 99999/),
    ).toBeVisible();
    await expect(dialog).toBeVisible();

    await dialog.getByRole('radio', { name: 'Stock in' }).click();
    await dialog.getByLabel('Quantity (units)').fill('1');
    await dialog.getByLabel(/Reason/).fill('E2E delivery');
    await dialog.getByRole('button', { name: 'Record stock in' }).click();
    await expect(toast(page, 'Stock in recorded')).toBeVisible();
    await expect(dialog).toBeHidden();
    const first = page.locator('table tbody tr').first();
    await expect(first).toContainText('CBL-103');
    await expect(first).toContainText('+1');
  });

  test('movements: stock out and stock in change the quantity by exactly that amount', async ({
    page,
  }) => {
    // The best-stocked product, so a stock-out of 2 is always possible.
    await page.goto('/products?sort=quantity&dir=desc');
    await page.locator('table tbody a[href^="/products/"]').first().click();
    await page.waitForURL(/\/products\/[^/?]+$/);
    const onHand = page
      .getByRole('region', { name: 'Stock summary' })
      .locator('[data-slot=card]')
      .filter({ hasText: /^On hand/ })
      .locator('p')
      .nth(1);
    const units = async () => Number((await onHand.textContent())!.replace(/[^\d]/g, ''));
    const before = await units();
    expect(before).toBeGreaterThanOrEqual(2);

    await page.getByRole('button', { name: 'Register movement' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Register movement' });
    await dialog.getByRole('radio', { name: 'Stock out' }).click();
    await dialog.getByLabel('Quantity (units)').fill('2');
    await expect(dialog.getByTestId('stock-preview')).toContainText(
      `→ ${(before - 2).toLocaleString('en-US')} after`,
    );
    await dialog.getByRole('button', { name: 'Record stock out' }).click();
    await expect(toast(page, 'Stock out recorded')).toBeVisible();
    await expect(onHand).toHaveText(`${(before - 2).toLocaleString('en-US')} units`);
    await expect(page.locator('table tbody tr').first()).toContainText('-2');

    await page.getByRole('button', { name: 'Register movement' }).first().click();
    await dialog.getByRole('radio', { name: 'Stock in' }).click();
    await dialog.getByLabel('Quantity (units)').fill('2');
    await dialog.getByRole('button', { name: 'Record stock in' }).click();
    await expect(toast(page, 'Stock in recorded')).toBeVisible();
    await expect(onHand).toHaveText(`${before.toLocaleString('en-US')} units`);
  });

  test('movements: history filters by type, user and date range', async ({ page }) => {
    await page.goto('/movements?type=ADJUSTMENT');
    await expect(page.locator('table tbody tr').first()).toBeVisible();
    const types = await page.locator('table tbody tr td:nth-child(3)').allTextContents();
    for (const type of types) expect(type).toContain('Adjustment');

    await page.goto('/movements');
    await page.getByLabel('Filter by user').click();
    await page.getByRole('option', { name: 'Staff User' }).click();
    await page.waitForURL(/user=/);
    const users = await page.locator('table tbody tr td:last-child').allTextContents();
    for (const user of users) expect(user).toBe('Staff User');

    await page.getByLabel('From date').fill('2000-01-01');
    await page.waitForURL(/from=2000-01-01/);
    await page.getByLabel('To date').fill('2000-01-02');
    await page.waitForURL(/to=2000-01-02/);
    await expect(page.getByText('No movements match these filters')).toBeVisible();
    await page.getByRole('button', { name: 'Clear filters' }).first().click();
    await expect(page.locator('table tbody tr')).toHaveCount(10);
  });

  test('categories: colour picker, create, edit, in-use block and delete', async ({ page }) => {
    const first = `E2E ${unique()}`;
    const name = `${first} renamed`;
    await page.goto('/categories');
    await page.getByTestId('add-category').click();
    const dialog = page.getByRole('dialog', { name: 'Add category' });
    await dialog.getByLabel('Name').fill(first);
    await dialog.getByRole('radio', { name: '#10B981' }).click();
    await expect(dialog.getByLabel('Hex colour code')).toHaveValue('#10B981');
    await dialog.getByRole('button', { name: 'Add category' }).click();
    await expect(toast(page, 'Category added')).toBeVisible();
    await expect(page.getByRole('cell', { name: first, exact: true })).toBeVisible();

    await rowActions(page, first);
    await page.getByRole('menuitem', { name: 'Edit' }).click();
    const edit = page.getByRole('dialog', { name: 'Edit category' });
    await expect(edit.getByLabel('Hex colour code')).toHaveValue('#10B981');
    await edit.getByLabel('Name').fill(name);
    await edit.getByLabel('Hex colour code').fill('#F59E0B');
    await edit.getByRole('button', { name: 'Save changes' }).click();
    await expect(toast(page, 'Category updated')).toBeVisible();
    await expect(page.getByRole('cell', { name, exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: first, exact: true })).toBeHidden();

    await rowActions(page, 'Audio');
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    const blocked = page.getByRole('alertdialog');
    await expect(blocked).toContainText('"Audio" is still in use');
    await expect(blocked.getByRole('link', { name: /View \d+ products/ })).toBeVisible();
    await blocked.getByRole('button', { name: 'Close' }).click();

    await rowActions(page, name);
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
    await expect(toast(page, 'Category deleted')).toBeVisible();
    await expect(page.getByRole('cell', { name, exact: true })).toBeHidden();
  });

  test('suppliers: create, edit, in-use block and delete', async ({ page }) => {
    const name = `E2E Supply ${unique()}`;
    await page.goto('/suppliers');
    await page.getByTestId('add-supplier').click();
    const dialog = page.getByRole('dialog', { name: 'Add supplier' });
    await dialog.getByLabel('Name').fill(name);
    await dialog.getByLabel(/Email/).fill('not-an-email');
    await dialog.getByRole('button', { name: 'Add supplier' }).click();
    await expect(dialog.getByText('Enter a valid email address.')).toBeVisible();
    await dialog.getByLabel(/Email/).fill('orders@e2e.example');
    await dialog.getByRole('button', { name: 'Add supplier' }).click();
    await expect(toast(page, 'Supplier added')).toBeVisible();

    await rowActions(page, name);
    await page.getByRole('menuitem', { name: 'Edit' }).click();
    const edit = page.getByRole('dialog', { name: 'Edit supplier' });
    await edit.getByLabel(/Phone/).fill('+1 555 0199');
    await edit.getByRole('button', { name: 'Save changes' }).click();
    await expect(toast(page, 'Supplier updated')).toBeVisible();
    await expect(page.getByRole('link', { name: '+1 555 0199' })).toBeVisible();

    await rowActions(page, 'Summit Trade Supply');
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await expect(page.getByRole('alertdialog')).toContainText('is still in use');
    await page.getByRole('alertdialog').getByRole('button', { name: 'Close' }).click();

    await rowActions(page, name);
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
    await expect(toast(page, 'Supplier deleted')).toBeVisible();
  });

  test('reports: CSV headers, BOM and dated filenames; valuation table', async ({ page }) => {
    await page.goto('/reports');
    await expect(
      page.getByRole('heading', { name: 'Inventory valuation by category' }),
    ).toBeVisible();
    expect(await page.locator('table tbody tr').count()).toBeGreaterThanOrEqual(6);

    const products = await page.request.get('/api/export/products');
    expect(products.status()).toBe(200);
    expect(products.headers()['content-type']).toContain('text/csv');
    expect(products.headers()['content-disposition']).toMatch(
      /attachment; filename="stockflow-products-\d{4}-\d{2}-\d{2}\.csv"/,
    );
    const body = await products.body();
    expect([...body.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(parseCsv(body.subarray(3).toString('utf8'))[0]).toEqual(PRODUCT_HEADER);

    // The Reports page download (active products) has one row per active product.
    await page.goto('/products');
    const active = await tableTotal(page);
    await page.goto('/reports');
    const all = await downloadCsv(page, 'download-products-csv');
    expect(all.filename).toMatch(/^stockflow-products-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(all.rows[0]).toEqual(PRODUCT_HEADER);
    expect(all.rows.length - 1).toBe(active);

    const movements = await downloadCsv(page, 'download-movements-csv');
    expect(movements.filename).toMatch(/^stockflow-movements-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(movements.rows[0]).toEqual(MOVEMENT_HEADER);
    expect(movements.rows.length).toBeGreaterThan(1);
  });

  test('CSV exports match the filtered tables row for row', async ({ page }) => {
    // Products: the table's own export button sends the same filters.
    await page.goto('/products?q=cable');
    const matching = await tableTotal(page);
    expect(matching).toBeGreaterThan(0);
    const products = await downloadCsv(page, 'export-products');
    expect(products.rows[0]).toEqual(PRODUCT_HEADER);
    expect(products.rows.length - 1).toBe(matching);
    const name = PRODUCT_HEADER.indexOf('Name');
    for (const row of products.rows.slice(1)) {
      expect(row).toHaveLength(PRODUCT_HEADER.length); // quoting kept every row intact
      expect(row[name].toLowerCase()).toContain('cable');
    }

    // Movements: every stock-in, signed and labelled.
    await page.goto('/movements?type=IN');
    const received = await tableTotal(page);
    expect(received).toBeGreaterThan(0);
    const movements = await downloadCsv(page, 'export-movements');
    expect(movements.rows[0]).toEqual(MOVEMENT_HEADER);
    expect(movements.rows.length - 1).toBe(received);
    for (const row of movements.rows.slice(1)) {
      expect(row).toHaveLength(MOVEMENT_HEADER.length);
      expect(row[1]).toBe('Stock in');
      expect(row[4]).toMatch(/^\d+$/);
      expect(Number(row[4])).toBeGreaterThan(0);
      expect(row[0]).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    }
  });

  test('settings: profile, theme and user management', async ({ page }) => {
    await page.goto('/settings');
    await page.getByLabel('Full name').fill('Admin User (e2e)');
    await page.getByRole('button', { name: 'Save profile' }).click();
    await expect(toast(page, 'Profile saved')).toBeVisible();
    await expect(page.getByTestId('user-menu')).toContainText('Admin User (e2e)');
    await page.getByLabel('Full name').fill('Admin User');
    await page.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.getByTestId('user-menu')).toContainText(/Admin User$/);

    await page.getByRole('tab', { name: 'Appearance' }).click();
    await page.getByTestId('theme-dark').click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.getByTestId('theme-light').click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);

    const email = `e2e-${unique().toLowerCase()}@stockflow.test`;
    await page.getByRole('tab', { name: 'Users' }).click();
    await page.getByTestId('add-user').click();
    const add = page.getByRole('dialog', { name: 'Add user' });
    await add.getByLabel('Full name').fill('Temporary Tester');
    await add.getByLabel('Email').fill(email);
    await add.getByLabel('Initial password').fill('Temp#2026x');
    await add.getByRole('button', { name: 'Add user' }).click();
    await expect(toast(page, 'User added')).toBeVisible();

    await rowActions(page, 'Temporary Tester');
    await page.getByRole('menuitem', { name: 'Edit name and role' }).click();
    const edit = page.getByRole('dialog', { name: 'Edit Temporary Tester' });
    await edit.getByLabel('Role').click();
    await page.getByRole('option', { name: 'Admin' }).click();
    await edit.getByRole('button', { name: 'Save changes' }).click();
    await expect(toast(page, 'User updated')).toBeVisible();

    await rowActions(page, 'Temporary Tester');
    await page.getByRole('menuitem', { name: 'Set a new password' }).click();
    const reset = page.getByRole('dialog', { name: 'Set a new password' });
    await reset.getByLabel('New password').fill('Other#2026x');
    await reset.getByRole('button', { name: 'Set password' }).click();
    await expect(toast(page, 'Password updated')).toBeVisible();

    await rowActions(page, 'Temporary Tester');
    await page.getByRole('menuitem', { name: 'Delete user' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete user' }).click();
    await expect(toast(page, 'User deleted')).toBeVisible();
    await expect(page.getByText(email)).toBeHidden();

    // Your own row: no self-delete, no self-reset.
    await rowActions(page, 'Admin User');
    await expect(page.getByRole('menuitem', { name: /Delete user/ })).toBeDisabled();
    await expect(page.getByRole('menuitem', { name: /Set a new password/ })).toBeDisabled();
  });
});

test.describe('as staff', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, 'staff');
  });

  test('can create but not archive or delete; catalogue is read-only', async ({ page }) => {
    await page.goto('/products');
    await expect(page.getByTestId('add-product')).toBeVisible();
    await page.getByTestId('product-actions').first().click();
    await expect(page.getByRole('menuitem', { name: 'Edit' })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /Archive|Delete/ })).toHaveCount(0);
    await page.keyboard.press('Escape');

    await page.goto('/categories');
    await expect(page.getByTestId('add-category')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Actions for/ })).toHaveCount(0);

    await page.goto('/suppliers');
    await expect(page.getByTestId('add-supplier')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Actions for/ })).toHaveCount(0);
  });

  test('has no Users tab and may export reports', async ({ page }) => {
    await page.goto('/settings?tab=users');
    await expect(page.getByRole('tab', { name: 'Users' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Change password' })).toBeEnabled();
    const csv = await page.request.get('/api/export/movements');
    expect(csv.status()).toBe(200);
  });
});

test.describe('as demo', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, 'demo');
  });

  test('password change is blocked with an explanation; users are view-only for deletes', async ({
    page,
  }) => {
    await page.goto('/settings');
    await expect(page.getByTestId('demo-password-notice')).toContainText("can't be changed");
    await expect(page.getByRole('button', { name: 'Change password' })).toBeDisabled();
    await expect(page.getByLabel('Email')).toHaveAttribute('readonly', '');

    await page.getByRole('tab', { name: 'Users' }).click();
    await expect(page.getByTestId('users-section')).toContainText('cannot delete users');
    await rowActions(page, 'Staff User');
    await expect(page.getByRole('menuitem', { name: 'Edit name and role' })).toBeEnabled();
    await expect(page.getByRole('menuitem', { name: /Delete user/ })).toHaveCount(0);
    await expect(page.getByRole('menuitem', { name: /Set a new password/ })).toHaveCount(0);
  });

  test('may archive and see the delete option on products', async ({ page }) => {
    await page.goto('/products');
    await page.getByTestId('product-actions').first().click();
    await expect(page.getByRole('menuitem', { name: 'Archive', exact: true })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /Delete/ })).toBeVisible();
  });
});
