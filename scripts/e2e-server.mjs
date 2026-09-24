#!/usr/bin/env node
// App server for `npm run test:e2e` (webServer entries in playwright.config.ts):
// a production build (`npm run build`), then `next start -p $PORT`.
//
//   E2E_SKIP_BUILD=1   reuse the existing .next build (the second server, and quick re-runs)
//
// Plain Node (no shell syntax), so it behaves the same on Windows, macOS and Linux.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { ROOT } from './lib/common.mjs';

const port = String(process.env.PORT ?? 3100);

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: ROOT, stdio: 'inherit', env: process.env });
    const forward = (signal) => child.kill(signal);
    process.on('SIGINT', forward);
    process.on('SIGTERM', forward);
    child.on('error', reject);
    child.on('exit', (code) => {
      process.off('SIGINT', forward);
      process.off('SIGTERM', forward);
      resolve(code ?? 1);
    });
  });
}

if (process.env.E2E_SKIP_BUILD !== '1') {
  console.error(`[e2e-server] production build (${process.env.DATABASE_PROVIDER ?? '.env'}) ...`);
  const code = await run([path.join(ROOT, 'scripts', 'build.mjs')]);
  if (code !== 0) process.exit(code);
}

console.error(`[e2e-server] next start -p ${port}`);
const nextCli = path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next');
process.exit(await run([nextCli, 'start', '-p', port]));
