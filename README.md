# StockFlow

A full-stack inventory app for a small business: products, stock movements, suppliers,
categories, reports and users, with role-based access and a one-click demo account. Built with
Next.js 15 (App Router, Server Actions), Prisma, PostgreSQL, Auth.js v5, Tailwind CSS and
shadcn/ui.

> **Demo project.** StockFlow is a portfolio piece. The shop, its 60 products, 5 suppliers and
> 400 stock movements are generated sample data: generic product names, no real brands, supplier
> emails on the reserved `.example` domain and phone numbers in the fictional 555-01xx range.

---

## Screenshots

![Dashboard, light theme, 1440 px](docs/dashboard-1440-light.jpg)

![Dashboard, dark theme, 1440 px](docs/dashboard-1440-dark.jpg)

|           | Desktop (1440 px)                                                             | Phone (390 px)                                                              |
| --------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Dashboard | [light](docs/dashboard-1440-light.jpg) · [dark](docs/dashboard-1440-dark.jpg) | [light](docs/dashboard-390-light.jpg) · [dark](docs/dashboard-390-dark.jpg) |
| Products  | [light](docs/products-1440-light.jpg) · [dark](docs/products-1440-dark.jpg)   | [light](docs/products-390-light.jpg) · [dark](docs/products-390-dark.jpg)   |
| Movements | [light](docs/movements-1440-light.jpg) · [dark](docs/movements-1440-dark.jpg) | [light](docs/movements-390-light.jpg) · [dark](docs/movements-390-dark.jpg) |

<p>
  <img src="docs/dashboard-390-light.jpg" alt="Dashboard on a phone, light theme" width="240">
  <img src="docs/dashboard-390-dark.jpg" alt="Dashboard on a phone, dark theme" width="240">
  <img src="docs/products-390-light.jpg" alt="Products on a phone" width="240">
</p>

Regenerate them with `npm run db:reset-demo && npm run build && npm run shots`.

---

## Features

**Pages**

- **Sign in / register / "Try the demo"**: email and password (bcrypt, JWT sessions), a
  one-click demo login, and self-service sign-up that creates Staff accounts
  (`ALLOW_REGISTRATION=false` closes it).
- **Dashboard**: inventory value, active products, low-stock count and today's movements; a
  30-day line chart of units in vs out; the top 5 best sellers; a low-stock alert table with a
  one-click **Restock** button.
- **Products**: server-side search, filters (category, supplier, stock status, active/archived),
  sorting and pagination, all kept in the URL; create/edit in a dialog with shared Zod
  validation; archive and restore; delete for products without history; a detail page with stock
  value, margin and the product's movement history.
- **Movements**: register stock in, stock out or an adjustment with a searchable product picker
  and a live preview of the resulting stock; a history filterable by date range, type and user.
- **Suppliers and categories**: full CRUD in dialogs, a colour picker for categories, and a clear
  explanation (with a link to the products) when a record is still in use.
- **Reports**: CSV exports of products and movements (UTF-8 with BOM, RFC 4180 quoting,
  spreadsheet-formula guard, dated filenames) and inventory valuation by category.
- **Settings**: profile, password, light/dark/system theme, and user management for admins.

**Throughout**

- Stock only changes through a movement, inside a database transaction, with a single conditional
  `UPDATE`, so it can never go negative, not even with two sales at the same moment (tested
  against real PostgreSQL). A `CHECK (quantity >= 0)` constraint backs it up.
- Every mutation is a server action that checks the user's role on the server (the UI only hides
  what a role cannot do) and writes an audit-log row in the same transaction.
- Collapsible sidebar that becomes a drawer on phones and tablets, Ctrl/Cmd+K command palette
  for pages and products, dark mode without a flash, loading skeletons, empty states with a call
  to action, and toasts for every success and error.
- Responsive down to 390 px with no sideways scrolling: tables drop columns by breakpoint.
- Rate-limited sign-in (5 failures per email and IP in 15 minutes) and registration.

---

## Architecture

