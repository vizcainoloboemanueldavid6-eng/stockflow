import { expect, signIn, test } from './fixtures';

test('on a phone the sidebar becomes a drawer', async ({ page }) => {
  await signIn(page, 'staff');
  await expect(page.locator('aside')).toBeHidden();
  await page.getByTestId('open-navigation').click();
  const drawer = page.getByRole('dialog', { name: 'Navigation' });
  await expect(drawer).toBeVisible();
  await drawer.getByRole('link', { name: 'Products' }).click();
  await page.waitForURL('**/products');
  await expect(drawer).toBeHidden();

  // No horizontal scrolling at phone width.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
