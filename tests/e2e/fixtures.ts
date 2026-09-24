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

/**
 * `test` with a console guard: any console error or uncaught page error during a
 * test fails it (spec: "no errors in the console"). Expected 401 responses from
 * deliberately unauthenticated API calls are made with `request`, not the page.
 */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      page.on('pageerror', (error) => errors.push(error.message));
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