```
 Browser ──────────────────────────────────────────────────────────────────────────────
   React 19 client components: forms (react-hook-form + Zod), TanStack tables,
   Recharts charts, command palette, toasts
        │ server actions (POST)       │ GET /api/search, /api/export/*
        ▼                             ▼
 Next.js 15 server (Vercel functions or `next start`) ─────────────────────────────────
   src/middleware.ts ........ edge gate: no session -> /login (APIs get 401)
   src/app/(app)/* .......... server-component pages -> src/lib/queries (plain JSON)
   src/lib/actions/* ........ createAction(): requirePermission(role re-read from DB)
                              -> Zod parse -> handler -> { ok, data } | { ok:false, code }
   src/lib/stock.ts ......... applyStockMovement(): the only code that changes quantity
   src/lib/auth.ts .......... Auth.js v5 credentials, bcrypt, JWT, rate limiter
        │ Prisma Client (generated for DATABASE_PROVIDER)
        ▼
 Database ─────────────────────────────────────────────────────────────────────────────
   PostgreSQL 16 (Neon, Docker, embedded) ... default
   SQLite file ............................... quick local mode / zero-config demo
   User · Category · Supplier · Product · StockMovement · AuditLog
```

Folder layout, conventions and every decision the spec left open are in
[DECISIONS.md](DECISIONS.md).

---

## Roles

| Capability                                    | Admin | Staff |    Demo    |
| --------------------------------------------- | :---: | :---: | :--------: |
| View dashboard, products, movements, reports  |  yes  |  yes  |    yes     |
| Export CSV                                    |  yes  |  yes  |    yes     |
| Create and edit products, register movements  |  yes  |  yes  |    yes     |
| Archive or delete products                    |  yes  |  no   |    yes     |
| Create, edit, delete categories and suppliers |  yes  |  no   |    yes     |
| Manage users (create, change role)            |  yes  |  no   | staff only |
| Delete users, set other users' passwords      |  yes  |  no   |     no     |
| Change own password                           |  yes  |  yes  |     no     |

