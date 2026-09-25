import {
  ACCOUNTS,
  OPEN_BASE_URL,
  expect,
  recordServerAction,
  replayServerAction,
  test,
  trackConsoleErrors,
} from './fixtures';

/*
 * The "closed" project: the same production build started with
 * ALLOW_REGISTRATION=false and DEMO_ENABLED=false (playwright.config.ts). Both switches
 * must hold on the server, not only in the page: the register and "Try the demo"
 * actions are recorded on the open server and replayed against this one.
 */

test('with ALLOW_REGISTRATION=false the register page is closed', async ({ page }) => {
  await page.goto('/register');
  await expect(page.getByRole('heading', { name: 'Registration is closed' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create account' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Go to sign in' }).click();
  await page.waitForURL('**/login');
});

test('with DEMO_ENABLED=false there is no "Try the demo" button', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByTestId('demo-login')).toHaveCount(0);
  // Nor a "this is a fictional demo" note beside the form.
  await expect(page.getByText('Portfolio demo with sample data')).toHaveCount(0);
});

test('with DEMO_ENABLED=false the published demo credentials do not sign in', async ({ page }) => {
  // The database is the same seeded one the open server uses, demo account included:
  // the switch alone must close it, through the ordinary form...
  await page.goto('/login');
  await page.getByLabel('Email').fill(ACCOUNTS.demo.email);
  await page.getByLabel('Password', { exact: true }).fill(ACCOUNTS.demo.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Invalid email or password.' }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/login/);

  // ...and through a direct POST to the Auth.js credentials endpoint.
  const csrf = await (await page.request.get('/api/auth/csrf')).json();
  const direct = await page.request.post('/api/auth/callback/credentials', {
    form: {
      csrfToken: csrf.csrfToken,
      email: ACCOUNTS.demo.email,
      password: ACCOUNTS.demo.password,
      callbackUrl: '/dashboard',
    },
    maxRedirects: 0,
  });
  expect(direct.headers()['location'] ?? '').toContain('error=CredentialsSignin');
  const session = await (await page.request.get('/api/auth/session')).json();
  expect(session?.user ?? null).toBeNull();
});

test('with DEMO_ENABLED=false a demo session opened elsewhere stops working', async ({
  browser,
}) => {
  // A token signed with the same secret, for the DEMO account (from the open server).
  const context = await browser.newContext({ baseURL: OPEN_BASE_URL });
  const open = await context.newPage();
  await open.goto('/login');
  await open.getByTestId('demo-login').click();
  await open.waitForURL('**/dashboard');
  const cookies = await context.cookies();
  await context.close();

  const closedBaseURL = test.info().project.use.baseURL!;
  const closed = await browser.newContext({ baseURL: closedBaseURL });
  await closed.addCookies(cookies);
  const page = await closed.newPage();
  await page.goto('/dashboard');
  await page.waitForURL('**/login**');
  const api = await page.request.get('/api/search?q=usb');
  expect(api.status()).toBe(401);
  await closed.close();
});

test('the register and demo actions are refused when called directly', async ({ browser }) => {
  // Record both actions on the open server in a separate context.
  const openContext = await browser.newContext({ baseURL: OPEN_BASE_URL });
  const open = await openContext.newPage();
  const openErrors = trackConsoleErrors(open);

  await open.goto('/register');
  const register = await recordServerAction(open, async () => {
    // An existing email: the open server refuses it, so the recording creates nothing.
    await open.getByLabel('Full name').fill('Direct Caller');
    await open.getByLabel('Work email').fill('admin@stockflow.test');
    await open.getByLabel('Password', { exact: true }).fill('Welcome2026');
    await open.getByLabel('Confirm password').fill('Welcome2026');
    await open.getByRole('button', { name: 'Create account' }).click();
  });
  await expect(open.getByText(/already exists/).first()).toBeVisible();

  await open.goto('/login');
  const demo = await recordServerAction(open, () => open.getByTestId('demo-login').click());
  await open.waitForURL('**/dashboard');
  expect(openErrors, 'open-server console errors').toEqual([]);
  await openContext.close();

  // Replay against the closed server from a context without any session.
  const closedBaseURL = test.info().project.use.baseURL!;
  const guestContext = await browser.newContext({ baseURL: closedBaseURL });
  const guest = await guestContext.newPage();

  const email = `direct.${Date.now()}@example.test`;
  const body = register.body.replace('admin@stockflow.test', email);
  const refused = await replayServerAction(guest, register, { body, baseURL: closedBaseURL });
  expect(refused.text).toContain('"code":"FORBIDDEN"');
  expect(refused.text).toContain('Registration is disabled on this deployment.');

  const demoRefused = await replayServerAction(guest, demo, { baseURL: closedBaseURL });
  expect(demoRefused.text).toContain('"code":"FORBIDDEN"');
  expect(demoRefused.text).toContain('The demo account is disabled on this deployment.');
  await guestContext.close();

  // No account was created: signing in with it fails.
  const login = await browser.newContext({ baseURL: closedBaseURL });
  const page = await login.newPage();
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('Welcome2026');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Invalid email or password.' }),
  ).toBeVisible();
  await login.close();
});
