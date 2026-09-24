import type { Page } from '@playwright/test';
import { type AccountKey, expect, signIn, test } from './fixtures';

/*
 * "No errors in the console" on every page, for every role, in both themes.
 * The fixture fails a test on any console error or uncaught exception; this spec
 * also fails on any HTTP error answered by the app itself (a broken asset, a failing
 * RSC request, a 500) while the pages load.
 */

const APP_PAGES = [
  '/dashboard',
  '/products',
  '/movements',
  '/suppliers',
  '/categories',
  '/reports',
  '/settings',
];

function trackHttpErrors(page: Page, origin: string) {
  const failures: string[] = [];
  page.on('response', (response) => {
    if (response.status() >= 400 && response.url().startsWith(origin)) {
      failures.push(`${response.status()} ${response.url()}`);
    }
  });
  return failures;
}

async function visitAll(page: Page, paths: string[]) {
  for (const path of paths) {
    await page.goto(path);
    await expect(page.locator('main h1').first()).toBeVisible();
    // Let charts, deferred client components and prefetches settle.
    await page.waitForLoadState('networkidle');
  }
}

async function productDetailPath(page: Page) {
  await page.goto('/products');
  const href = await page.locator('table tbody a[href^="/products/"]').first().getAttribute('href');
  return href!;
}

const runs: { account: AccountKey; theme: 'light' | 'dark' }[] = [
  { account: 'admin', theme: 'light' },
  { account: 'admin', theme: 'dark' },
  { account: 'staff', theme: 'light' },
  { account: 'demo', theme: 'dark' },
];

for (const { account, theme } of runs) {
  test(`no console or HTTP errors on any page: ${account}, ${theme} theme`, async ({
    page,
    baseURL,
  }) => {
    await page.addInitScript((value) => {
      try {
        localStorage.setItem('stockflow-theme', value);
      } catch {
        // storage unavailable: the default theme is fine
      }
    }, theme);
    const httpErrors = trackHttpErrors(page, baseURL!);
    await signIn(page, account);
    await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^(?!.*dark)/);
    const detail = await productDetailPath(page);
    const extra = account === 'staff' ? [] : ['/settings?tab=users'];
    await visitAll(page, [...APP_PAGES, detail, ...extra]);
    expect(httpErrors, 'HTTP errors').toEqual([]);
  });
}

test('no console errors on the public pages and the 404 page', async ({
  page,
  baseURL,
  consoleErrors,
}) => {
  const httpErrors = trackHttpErrors(page, baseURL!);
  for (const path of ['/login', '/register']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
  }
  expect(httpErrors, 'HTTP errors').toEqual([]);

  await signIn(page, 'admin');
  const missing = `${baseURL}/this-page-does-not-exist`;
  const response = await page.goto(missing);
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.waitForLoadState('networkidle');
  // Chrome itself logs the 404 status of the document it was asked to open. That line,
  // and only that line, is expected here; anything else still fails the test.
  const browserNotice = `${missing}: Failed to load resource: the server responded with a status of 404 (Not Found)`;
  const index = consoleErrors.indexOf(browserNotice);
  if (index !== -1) consoleErrors.splice(index, 1);
});