Every "no" is enforced by the server action or route handler, and covered by tests that call
the actions directly (see [Tests](#tests)). The Demo account is reset to the seed data every day.

## Demo credentials

| Role  | Email                  | Password     |
| ----- | ---------------------- | ------------ |
| Admin | `admin@stockflow.test` | `Admin#2026` |
| Staff | `staff@stockflow.test` | `Staff#2026` |
| Demo  | `demo@stockflow.test`  | `Demo#2026`  |

These are public on purpose. For a real deployment set `SEED_ADMIN_PASSWORD` and
`SEED_STAFF_PASSWORD` (and `DEMO_ENABLED=false`) before the first seed.

---

## Running it locally

**Requirements:** Node.js 20.19 or newer (22 or 24 recommended) and npm. Pick one database
option below.

```bash
git clone <your-fork-url> stockflow
cd stockflow
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env
npm ci
```

Generate a real `AUTH_SECRET` for anything beyond a quick look: `npx auth secret` (or
`openssl rand -base64 33`) and paste it into `.env`.

### A. PostgreSQL in Docker

```bash
docker compose up -d
# in .env:
#   DATABASE_URL="postgresql://stockflow:stockflow@localhost:5432/stockflow"
npm run db:deploy          # apply the migrations
npm run db:seed            # sample data + the three accounts above
npm run dev                # http://localhost:3000
```

### B. PostgreSQL without Docker (embedded)

`npm run db:local` downloads nothing extra: it runs the PostgreSQL 16 binaries from the
`embedded-postgres` dev dependency on port 54329, with its data in `.pg/` (git-ignored).
The default `DATABASE_URL` in `.env.example` already points at it.

```bash
npm run db:local           # terminal 1 - keep it running (Ctrl+C stops it)
npm run db:deploy          # terminal 2
npm run db:seed
npm run dev
```

`npm run db:local:stop` stops a server started from another terminal.

### C. SQLite quick mode (no database server at all)

```bash
# in .env:
#   DATABASE_PROVIDER="sqlite"
npm run db:sqlite          # generates the SQLite client, creates and seeds prisma/sqlite/stockflow.db
npm run dev
```

The app works on a copy of that file in your temp folder; `npm run db:sqlite` rebuilds it from
scratch. To go back to PostgreSQL, set `DATABASE_PROVIDER="postgresql"` and run
`npm run db:generate`: the Prisma Client is generated for one provider at a time.

### Production build locally

```bash
npm run build && npm start   # http://localhost:3000
```

---

## Scripts

| Script                               | What it does                                                                                                                                           |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run dev`                        | Next.js dev server                                                                                                                                     |
| `npm run build`                      | Prisma Client for `DATABASE_PROVIDER` + `next build` (SQLite: also builds and seeds the DB file; on Vercel: also migrates and seeds an empty database) |
| `npm start`                          | Serve the production build                                                                                                                             |
| `npm run lint` / `lint:fix`          | ESLint                                                                                                                                                 |
| `npm run format` / `format:check`    | Prettier                                                                                                                                               |
| `npm run typecheck`                  | `tsc --noEmit`                                                                                                                                         |
| `npm test`                           | Unit tests (Vitest)                                                                                                                                    |
| `npm run test:integration`           | Integration tests against the database in `.env` (**re-seeds it**)                                                                                     |
| `npm run test:e2e`                   | Playwright end-to-end tests (builds and starts everything itself, see below)                                                                           |
| `npm run db:local` / `db:local:stop` | Start / stop the embedded PostgreSQL 16 on :54329                                                                                                      |
| `npm run db:deploy`                  | `prisma migrate deploy`                                                                                                                                |
| `npm run db:migrate`                 | `prisma migrate dev` (create a new migration while developing)                                                                                         |
| `npm run db:generate`                | Generate the Prisma Client for `DATABASE_PROVIDER`                                                                                                     |
| `npm run db:push`                    | Sync the schema without a migration (prototyping)                                                                                                      |
| `npm run db:seed`                    | Replace the business data with the sample set and (re)create the three accounts; keeps other users                                                     |
| `npm run db:reset-demo`              | Same, and removes every other account: the demo returns to a known state                                                                               |
| `npm run db:sqlite`                  | Build and seed the SQLite database file                                                                                                                |
| `npm run shots`                      | Capture the README screenshots into `docs/`                                                                                                            |

All scripts are plain Node (no shell syntax), so they behave the same on Windows, macOS and
Linux. `postinstall` generates the Prisma Client for the configured provider.

---

## Tests

```bash
npm test                   # unit: stock rules and concurrency, CSV, permissions, actions, validation...
npm run test:integration   # real database: seed, concurrent stock-outs, direct action calls
npm run test:e2e           # browser: every page and flow, as admin, staff and demo
```

- **Unit** (`tests/unit`, Vitest): stock can never go negative, including concurrent stock-outs;
  CSV escaping and the export route handlers; the permission matrix; every restricted server
  action called directly with a mocked Staff/Demo session returns `FORBIDDEN` without touching the
  database; validation schemas; dates, metrics and URL parsing; the seed generator.
- **Integration** (`tests/integration`): against the database in `.env`. Two overlapping
  stock-outs on PostgreSQL (the second provably waits for the first one's row lock, then is
  refused); the real delete actions called with a mocked Staff session change nothing, and a
  session that _claims_ Admin for the Staff account is still refused.
- **End to end** (`tests/e2e`, Playwright): `npm run test:e2e` starts a freshly migrated and
  seeded `stockflow_e2e` database on the embedded PostgreSQL (started if needed; your development
  data is not touched), runs `npm run build`, starts `next start` on :3100 and a second server with
  registration and the demo disabled on :3101, then runs the suites: sign-in/out, demo,
  registration (open and closed), dashboard charts, products, movements (including the
  negative-stock error), suppliers, categories, CSV downloads checked row by row against the tables,
  theme, Ctrl+K, settings, 390 px layouts, zero console errors on every page for every role in both
  themes, and **direct server-action calls**: the request an admin's browser sends to delete a
  product or a category is replayed with the Staff session cookie and must be refused (with the
  admin replay as the positive control); the same for Demo changing its password and for
  registration or the demo login on the closed server.

E2E options: `E2E_SKIP_BUILD=1` reuses the current build; `E2E_BASE_URL=http://localhost:3000`
runs against a server you started (then the "closed" project needs `E2E_CLOSED_BASE_URL`);
`E2E_DATABASE_URL` uses another PostgreSQL database (for example the Docker one). Browsers:
`npx playwright install chromium` once on a new machine.

---

## Deploying to Vercel

Step-by-step commands (in Spanish, including the Neon CLI and the Vercel Marketplace
integration) are in [docs/DEPLOY.es.md](docs/DEPLOY.es.md).

### Option 1: Vercel + Neon PostgreSQL (persistent data)

1. Create a free Neon project (or add Neon from the Vercel Marketplace, which fills in the
   database variables for you).
2. Import the repository in Vercel. `vercel.json` already sets the build command and the cron.
3. Set the environment variables below and deploy. On Vercel `npm run build` runs
   `prisma migrate deploy` and seeds the database **only if it has no users**, so the first
   deployment comes up with demo data and later deployments never overwrite anything.

| Variable                                                    | Required     | Value                                                                                  |
| ----------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                              | yes          | Neon **pooled** connection string (host contains `-pooler`), with `?sslmode=require`   |
| `DATABASE_URL_UNPOOLED`                                     | recommended  | Neon **direct** connection string; used by the build for migrations and the first seed |
| `AUTH_SECRET`                                               | yes          | `npx auth secret` or `openssl rand -base64 33`                                         |
| `CRON_SECRET`                                               | for the demo | `openssl rand -hex 32`; protects the daily demo reset                                  |
| `APP_TIME_ZONE`                                             | recommended  | e.g. `America/Bogota`; Vercel runs in UTC, this decides what "today" means             |
| `DATABASE_PROVIDER`                                         | no           | `postgresql` (the default)                                                             |
| `ALLOW_REGISTRATION`                                        | no           | `false` closes self-service sign-up                                                    |
| `DEMO_ENABLED`                                              | no           | `false` for a real business: hides "Try the demo" and disables the reset               |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` / `SEED_STAFF_*` | no           | Seeded accounts for a real deployment (set before the first deploy)                    |

`AUTH_TRUST_HOST` and `AUTH_URL` are not needed on Vercel.

### Option 2: zero-config demo with SQLite (no database service)

For a public demo link before any database exists:

| Variable            | Required | Value    |
| ------------------- | -------- | -------- |
| `DATABASE_PROVIDER` | yes      | `sqlite` |
| `AUTH_SECRET`       | yes      | as above |
| `CRON_SECRET`       | no       | as above |
| `APP_TIME_ZONE`     | no       | as above |

The build creates and seeds a SQLite file and ships it inside every server function; each
function instance copies it to `/tmp` on first use. It is a demo, not a database: data resets on
every cold start, and two visitors on different instances can see different data. A small banner
says so. Switch to Option 1 (set `DATABASE_URL`, remove `DATABASE_PROVIDER`, redeploy) for real
use.

### The demo-reset cron

`vercel.json` calls `GET /api/cron/reset-demo` every day at 04:00 UTC (one daily cron is what the
Hobby plan allows). Vercel sends `Authorization: Bearer $CRON_SECRET`; the endpoint answers 503
when `CRON_SECRET` is not set and does nothing when `DEMO_ENABLED=false`. When it runs, it restores
the seed data and removes every account except the three seeded ones, like
`npm run db:reset-demo`. To trigger it by hand:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<your-app>.vercel.app/api/cron/reset-demo
```

---

## Security notes

- Middleware protects every private page and API route; each server action and route handler
  checks the role again on the server, re-reading the user from the database, so a role change or
  a deleted account takes effect on the next request.
- Zod validates every input on the server with the same schemas the forms use.
- Passwords are hashed with bcrypt (cost 10); sessions are signed JWTs (12 hours).
- Sign-in is rate limited per email and IP, registration per IP. The limiter is in memory, which
  on serverless is per instance: it slows brute force down but is not a hard guarantee (see
  DECISIONS.md for the upgrade path).
- Security headers (`X-Frame-Options: DENY`, `nosniff`, referrer and permissions policies).
- Secrets live in `.env` (git-ignored); `.env.example` documents every variable.
- `npm audit --omit=dev` findings and their status are recorded in DECISIONS.md.

---

## Tech stack

Next.js 15.5 · React 19 · TypeScript 5.9 · Prisma 6 · PostgreSQL 16 / SQLite · Auth.js v5
(next-auth beta) · Tailwind CSS 3.4 · shadcn/ui (Radix) · TanStack Table 8 · Recharts 3 ·
react-hook-form 7 · Zod 4 · Sonner · lucide-react · Vitest 4 · Playwright 1.57 · ESLint 9 ·
Prettier 3. Every dependency is pinned to an exact version.
