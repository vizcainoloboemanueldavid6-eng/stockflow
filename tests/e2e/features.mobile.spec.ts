import { expect, signIn, test } from './fixtures';

// The narrowest phone the spec names: every page and every table must fit without
// sideways scrolling at 390 px.
test.use({ viewport: { width: 390, height: 844 } });

const PAGES = [
  '/dashboard',
  '/products',
  '/movements',
  '/suppliers',
  '/categories',
  '/reports',
  '/settings',
  '/settings?tab=users',
];

test('every feature page fits a 390 px screen', async ({ page }) => {
  await signIn(page, 'admin');
  await page.goto('/products');
  const detail = await page
    .locator('table tbody a[href^="/products/"]')
    .first()
    .getAttribute('href');
  for (const path of [...PAGES, detail!]) {
    await page.goto(path);
    await expect(page.locator('main h1')).toBeVisible();
    const overflow = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      tables: [...document.querySelectorAll('[data-slot=table-container]')].map(
        (el) => el.scrollWidth - el.clientWidth,
      ),
    }));
    expect(overflow.page, `${path} page overflow`).toBeLessThanOrEqual(0);
    for (const table of overflow.tables) {
      expect(table, `${path} table overflow`).toBeLessThanOrEqual(1);
    }
  }
});

test('a movement can be registered on a phone', async ({ page }) => {
  await signIn(page, 'staff');
  await page.goto('/movements');
  await page.getByTestId('register-movement').click();
  const dialog = page.getByRole('dialog', { name: 'Register movement' });
  await dialog.getByRole('radio', { name: 'Stock in' }).click();
  await dialog.getByTestId('product-combobox').click();
  await page.getByPlaceholder('Product name or SKU...').fill('PWR-101');
  await page.getByRole('option', { name: /PWR-101/ }).click();
  await dialog.getByLabel('Quantity (units)').fill('2');
  await dialog.getByRole('button', { name: 'Record stock in' }).click();
  await expect(
    page.locator('[data-sonner-toast]').filter({ hasText: 'Stock in recorded' }),
  ).toBeVisible();
  await expect(page.locator('table tbody tr').first()).toContainText('PWR-101');
});
