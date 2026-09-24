import { test as base, expect, type Page } from '@playwright/test';

/** Seeded accounts (src/lib/config.ts defaults; README lists the same). */
export const ACCOUNTS = {
  admin: {
    email: 'admin@stockflow.test',
    password: 'Admin#2026',
    name: 'Admin User',
    role: 'Admin',
  },
  staff: {
    email: 'staff@stockflow.test',
    password: 'Staff#2026',
    name: 'Staff User',
    role: 'Staff',
  },
  demo: { email: 'demo@stockflow.test', password: 'Demo#2026', name: 'Demo User', role: 'Demo' },
} as const;

export type AccountKey = keyof typeof ACCOUNTS;

/** The regular server (registration and demo enabled). */
export const OPEN_BASE_URL =
  process.env.E2E_BASE_URL ?? `http://localhost:${process.env.E2E_PORT ?? 3100}`;

/**
 * Records console errors and uncaught exceptions of a page. The `test` below attaches
 * it to the default page automatically; call it for extra pages a test opens.
 */
export function trackConsoleErrors(page: Page, errors: string[] = []): string[] {
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${page.url()}: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`${page.url()}: ${error.message}`));
  return errors;
}

/**
 * `test` with a console guard: any console error or uncaught page error during a
 * test fails it (spec: "no errors in the console"). Expected 401 responses from
 * deliberately unauthenticated API calls are made with `request`, not the page.
 */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors = trackConsoleErrors(page);
      await use(errors);
      expect(errors, 'console errors').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

export async function signIn(page: Page, account: AccountKey) {
  const { email, password } = ACCOUNTS[account];
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('**/dashboard');
}

/** A short unique suffix for records a test creates. */
export const unique = () =>
  `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`.toUpperCase();

/** A Sonner toast with the given text. */
export const toast = (page: Page, text: string | RegExp) =>
  page.locator('[data-sonner-toast]').filter({ hasText: text }).first();

/** Opens a Radix Select by its label and picks an option. */
export async function pickOption(page: Page, label: string, option: string | RegExp) {
  await page.getByLabel(label, { exact: true }).click();
  await page.getByRole('option', { name: option }).click();
}

/** Opens the row menu ("Actions for <name>") of a table row. */
export async function rowActions(page: Page, name: string) {
  await page.getByRole('button', { name: `Actions for ${name}` }).click();
}

/**
 * Creates a product through the "Add product" dialog on /products (no opening
 * stock, so it has no movement history) and returns its id from the table link.
 */
export async function createProduct(page: Page, { sku, name }: { sku: string; name: string }) {
  await page.goto('/products');
  await page.getByTestId('add-product').click();
  const dialog = page.getByRole('dialog', { name: 'Add product' });
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByLabel('SKU').fill(sku);
  await pickOption(page, 'Category', /Cables & Adapters/);
  await dialog.getByLabel('Unit cost ($)').fill('2.00');
  await dialog.getByLabel('Sale price ($)').fill('5.00');
  await dialog.getByRole('button', { name: 'Add product' }).click();
  await expect(toast(page, 'Product added')).toBeVisible();
  await page.goto(`/products?q=${encodeURIComponent(sku)}`);
  const link = page.locator('table tbody a[href^="/products/"]').first();
  await expect(link).toHaveText(name);
  const href = await link.getAttribute('href');
  return href!.split('/').pop()!;
}

/*
 * Direct server-action calls.
 *
 * A Next.js server action is an HTTP POST to the page URL with a `Next-Action` header
 * (the action's id) and the serialised arguments as the body. The UI hides what a role
 * may not do, so to prove the *server* refuses it, a test records the request a
 * permitted user's browser sends and replays it with another user's session cookie -
 * exactly what a hand-crafted request would do.
 */
export type RecordedAction = { url: string; headers: Record<string, string>; body: string };

const REPLAYED_HEADERS = ['next-action', 'next-router-state-tree', 'content-type', 'accept'];

/** Runs `trigger` and returns the first server-action request the page sends. */
export async function recordServerAction(
  page: Page,
  trigger: () => Promise<unknown>,
): Promise<RecordedAction> {
  const pending = page.waitForRequest(
    (request) => request.method() === 'POST' && Boolean(request.headers()['next-action']),
  );
  await trigger();
  const request = await pending;
  const all = await request.allHeaders();
  const headers: Record<string, string> = {};
  for (const name of REPLAYED_HEADERS) if (all[name]) headers[name] = all[name];
  return { url: request.url(), headers, body: request.postData() ?? '' };
}

/**
 * Sends a recorded server action again from `page`'s browser context (its cookies,
 * i.e. its session). Returns the HTTP status and the raw RSC response text, which
 * contains the action's return value, e.g. {"ok":false,"code":"FORBIDDEN",...}.
 */
export async function replayServerAction(
  page: Page,
  action: RecordedAction,
  { body = action.body, baseURL }: { body?: string; baseURL?: string } = {},
) {
  const url = new URL(action.url);
  if (baseURL) {
    const target = new URL(baseURL);
    url.protocol = target.protocol;
    url.host = target.host;
  }
  const response = await page.request.post(url.toString(), {
    headers: { ...action.headers, origin: url.origin },
    data: body,
    maxRedirects: 0,
  });
  return { status: response.status(), text: await response.text() };
}
