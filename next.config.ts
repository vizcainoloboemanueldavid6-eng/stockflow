import type { NextConfig } from 'next';

const provider =
  (process.env.DATABASE_PROVIDER ?? '').trim().toLowerCase() === 'sqlite' ? 'sqlite' : 'postgresql';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The dev-only "N" badge defaults to bottom-left, on top of the sidebar's collapse button.
  devIndicators: { position: 'bottom-right' },

  // Inlined at build time: the database mode the app runs in is always the one the
  // Prisma Client was generated for (scripts/build.mjs), whatever the runtime env says.
  env: { DATABASE_PROVIDER: provider },

  // SQLite demo mode: ship the seeded database file inside every server function.
  // src/lib/prisma-client.ts copies it to os.tmpdir() on first use.
  ...(provider === 'sqlite'
    ? {
        outputFileTracingIncludes: {
          '/': ['./prisma/sqlite/stockflow.db'],
          '/**/*': ['./prisma/sqlite/stockflow.db'],
        },
      }
    : {}),

  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
