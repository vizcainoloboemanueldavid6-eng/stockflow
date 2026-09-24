import { expect, signIn, test } from './fixtures';

test.describe('app shell', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, 'admin');
  });

  test('sidebar navigates and collapses to icons', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: 'Main' });
    await nav.getByRole('link', { name: 'Suppliers' }).click();
    await page.waitForURL('**/suppliers');
    await expect(nav.getByRole('link', { name: 'Suppliers' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await page.getByRole('button', { name: 'Collapse sidebar' }).click();
    await expect(page.locator('aside[data-collapsed="true"]')).toBeVisible();
    // The choice survives a reload (cookie read on the server).
    await page.reload();
    await expect(page.locator('aside[data-collapsed="true"]')).toBeVisible();
    await page.getByRole('button', { name: 'Expand sidebar' }).click();
    await expect(page.locator('aside[data-collapsed="false"]')).toBeVisible();
  });

  test('Ctrl+K palette finds products and pages', async ({ page }) => {
    await page.keyboard.press('Control+k');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('combobox').fill('usb-c');
    const product = dialog.getByRole('option', { name: /USB-C to USB-C Cable 1 m/ });
    await expect(product).toBeVisible();
    await product.click();
    await page.waitForURL(/\/products\/[^/]+$/);

    await page.getByTestId('open-search').click();
    await page.getByRole('dialog').getByRole('combobox').fill('reports');
    await page.getByRole('option', { name: /Reports/ }).click();
    await page.waitForURL('**/reports');
  });

  test('product search API answers for a signed-in user', async ({ page }) => {
    const response = await page.request.get('/api/search?q=cable');
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { products: { name: string }[] };
    expect(body.products.length).toBeGreaterThan(0);
    expect(body.products.every((p) => /cable/i.test(p.name))).toBe(true);
  });

  test('theme switch applies without reload and persists', async ({ page }) => {
    await page.getByTestId('theme-toggle').click();
    await page.getByRole('menuitemradio', { name: 'Dark' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.getByTestId('theme-toggle').click();
    await page.getByRole('menuitemradio', { name: 'Light' }).click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
  });
});
