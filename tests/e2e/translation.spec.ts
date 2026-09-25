import { type Page } from '@playwright/test';
import { expect, test, toast, unique } from './fixtures';

/*
 * Browser translation (Chrome's built-in Google Translate) regression test.
 *
 * Real visitors open the English app in Chrome with automatic translation. Translate
 * moves every text node into <font><font>translated</font></font> wrappers, and
 * translates the new text React renders too. When React later removes, re-inserts next to
 * or edits one of *its* text nodes, that node is no longer in the page: NotFoundError, the
 * page is replaced by the error screen, or the text on screen silently stays stale.
 *
 * `translate()` does what Translate does to the DOM, and every step below runs it again
 * after the interaction (new content gets translated as well), then checks that:
 *  - no uncaught error happened (the fixture fails the test on any page error);
 *  - no error screen is shown;
 *  - the DOM guard safety net (src/lib/dom-guard.ts) never had to step in, so the
 *    components themselves are translation-safe;
 *  - the content really changed (new page numbers, the chosen filter, the stock preview).
 * It runs at 390 px (phone, navigation drawer) and 1440 px (desktop sidebar).
 */

const TRANSLATE = () => {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.nodeValue?.trim() && !node.parentElement?.closest('script,style,noscript,font')
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT,
  });
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const text of nodes) {
    const outer = document.createElement('font');
    outer.style.verticalAlign = 'inherit';
    const inner = document.createElement('font');
    inner.style.verticalAlign = 'inherit';
    inner.textContent = `[es] ${text.nodeValue}`;
    outer.appendChild(inner);
    text.parentNode?.replaceChild(outer, text);
  }
  document.documentElement.classList.add('translated-ltr');
  return nodes.length;
};

/** Lets React finish the interaction, translates what is new, then checks the page. */
async function step(page: Page, label: string) {
  // Translate starts once the page has loaded; translating while React is still hydrating
  // would only test a hydration mismatch, which React recovers from by re-rendering.
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(250);
  await page.evaluate(TRANSLATE);
  await page.waitForTimeout(100);
  await expect(page.getByText(/Application error|Something went wrong/i), label).toHaveCount(0);
  await expect(page.getByText('This page could not be loaded'), label).toHaveCount(0);
  const guard = await page.evaluate(() => {
    const w = window as unknown as { __domGuardHits?: number; __domGuardLog?: string[] };
    return { hits: w.__domGuardHits, log: w.__domGuardLog };
  });
  expect(
    guard.hits,
    `${label}: the DOM guard is installed and never needed ${JSON.stringify(guard.log)}`,
  ).toBe(0);
}

/** Opens a Radix Select by its accessible name and picks an option. */
async function pick(page: Page, trigger: string, option: string | RegExp) {
  await page.getByRole('combobox', { name: trigger }).click();
  await step(page, `${trigger} open`);
  await page.getByRole('option', { name: option }).click();
}

