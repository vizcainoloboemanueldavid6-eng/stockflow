import { expect, pickOption, signIn, test, toast, unique } from './fixtures';

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

test('long unbroken names and pasted links wrap instead of widening a page', async ({ page }) => {
  await signIn(page, 'admin');
  const suffix = unique();
  const categoryName = `Longcategorynamewithoutanyspaces${suffix}`.slice(0, 50);
  await page.goto('/categories');
  await page.getByTestId('add-category').click();
  const addCategory = page.getByRole('dialog', { name: 'Add category' });
  await addCategory.getByLabel('Name').fill(categoryName);
  await addCategory.getByRole('button', { name: 'Add category' }).click();
  await expect(toast(page, 'Category added')).toBeVisible();

  const productName = `Ultraconfigurablemultifunctionaldockingstationwithintegratedcardreaders${suffix}`;
  await page.goto('/products');
  await page.getByTestId('add-product').click();
  const addProduct = page.getByRole('dialog', { name: 'Add product' });
  await addProduct.getByLabel('Name').fill(productName);
  await addProduct.getByLabel('SKU').fill(`LONG-${suffix}`.slice(0, 20));
  await pickOption(page, 'Category', categoryName);
  await addProduct.getByLabel('Unit cost ($)').fill('2.00');
  await addProduct.getByLabel('Sale price ($)').fill('5.00');
  await addProduct
    .getByLabel(/Description/)
    .fill(
      'Order page: https://supplier.example.test/catalog/accessories/usb-c-cables/braided-usb-c-to-usb-c-cable-2m-100w-fast-charging-black?variant=2m-black&ref=reorder',
    );
  await addProduct.getByRole('button', { name: 'Add product' }).click();
  await expect(toast(page, 'Product added')).toBeVisible();

  await page.goto(`/products?q=${encodeURIComponent(`LONG-${suffix}`.slice(0, 20))}`);
  const detail = await page
    .locator('table tbody a[href^="/products/"]')
    .first()
    .getAttribute('href');
  for (const path of [detail!, '/products', '/categories', '/reports']) {
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
