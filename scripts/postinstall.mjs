#!/usr/bin/env node
// `npm install` / `npm ci` hook: generates the Prisma Client for DATABASE_PROVIDER, so a
// fresh clone (or Vercel's install step, which may restore a cached node_modules) never
// runs with a client generated for the other provider or an older schema.
// Plain Node, no shell syntax: the same on Windows, macOS, Linux and Vercel.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT, generateClient, getProvider, loadEnv } from './lib/common.mjs';

if (!existsSync(path.join(ROOT, 'node_modules', 'prisma', 'build', 'index.js'))) {
  // `npm ci --omit=dev`: the Prisma CLI is a dev dependency. `npm run build` needs it anyway.
  console.log('[postinstall] Prisma CLI not installed - skipping Prisma Client generation.');
  process.exit(0);
}

loadEnv();
try {
  generateClient(getProvider());
} catch (error) {
  console.error(`[postinstall] ${error.message}`);
  process.exit(1);
}