async function signInWithDemo(page: Page) {
  await page.goto('/login');
  await step(page, 'login page');
  await page.getByTestId('demo-login').click();
  await page.waitForURL('**/dashboard');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Dashboard');
  await step(page, 'dashboard');
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
]) {
  const phone = viewport.width < 1024;

  test.describe(`translated page at ${viewport.width} px`, () => {
    test.use({ viewport });

    test('sign-in with "Try the demo", shell, theme and Ctrl+K palette', async ({ page }) => {
      await signInWithDemo(page);

      // Theme menu: light -> dark -> light.
      await page.getByTestId('theme-toggle').click();
      await step(page, 'theme menu');
      await page.getByRole('menuitemradio', { name: 'Dark' }).click();
      await expect(page.locator('html')).toHaveClass(/dark/);
      await step(page, 'dark theme');
      await page.getByTestId('theme-toggle').click();
      await page.getByRole('menuitemradio', { name: 'Light' }).click();
      await expect(page.locator('html')).not.toHaveClass(/dark/);
      await step(page, 'light theme');

      if (phone) {
        await page.getByTestId('open-navigation').click();
        const drawer = page.getByRole('dialog', { name: 'Navigation' });
        await expect(drawer).toBeVisible();
        await step(page, 'drawer open');
        await drawer.getByRole('link', { name: 'Products' }).click();
        await page.waitForURL('**/products');
        await expect(drawer).toBeHidden();
        await step(page, 'drawer navigation');
      } else {
        await page.getByRole('button', { name: 'Collapse sidebar' }).click();
        await expect(page.locator('aside[data-collapsed="true"]')).toBeVisible();
        await page.getByRole('button', { name: 'Expand sidebar' }).hover();
        await step(page, 'sidebar collapsed');
        await page.getByRole('button', { name: 'Expand sidebar' }).click();
        await expect(page.locator('aside[data-collapsed="false"]')).toBeVisible();
        await step(page, 'sidebar expanded');
        await page
          .getByRole('navigation', { name: 'Main' })
          .getByRole('link', { name: 'Products' })
          .click();
        await page.waitForURL('**/products');
        await step(page, 'sidebar navigation');
      }

      // Command palette: products, no results (with the query), pages.
      await page.keyboard.press('Control+k');
      const palette = page.getByRole('dialog');
      await expect(palette).toBeVisible();
      await step(page, 'palette open');
      await palette.getByRole('combobox').fill('usb-c');
      await expect(palette.getByRole('option', { name: /USB-C/ }).first()).toBeVisible();
      await step(page, 'palette products');
      await palette.getByRole('combobox').fill('qqzzxx');
      await expect(palette.getByText(/No results for "qqzzxx"/)).toBeVisible();
      await step(page, 'palette empty');
      await palette.getByRole('combobox').fill('qqzzxxy');
      await expect(palette.getByText(/No results for "qqzzxxy"/)).toBeVisible();
      await step(page, 'palette empty again');
      await palette.getByRole('combobox').fill('reports');
      await palette.getByRole('option', { name: /Reports/ }).click();
      await page.waitForURL('**/reports');
      await step(page, 'palette navigation');

      // Account menu.
      await page.getByTestId('user-menu').click();
      await expect(page.getByTestId('sign-out')).toBeVisible();
      await step(page, 'account menu');
      await page.keyboard.press('Escape');
      await step(page, 'account menu closed');
    });

    test('products table: paginate, search, filter, sort, page size', async ({ page }) => {
      await signInWithDemo(page);
      await page.goto('/products');
      await expect(page.locator('table tbody tr')).toHaveCount(10);
      await expect(page.getByText(/Showing 1–10 of \d+ products/)).toBeVisible();
      await step(page, 'products');

      await page.getByRole('button', { name: 'Next page' }).click();
      await page.waitForURL(/[?&]page=2/);
      await expect(page.getByText(/Showing 11–20 of \d+ products/)).toBeVisible();
      await expect(page.getByText(/Page 2 of \d+/)).toBeVisible();
      await step(page, 'page 2');
      await page.getByRole('button', { name: 'Previous page' }).click();
      await page.waitForURL((url) => !url.searchParams.has('page'));
      await expect(page.getByText(/Showing 1–10 of \d+ products/)).toBeVisible();
      await expect(page.getByText(/Page 1 of \d+/)).toBeVisible();
      await step(page, 'page 1');

      await page.getByRole('searchbox', { name: /Search products/ }).fill('cable');
      await page.waitForURL(/[?&]q=cable/);
      await expect(page.getByText(/Showing 1–\d+ of \d+ products/)).toBeVisible();
      const names = await page.locator('table tbody tr td:first-child a').allTextContents();
      expect(names.length).toBeGreaterThan(0);
      for (const name of names) expect(name.toLowerCase()).toContain('cable');
      await step(page, 'search');
      await page.getByRole('button', { name: 'Clear search' }).click();
      await page.waitForURL((url) => !url.searchParams.has('q'));
      await step(page, 'search cleared');

      await pick(page, 'Filter by stock status', /Low stock/);
      await page.waitForURL(/[?&]status=low_stock/);
      await expect(page.getByRole('combobox', { name: 'Filter by stock status' })).toContainText(
        'Low stock',
      );
      await step(page, 'status filter');
      await pick(page, 'Filter by stock status', /Out of stock/);
      await page.waitForURL(/[?&]status=out_of_stock/);
      await expect(page.getByRole('combobox', { name: 'Filter by stock status' })).toContainText(
        'Out of stock',
      );
      await expect(
        page.getByRole('combobox', { name: 'Filter by stock status' }),
      ).not.toContainText('Low stock');
      await step(page, 'status filter changed');
      await pick(page, 'Filter by category', /Cables/);
      await page.waitForURL(/[?&]category=/);
      await step(page, 'category filter');
      await page.getByRole('button', { name: 'Clear filters' }).first().click();
      await page.waitForURL((url) => !url.searchParams.has('status'));
      await expect(page.getByRole('combobox', { name: 'Filter by stock status' })).toContainText(
        'Any stock status',
      );
      await step(page, 'filters cleared');

      const stock = page.locator('thead').getByRole('button', { name: /Stock/ });
      await stock.click();
      await page.waitForURL(/sort=quantity/);
      await step(page, 'sorted');
      await stock.click();
      await page.waitForURL(/dir=(asc|desc)/);
      await step(page, 'sorted the other way');

      await pick(page, 'Rows per page', '20');
      await page.waitForURL(/pageSize=20/);
      await expect(page.locator('table tbody tr')).toHaveCount(20);
      await expect(page.getByText(/Showing 1–20 of \d+ products/)).toBeVisible();
      await step(page, 'page size');

      await page.getByTestId('product-actions').first().click();
      await expect(page.getByRole('menuitem', { name: 'View details' })).toBeVisible();
      await step(page, 'row menu');
      await page.keyboard.press('Escape');
      await step(page, 'row menu closed');
    });

    test('product dialog: validation, create, edit, archive, restore, delete', async ({ page }) => {
      const sku = `TR-${unique()}`;
      const name = `Translated lamp ${sku}`;
      await signInWithDemo(page);
      await page.goto('/products');
      await step(page, 'products');

      await page.getByTestId('add-product').click();
      const dialog = page.getByRole('dialog', { name: 'Add product' });
      await expect(dialog).toBeVisible();
      await step(page, 'add dialog');
      await dialog.getByRole('button', { name: 'Add product' }).click();
      await expect(dialog.locator('[data-slot="form-message"]').first()).toBeVisible();
      await step(page, 'validation errors');
      await dialog.getByLabel('Name').fill(name);
      await dialog.getByLabel('SKU').fill('CBL-101');
      await step(page, 'fields filled');
      await pick(page, 'Category', /Cables/);
      await expect(dialog.getByRole('combobox', { name: 'Category' })).toContainText('Cables');
      await step(page, 'category picked');
      await dialog.getByLabel('Unit cost ($)').fill('4.50');
      await dialog.getByLabel('Sale price ($)').fill('12.99');
      await dialog.getByRole('button', { name: 'Add product' }).click();
      await expect(dialog.getByText('Another product already uses this SKU.')).toBeVisible();
      await step(page, 'duplicate SKU');
      await dialog.getByLabel('SKU').fill(sku);
      await dialog.getByRole('button', { name: 'Add product' }).click();
      await expect(toast(page, 'Product added')).toBeVisible();
      await expect(dialog).toBeHidden();
      await step(page, 'product added');

      await page.goto(`/products?q=${sku}`);
      await expect(page.locator('table tbody tr')).toHaveCount(1);
      await step(page, 'filtered to the new product');
      await page.getByRole('button', { name: `Actions for ${name}` }).click();
      await step(page, 'row menu');
      await page.getByRole('menuitem', { name: 'Edit' }).click();
      const edit = page.getByRole('dialog', { name: 'Edit product' });
      await step(page, 'edit dialog');
      await edit.getByLabel('Name').fill(`${name} v2`);
      await edit.getByRole('button', { name: 'Save changes' }).click();
      await expect(toast(page, 'Product updated')).toBeVisible();
      await expect(page.getByRole('link', { name: `${name} v2` })).toBeVisible();
      await step(page, 'product renamed');

      await page.getByRole('button', { name: `Actions for ${name} v2` }).click();
      await page.getByRole('menuitem', { name: 'Archive' }).click();
      await step(page, 'archive confirm');
      await page.getByRole('alertdialog').getByRole('button', { name: 'Archive' }).click();
      await expect(toast(page, 'Product archived')).toBeVisible();
      await expect(page.getByText('No products match these filters')).toBeVisible();
      await step(page, 'archived');

      await page.goto(`/products?q=${sku}&archived=archived`);
      await step(page, 'archived list');
      await page.getByRole('button', { name: `Actions for ${name} v2` }).click();
      await step(page, 'archived row menu');
      await page.getByRole('menuitem', { name: 'Restore' }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Restore' }).click();
      await expect(toast(page, 'Product restored')).toBeVisible();
      await step(page, 'restored');

      await page.goto(`/products?q=${sku}`);
      await step(page, 'restored list');
      await page.getByRole('button', { name: `Actions for ${name} v2` }).click();
      await page.getByRole('menuitem', { name: /Delete/ }).click();
      await step(page, 'delete confirm');
      await page
        .getByRole('alertdialog')
        .getByRole('button', { name: 'Delete permanently' })
        .click();
      await expect(toast(page, 'Product deleted')).toBeVisible();
      await expect(page.getByText('No products match these filters')).toBeVisible();
      await step(page, 'deleted');
    });

    test('movements: type switch, stock preview, refused overdraw, stock in, filters', async ({
      page,
    }) => {
      await signInWithDemo(page);
      await page.goto('/movements');
      await step(page, 'movements');
      await page.getByTestId('register-movement').click();
      const dialog = page.getByRole('dialog', { name: 'Register movement' });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText('Sold or shipped to a customer')).toBeVisible();
      await step(page, 'movement dialog');
      await dialog.getByRole('radio', { name: 'Stock in' }).click();
      await expect(dialog.getByText('Received from a supplier or returned')).toBeVisible();
      await expect(dialog.getByRole('button', { name: /Record stock in/ })).toBeVisible();
      await step(page, 'stock in type');

      await dialog.getByRole('radio', { name: 'Stock out' }).click();
      await expect(dialog.getByText('Sold or shipped to a customer')).toBeVisible();
      await expect(dialog.getByRole('button', { name: /Record stock out/ })).toBeVisible();
      await step(page, 'stock out type');

      await dialog.getByTestId('product-combobox').click();
      await step(page, 'product picker');
      await page.getByPlaceholder('Product name or SKU...').fill('qqzzxx');
      await expect(page.getByText(/No active product matches "qqzzxx"/)).toBeVisible();
      await step(page, 'picker: no match');
      await page.getByPlaceholder('Product name or SKU...').fill('CBL-103');
      await page.getByRole('option', { name: /CBL-103/ }).click();
      await expect(dialog.getByTestId('product-combobox')).toContainText('CBL-103');
      await step(page, 'product picked');

      const preview = dialog.getByTestId('stock-preview');
      await dialog.getByLabel('Quantity (units)').fill('99999');
      await expect(preview).toContainText('will be refused');
      await step(page, 'preview: refused');
      await dialog.getByLabel('Quantity (units)').fill('1');
      await expect(preview).toContainText('after this movement');
      await expect(preview).not.toContainText('will be refused');
      await step(page, 'preview: fine');
      await dialog.getByLabel('Quantity (units)').fill('');
      await expect(preview).not.toContainText('after this movement');
      await step(page, 'preview: no quantity');
      await dialog.getByLabel('Quantity (units)').fill('99999');
      await expect(preview).toContainText('will be refused');
      await step(page, 'preview: refused again');

      await dialog.getByRole('button', { name: /Record stock out/ }).click();
      await expect(
        toast(page, /Not enough stock: \d+ available, tried to remove 99999/),
      ).toBeVisible();
      await expect(dialog).toBeVisible();
      await step(page, 'overdraw refused');

      await dialog.getByRole('radio', { name: 'Adjustment' }).click();
      await expect(dialog.getByRole('radio', { name: 'Add units' })).toBeVisible();
      await expect(dialog.getByText('Correction after a count, damage or loss')).toBeVisible();
      await step(page, 'adjustment');
      await dialog.getByRole('radio', { name: 'Add units' }).click();
      await step(page, 'adjustment direction');

      await dialog.getByRole('radio', { name: 'Stock in' }).click();
      await expect(dialog.getByRole('radio', { name: 'Add units' })).toBeHidden();
      await expect(dialog.getByRole('button', { name: /Record stock in/ })).toBeVisible();
      await dialog.getByLabel('Quantity (units)').fill('1');
      await dialog.getByLabel(/Reason/).fill('Translated delivery');
      await step(page, 'stock in filled');
      await dialog.getByRole('button', { name: /Record stock in/ }).click();
      await expect(toast(page, 'Stock in recorded')).toBeVisible();
      await expect(dialog).toBeHidden();
      const first = page.locator('table tbody tr').first();
      await expect(first).toContainText('CBL-103');
      await expect(first).toContainText('+1');
      await step(page, 'stock in recorded');

      await pick(page, 'Filter by movement type', /Stock in/);
      await page.waitForURL(/[?&]type=IN/);
      await expect(page.getByRole('combobox', { name: 'Filter by movement type' })).toContainText(
        'Stock in',
      );
      await step(page, 'type filter');
      await page.getByRole('button', { name: 'Clear filters' }).first().click();
      await page.waitForURL((url) => !url.searchParams.has('type'));
      await expect(page.getByRole('combobox', { name: 'Filter by movement type' })).toContainText(
        'All types',
      );
      await step(page, 'filters cleared');
    });

    test('product detail: a movement updates the figures on the translated page', async ({
      page,
    }) => {
      await signInWithDemo(page);
      await page.goto('/products?q=CBL-103');
      await page.locator('table tbody a[href^="/products/"]').first().click();
      await page.waitForURL(/\/products\/[^/?]+$/);
      await step(page, 'product detail');
      const onHand = page.getByRole('region', { name: 'Stock summary' }).locator('p').nth(1);
      const before = Number((await onHand.innerText()).replace(/[^\d]/g, ''));

      await page.getByRole('button', { name: /Register movement/ }).click();
      const dialog = page.getByRole('dialog', { name: 'Register movement' });
      await step(page, 'movement dialog');
      await dialog.getByRole('radio', { name: 'Stock in' }).click();
      await dialog.getByLabel('Quantity (units)').fill('2');
      await step(page, 'quantity');
      await dialog.getByRole('button', { name: /Record stock in/ }).click();
      await expect(toast(page, 'Stock in recorded')).toBeVisible();
      await expect(dialog).toBeHidden();
      await expect(onHand).toContainText(`${before + 2} units`);
      await step(page, 'figures updated');
    });

    test('categories and suppliers: validation, live preview, create and delete', async ({
      page,
    }) => {
      const suffix = unique();
      await signInWithDemo(page);

      await page.goto('/categories');
      await step(page, 'categories');
      await page.getByTestId('add-category').click();
      const category = page.getByRole('dialog', { name: 'Add category' });
      await step(page, 'category dialog');
      await category.getByRole('button', { name: 'Add category' }).click();
      await expect(category.locator('[data-slot="form-message"]').first()).toBeVisible();
      await step(page, 'category validation');
      await category.getByLabel('Name').fill(`Lamps ${suffix}`);
      await expect(category.getByText(`Lamps ${suffix}`)).toBeVisible();
      await step(page, 'category preview');
      await category.getByLabel('Name').fill(`Lights ${suffix}`);
      await expect(category.getByText(`Lights ${suffix}`)).toBeVisible();
      await expect(category.getByText(`Lamps ${suffix}`)).toHaveCount(0);
      await category.getByRole('radio', { name: '#10B981' }).click();
      await step(page, 'category colour');
      await category.getByRole('button', { name: 'Add category' }).click();
      await expect(toast(page, 'Category added')).toBeVisible();
      await expect(page.getByRole('cell', { name: `Lights ${suffix}` }).first()).toBeVisible();
      await step(page, 'category added');
      await page.getByRole('button', { name: `Actions for Lights ${suffix}` }).click();
      await page.getByRole('menuitem', { name: 'Delete' }).click();
      await step(page, 'category delete confirm');
      await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
      await expect(toast(page, 'Category deleted')).toBeVisible();
      await step(page, 'category deleted');

      await page.goto('/suppliers');
      await step(page, 'suppliers');
      await page.getByTestId('add-supplier').click();
      const supplier = page.getByRole('dialog', { name: 'Add supplier' });
      await step(page, 'supplier dialog');
      await supplier.getByLabel('Name').fill(`Translated supplier ${suffix}`);
      await supplier.getByLabel(/Email/).fill('not-an-email');
      await supplier.getByRole('button', { name: 'Add supplier' }).click();
      await expect(supplier.getByText('Enter a valid email address.')).toBeVisible();
      await step(page, 'supplier validation');
      await supplier.getByLabel(/Email/).fill('orders@example.test');
      await supplier.getByRole('button', { name: 'Add supplier' }).click();
      await expect(toast(page, 'Supplier added')).toBeVisible();
      await step(page, 'supplier added');
      await page.getByRole('button', { name: `Actions for Translated supplier ${suffix}` }).click();
      await page.getByRole('menuitem', { name: 'Delete' }).click();
      await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
      await expect(toast(page, 'Supplier deleted')).toBeVisible();
      await step(page, 'supplier deleted');
    });

    test('reports and settings: selects, tabs, theme picker, user dialog', async ({ page }) => {
      await signInWithDemo(page);
      await page.goto('/reports');
      await step(page, 'reports');
      await pick(page, 'Products', /Archived only/);
      await expect(page.getByRole('combobox', { name: 'Products' })).toContainText('Archived only');
      await step(page, 'export option');
      await pick(page, 'Products', /Active and archived/);
      await expect(page.getByRole('combobox', { name: 'Products' })).toContainText(
        'Active and archived',
      );
      await step(page, 'export option changed');

      await page.goto('/settings');
      await step(page, 'settings');
      await expect(page.getByTestId('demo-password-notice')).toBeVisible();
      await page.getByRole('tab', { name: 'Appearance' }).click();
      await step(page, 'appearance tab');
      await page.getByTestId('theme-dark').click();
      await expect(page.locator('html')).toHaveClass(/dark/);
      await step(page, 'dark');
      await page.getByTestId('theme-light').click();
      await expect(page.locator('html')).not.toHaveClass(/dark/);
      await step(page, 'light');
      await page.getByRole('tab', { name: 'Users' }).click();
      await expect(page.getByTestId('users-section')).toBeVisible();
      await step(page, 'users tab');
      await page.getByTestId('add-user').click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await step(page, 'add user dialog');
      await dialog.getByRole('button', { name: 'Add user' }).click();
      await expect(dialog.locator('[data-slot="form-message"]').first()).toBeVisible();
      await step(page, 'add user validation');
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await expect(dialog).toBeHidden();
      await step(page, 'add user closed');
      await page.getByRole('tab', { name: 'Account' }).click();
      await step(page, 'account tab');
    });
  });
}
