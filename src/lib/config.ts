/**
 * Runtime switches read from the environment (documented in .env.example).
 * Functions rather than constants so tests can change process.env between cases.
 */

/**
 * Zero-external-service demo mode (DATABASE_PROVIDER=sqlite). next.config.ts inlines
 * the build-time value, so this always matches the generated Prisma Client.
 */
export function isSqliteMode(): boolean {
  return (process.env.DATABASE_PROVIDER ?? '').trim().toLowerCase() === 'sqlite';
}

/** Self-service sign-up at /register. Anything but "false" keeps it on. */
export function registrationEnabled(): boolean {
  return process.env.ALLOW_REGISTRATION?.trim().toLowerCase() !== 'false';
}

/**
 * Public-demo mode. Anything but "false" keeps it on. When on: the "Try the demo"
 * button, the demo reset endpoint, and the three seeded accounts with their published
 * passwords, which are locked (see sharedDemoAccount()). DEMO_ENABLED=false means a real
 * deployment: no demo account at all - the seed does not create it and a DEMO-role
 * user can neither sign in nor keep using an existing session.
 */
export function demoEnabled(): boolean {
  return process.env.DEMO_ENABLED?.trim().toLowerCase() !== 'false';
}

/**
 * True for the three seeded accounts while the public demo is on. Their credentials
 * are published (README, login page), so nobody may delete them, change their role,
 * email or password: one visitor could otherwise lock the published logins, or break
 * "Try the demo", for everyone until the next reset.
 */
export function sharedDemoAccount(email: string | null | undefined): boolean {
  if (!email || !demoEnabled()) return false;
  const normalized = email.trim().toLowerCase();
  return Object.values(seedAccounts()).some((account) => account.email === normalized);
}

/**
 * Seeded accounts. The passwords are public on purpose (README, login page) - this is
 * a demo. For a real deployment (DEMO_ENABLED=false) the seed refuses to run until
 * SEED_ADMIN_PASSWORD and SEED_STAFF_PASSWORD are set, and skips the demo account.
 */
export function seedAccounts() {
  return {
    admin: {
      name: 'Admin User',
      email: (process.env.SEED_ADMIN_EMAIL || 'admin@stockflow.test').toLowerCase(),
      password: process.env.SEED_ADMIN_PASSWORD || 'Admin#2026',
      role: 'ADMIN' as const,
    },
    staff: {
      name: 'Staff User',
      email: (process.env.SEED_STAFF_EMAIL || 'staff@stockflow.test').toLowerCase(),
      password: process.env.SEED_STAFF_PASSWORD || 'Staff#2026',
      role: 'STAFF' as const,
    },
    demo: {
      name: 'Demo User',
      email: (process.env.DEMO_EMAIL || 'demo@stockflow.test').toLowerCase(),
      password: process.env.DEMO_PASSWORD || 'Demo#2026',
      role: 'DEMO' as const,
    },
  };
}
