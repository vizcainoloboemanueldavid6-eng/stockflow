import { ACCOUNTS, expect, signIn, test } from './fixtures';

test.describe('authentication', () => {
  test('guests are sent to /login and returned to the page they asked for', async ({ page }) => {
    await page.goto('/movements');
    await expect(page).toHaveURL(/\/login\?callbackUrl=/);
    await page.getByLabel('Email').fill(ACCOUNTS.admin.email);
    await page.getByLabel('Password', { exact: true }).fill(ACCOUNTS.admin.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL('**/movements');
    await expect(page.getByRole('heading', { level: 1, name: 'Movements' })).toBeVisible();
  });

  for (const key of ['admin', 'staff'] as const) {
    test(`${key} can sign in and out`, async ({ page }) => {
      await signIn(page, key);
      await page.getByTestId('user-menu').click();
      await expect(page.getByRole('menu')).toContainText(ACCOUNTS[key].name);
      await expect(page.getByRole('menu')).toContainText(ACCOUNTS[key].role);
      await page.getByTestId('sign-out').click();
      await page.waitForURL('**/login');
      await page.goto('/dashboard');
      await expect(page).toHaveURL(/\/login/);
    });
  }

  test('"Try the demo" signs in as the demo user', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('demo-login').click();
    await page.waitForURL('**/dashboard');
    await page.getByTestId('user-menu').click();
    await expect(page.getByRole('menu')).toContainText(ACCOUNTS.demo.name);
  });

  test('a wrong password shows a clear error', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(ACCOUNTS.staff.email);
    await page.getByLabel('Password', { exact: true }).fill('not-the-password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Invalid email or password.' }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('repeated failures for one email are rate limited', async ({ page }) => {
    const email = `nobody.${Date.now()}@example.test`;
    await page.goto('/login');
    for (let attempt = 1; attempt <= 6; attempt++) {
      await page.getByLabel('Email').fill(email);
      await page.getByLabel('Password', { exact: true }).fill(`wrong-${attempt}`);
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      const expected = attempt <= 5 ? 'Invalid email or password.' : 'Too many failed attempts';
      await expect(page.getByRole('alert').filter({ hasText: expected })).toBeVisible();
    }
  });

  test('signed-in users skip the login page', async ({ page }) => {
    await signIn(page, 'admin');
    await page.goto('/login');
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('registration creates a Staff account', async ({ page }) => {
    const email = `new.staff.${Date.now()}@example.test`;
    await page.goto('/register');
    await page.getByLabel('Full name').fill('New Staff Member');
    await page.getByLabel('Work email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill('Welcome2026');
    await page.getByLabel('Confirm password').fill('Welcome2026');
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.waitForURL('**/dashboard');
    await page.getByTestId('user-menu').click();
    await expect(page.getByRole('menu')).toContainText('Staff');
  });
});

test.describe('API protection', () => {
  test('product search needs a session', async ({ request }) => {
    const response = await request.get('/api/search?q=usb');
    expect(response.status()).toBe(401);
  });

  test('the demo reset endpoint needs the cron secret', async ({ request }) => {
    const response = await request.get('/api/cron/reset-demo', {
      headers: { authorization: 'Bearer wrong-secret' },
    });
    expect([401, 503]).toContain(response.status());
  });
});
