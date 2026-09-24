import {
  ACCOUNTS,
  createProduct,
  expect,
  recordServerAction,
  replayServerAction,
  rowActions,
  signIn,
  test,
  toast,
  trackConsoleErrors,
  unique,
} from './fixtures';

/*
 * The spec: "a Staff user cannot delete (tested in e2e, also by calling the action
 * directly)". The UI tests show the controls are hidden; these tests call the real
 * server actions over HTTP with a STAFF (or DEMO) session cookie, the way a
 * hand-crafted request would, and check that the server refuses and nothing changes.
 *
 * How: an allowed user's browser performs the action once while the request is
 * recorded (Next-Action id + serialised arguments); the same request is then
 * replayed from the restricted user's browser context. A replay with the allowed
 * user's session is the positive control that proves the replay reaches the action.
 */

test('STAFF cannot delete a product, even by calling the server action directly', async ({
  page,
  browser,
}) => {
  // Staff may create products: two fresh ones without stock history, so an admin
  // could delete either of them.
  await signIn(page, 'staff');
  const tag = unique();
  const first = { sku: `DEL-A-${tag}`, name: `Direct call target A ${tag}` };
  const second = { sku: `DEL-B-${tag}`, name: `Direct call target B ${tag}` };
  const firstId = await createProduct(page, first);
  const secondId = await createProduct(page, second);

  // The staff row menu offers no delete (the UI half of the rule).
  await rowActions(page, second.name);
  await expect(page.getByRole('menuitem', { name: 'Edit' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /Delete|Archive/ })).toHaveCount(0);
  await page.keyboard.press('Escape');

  // An admin deletes the first product in the UI; the request is recorded.
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  const adminErrors = trackConsoleErrors(admin);
  await signIn(admin, 'admin');
  await admin.goto(`/products?q=${first.sku}`);
  const deleteProduct = await recordServerAction(admin, async () => {
    await rowActions(admin, first.name);
    await admin.getByRole('menuitem', { name: /Delete/ }).click();
    await admin
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Delete permanently' })
      .click();
  });
  await expect(toast(admin, 'Product deleted')).toBeVisible();
  expect(deleteProduct.body).toContain(firstId);
  const secondBody = deleteProduct.body.replace(firstId, secondId);

  // STAFF sends the same action for the second product: refused by the server.
  const refused = await replayServerAction(page, deleteProduct, { body: secondBody });
  expect(refused.status).toBe(200);
  expect(refused.text).toContain('"ok":false');
  expect(refused.text).toContain('"code":"FORBIDDEN"');
  await page.goto(`/products?q=${second.sku}`);
  await expect(page.locator('table tbody tr')).toHaveCount(1);
  await expect(page.getByRole('link', { name: second.name })).toBeVisible();

  // Positive control: the identical request with the admin's session deletes it.
  const allowed = await replayServerAction(admin, deleteProduct, { body: secondBody });
  expect(allowed.text).toContain('"ok":true');
  await page.reload();
  await expect(page.getByText('No products match these filters')).toBeVisible();

  expect(adminErrors, 'admin console errors').toEqual([]);
  await adminContext.close();
});

test('STAFF cannot delete a category, even by calling the server action directly', async ({
  page,
  browser,
}) => {
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  const adminErrors = trackConsoleErrors(admin);
  await signIn(admin, 'admin');

  const tag = unique();
  const names = [`Direct A ${tag}`, `Direct B ${tag}`];
  await admin.goto('/categories');
  for (const name of names) {
    await admin.getByTestId('add-category').click();
    const dialog = admin.getByRole('dialog', { name: 'Add category' });
    await dialog.getByLabel('Name').fill(name);
    await dialog.getByRole('button', { name: 'Add category' }).click();
    await expect(toast(admin, 'Category added')).toBeVisible();
    await expect(dialog).toBeHidden();
  }
  // Category ids appear in each row's "View products" link (?category=<id>).
  const idOf = async (name: string) => {
    const row = admin.getByRole('row').filter({ hasText: name });
    const href = await row.locator('a[href*="category="]').first().getAttribute('href');
    return new URL(href!, 'http://x').searchParams.get('category')!;
  };
  const [firstId, secondId] = [await idOf(names[0]), await idOf(names[1])];

  const deleteCategory = await recordServerAction(admin, async () => {
    await rowActions(admin, names[0]);
    await admin.getByRole('menuitem', { name: 'Delete' }).click();
    await admin.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  });
  await expect(toast(admin, 'Category deleted')).toBeVisible();
  const secondBody = deleteCategory.body.replace(firstId, secondId);

  await signIn(page, 'staff');
  const refused = await replayServerAction(page, deleteCategory, { body: secondBody });
  expect(refused.text).toContain('"code":"FORBIDDEN"');
  await page.goto('/categories');
  await expect(page.getByRole('cell', { name: names[1], exact: true })).toBeVisible();

  const allowed = await replayServerAction(admin, deleteCategory, { body: secondBody });
  expect(allowed.text).toContain('"ok":true');
  await page.reload();
  await expect(page.getByRole('cell', { name: names[1], exact: true })).toBeHidden();

  expect(adminErrors, 'admin console errors').toEqual([]);
  await adminContext.close();
});

test('DEMO cannot change its password: disabled in the UI and refused by the server', async ({
  page,
  browser,
}) => {
  // Record the change-password action from a STAFF session. The current password is
  // wrong on purpose, so the recording changes nothing.
  const staffContext = await browser.newContext();
  const staff = await staffContext.newPage();
  const staffErrors = trackConsoleErrors(staff);
  await signIn(staff, 'staff');
  await staff.goto('/settings');
  const changePassword = await recordServerAction(staff, async () => {
    await staff.getByLabel('Current password').fill('not-my-password');
    await staff.getByLabel('New password', { exact: true }).fill('Changed#2026x');
    await staff.getByLabel('Confirm new password').fill('Changed#2026x');
    await staff.getByRole('button', { name: 'Change password' }).click();
  });
  await expect(staff.getByText('This is not your current password.')).toBeVisible();

  // Demo: the form is disabled with the reason...
  await signIn(page, 'demo');
  await page.goto('/settings');
  await expect(page.getByTestId('demo-password-notice')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Change password' })).toBeDisabled();

  // ...and the server refuses the direct call before looking at the passwords, even
  // with the demo account's real current password.
  const body = changePassword.body.replace('not-my-password', ACCOUNTS.demo.password);
  const refused = await replayServerAction(page, changePassword, { body });
  expect(refused.text).toContain('"code":"FORBIDDEN"');
  expect(refused.text).toContain("password can't be changed");

  // Positive control: the same replay as STAFF reaches the password check.
  const reached = await replayServerAction(staff, changePassword);
  expect(reached.text).toContain('"code":"VALIDATION"');

  // The demo password still works.
  const fresh = await browser.newContext();
  const check = await fresh.newPage();
  await signIn(check, 'demo');
  await fresh.close();

  expect(staffErrors, 'staff console errors').toEqual([]);
  await staffContext.close();
});
