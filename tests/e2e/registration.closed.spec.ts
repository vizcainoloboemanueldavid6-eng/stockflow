import {
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
