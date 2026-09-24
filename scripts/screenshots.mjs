#!/usr/bin/env node
/**
 * README screenshots: dashboard, products and movements at 1440 px and 390 px, in the
 * light and dark themes, signed in as the seeded admin. Written to docs/*.jpg.
 *
 *   npm run db:reset-demo && npm run build && npm run shots
 *
 * Starts `next start` on :3102 with the current build (or uses SHOTS_BASE_URL if set)
 * and fails if a page logs a console error or the app answers an HTTP error.
 * Each capture is the whole page: the viewport is grown to the page's height first,
 * so the full-height sidebar and the sticky header render as they do on screen.
 */
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { ROOT, loadEnv } from './lib/common.mjs';

loadEnv();

const PORT = Number(process.env.SHOTS_PORT ?? 3102);
const BASE_URL = process.env.SHOTS_BASE_URL ?? `http://localhost:${PORT}`;
const DOCS = path.join(ROOT, 'docs');
const ACCOUNT = { email: 'admin@stockflow.test', password: 'Admin#2026' };

const PAGES = [
  { slug: 'dashboard', url: '/dashboard' },
  { slug: 'products', url: '/products' },
  { slug: 'movements', url: '/movements' },
];
const VIEWPORTS = [
  { label: '1440', width: 1440, height: 900 },
  { label: '390', width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
];
const THEMES = ['light', 'dark'];

async function waitForServer(url, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`The app did not answer at ${url}`);
}

function startServer() {
  const nextCli = path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next');
  const child = spawn(process.execPath, [nextCli, 'start', '-p', String(PORT)], {
    cwd: ROOT,
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  return child;
}

async function signIn(browser) {
  const context = await browser.newContext({ baseURL: BASE_URL });
  const page = await context.newPage();
  await page.goto('/login');
  await page.getByLabel('Email').fill(ACCOUNT.email);
  await page.getByLabel('Password', { exact: true }).fill(ACCOUNT.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('**/dashboard');
  const state = await context.storageState();
  await context.close();
  return state;
}

async function main() {
  await mkdir(DOCS, { recursive: true });
  const server = process.env.SHOTS_BASE_URL ? null : startServer();
  const problems = [];
  let browser;

  try {
    await waitForServer(`${BASE_URL}/login`);
    browser = await chromium.launch();
    const storageState = await signIn(browser);

    for (const viewport of VIEWPORTS) {
      for (const theme of THEMES) {
        const { label, ...device } = viewport;
        const context = await browser.newContext({
          ...device,
          viewport: { width: viewport.width, height: viewport.height },
          baseURL: BASE_URL,
          storageState,
          colorScheme: theme,
          deviceScaleFactor: viewport.deviceScaleFactor ?? 1,
        });
        await context.addInitScript((value) => {
          try {
            localStorage.setItem('stockflow-theme', value);
          } catch {
            // storage unavailable: the colour scheme above still applies
          }
        }, theme);
        const page = await context.newPage();
        page.on('console', (message) => {
          if (message.type() === 'error') problems.push(`${page.url()}: ${message.text()}`);
        });
        page.on('pageerror', (error) => problems.push(`${page.url()}: ${error.message}`));
        page.on('response', (response) => {
          if (response.status() >= 400 && response.url().startsWith(BASE_URL)) {
            problems.push(`HTTP ${response.status()}: ${response.url()}`);
          }
        });

        for (const target of PAGES) {
          await page.setViewportSize({ width: viewport.width, height: viewport.height });
          await page.goto(target.url, { waitUntil: 'networkidle' });
          await page.locator('main h1').first().waitFor();
          await page.locator('table tbody tr').first().waitFor();
          const height = await page.evaluate(() => document.documentElement.scrollHeight);
          await page.setViewportSize({
            width: viewport.width,
            height: Math.min(Math.max(height, viewport.height), 4000),
          });
          await page.waitForTimeout(1200); // charts resize and finish their animation
          const file = path.join(DOCS, `${target.slug}-${label}-${theme}.jpg`);
          await page.screenshot({ path: file, type: 'jpeg', quality: 82 });
          console.log(`  ${path.relative(ROOT, file)}`);
        }
        await context.close();
      }
    }
  } finally {
    await browser?.close();
    server?.kill();
  }

  if (problems.length) {
    console.error(`\n${problems.length} problem(s) while capturing:\n${problems.join('\n')}`);
    process.exit(1);
  }
  console.log('\nScreenshots written to docs/.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
