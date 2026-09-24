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

/** The "Try the demo" button and the demo reset endpoint. Anything but "false" keeps them on. */
export function demoEnabled(): boolean {
  return process.env.DEMO_ENABLED?.trim().toLowerCase() !== 'false';
}

/**
 * Seeded accounts. The passwords are public on purpose (README, login page) - this is
 * a demo. For a real deployment set SEED_ADMIN_PASSWORD / SEED_STAFF_PASSWORD before
 * the first seed, or change them in Settings afterwards.
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
