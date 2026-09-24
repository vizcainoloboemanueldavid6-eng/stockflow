# Decisions

Choices the specification left open, and why each one went the way it did. The last section,
**Architecture**, is the map for anyone adding features: read it before writing code.

---

## Stack and versions

Every dependency is pinned to an exact version (`.npmrc` has `save-exact=true`).

### Next.js 15.5 and React 19 rather than Next.js 14

The spec says "Next.js 14+". 15.5 is the line the owner's other projects use and pairs with
React 19; nothing depends on a 15-only API except `unstable_rethrow` and async `searchParams`.

### Auth.js v5 is a `beta` tag

`next-auth@5` is only published under the `beta` dist-tag (`5.0.0-beta.32` here); `latest` is
still v4. v5 is the version the spec names and the one with the App Router / middleware API.

### Prisma 6, not 7 or 8

Prisma 6.19.3 keeps the classic `url = env("DATABASE_URL")` datasource and a Rust engine that
works the same on Windows and on Vercel's Linux, which makes the PostgreSQL/SQLite switch a
simple provider swap. SQLite enums have been supported since 6.2, so one schema serves both.
The schema generates the `rhel-openssl-3.0.x` engine as well, which is the one Vercel runs.

### TypeScript 5.9, Vitest 4.1, Zod 4, Tailwind 3.4

- TypeScript 7 is the native-compiler rewrite; Next 15's type-check step targets 5.x.
- Vitest 4.1 (latest of the 4 line) rather than 5.0, which was days old. It needs `vite` as a
  peer, so `vite` is pinned too.
- Zod 4 is current and `@hookform/resolvers` 5 supports it.
- Tailwind 3.4 with the classic shadcn/ui token setup (HSL variables + `tailwindcss-animate`),
  like the owner's other projects. Tailwind 4 would change the config model for no gain here.
- ESLint 9 + `FlatCompat`, because `eslint-config-next@15` targets ESLint 9. npm prints a
  deprecation notice for 9.39.x (ESLint 10 exists); it is harmless.
- `@playwright/test` is pinned to **1.57.0**: its Chromium build is the one cached on the
  development machine, whose browser CDN is blocked. Do not run `playwright install` there.

### shadcn/ui components written by hand

The components in `src/components/ui` follow shadcn/ui's current source (React 19 function
components with `data-slot`, no `forwardRef`), adapted to Tailwind 3 class names. Writing them
by hand avoids the CLI's interactive prompts and keeps the versions of every Radix package
explicit. Included: button, input, label, textarea, card, badge, dialog, sheet, alert-dialog,
dropdown-menu, select, tabs, table, sonner (toasts), skeleton, separator, tooltip, popover,
command, form, alert.

### Toasts use Sonner

shadcn/ui deprecated its Radix `toast` component in favour of Sonner, so "Toast" from the spec is
`src/components/ui/sonner.tsx`. Trigger with `import { toast } from 'sonner'`.

### Own theme provider instead of `next-themes`

About 60 lines (`src/components/theme/theme-provider.tsx`): an inline script in `<head>` sets
the `dark` class before first paint (no flash), the provider mirrors it for React and follows the
OS in "system" mode. Class-based dark mode, stored in `localStorage` under `stockflow-theme`.
Icons that differ per theme are switched with `dark:` classes, not React state, so the server
HTML is already right.

---

## Data model

- **Money is `Decimal(10,2)`** (`unitCost`, `salePrice`). Floats would drift on sums. Prisma
  returns `Decimal` objects, which cannot cross into client components: convert with
  `toNumber()` from `src/lib/db.ts` in the query that feeds a page.
- **`supplierId` is optional** (a product can have no supplier; deleting a supplier sets it to
  null). **`categoryId` is required** and a category with products cannot be deleted (Restrict).
- **`StockMovement.productId` is Restrict**: a product with history is archived, never deleted.
- **`StockMovement.userId` and `AuditLog.userId` are optional with `SetNull`**, so deleting a
  user keeps the history ("deleted user") instead of blocking the deletion or erasing records.
- **`AuditLog` keeps exactly the spec's fields.** `action` is `"<entity>.<verb>"`
  (`product.create`, `stock.out`, `user.register`, `system.demo-reset`).
- **Indexes** on every foreign key, `Product(archived, name)` for the list, `Product(quantity)`,
  `StockMovement(productId, createdAt)`, `(createdAt)` and `(type, createdAt)` for history and
  charts, `AuditLog(entity, entityId)` and `(createdAt)`.
- **A PostgreSQL `CHECK (quantity >= 0)`** is added by its own migration
  (`20260924131500_product_quantity_check`) as defence in depth. Prisma does not model CHECK
  constraints, so SQLite mode relies on the application rule alone.
- **"Low stock" means `quantity <= reorderLevel`** (out of stock included);
  `stockStatus()` in `src/lib/constants.ts` is the single definition, `lowStockWhere()` in
  `src/lib/db.ts` the query form (a column-to-column comparison).

## Stock movements

### One function moves stock

`applyStockMovement(tx, …)` in `src/lib/stock.ts` is the only code that changes
`Product.quantity`. It must run inside `prisma.$transaction`; it updates the quantity, writes the
`StockMovement` and the `AuditLog` row, so all three commit or roll back together.

### Concurrency: a conditional update, not read-then-write

A decrease is one statement:
`UPDATE Product SET quantity = quantity - n WHERE id = ? AND archived = false AND quantity >= n`.
The database checks the condition on the row it locks, so two simultaneous sales cannot both take
the last units: the loser matches zero rows and gets
`Not enough stock: X available, tried to remove Y.` (`InsufficientStockError`, status 409).
Verified against real PostgreSQL: 8 concurrent OUTs of 3 units on a stock of 10 → exactly 3
succeed, final quantity 1 (`npm run test:integration`).

### Adjustment semantics: signed delta

An `ADJUSTMENT` carries a **signed, non-zero delta** (`-2` = two units written off, `+1` = one
found), stored signed. IN and OUT carry positive quantities. Why:

- the ledger stays additive — `quantity = Σ IN − Σ OUT + Σ ADJUSTMENT` — which the tests and
  reports can rely on;
- a negative adjustment is protected by the same atomic conditional update as an OUT;
- an absolute "set to N" would have to read the current value and write it back, which races.

A stock-take UI can still ask for the counted figure: `adjustmentDeltaForCount(current, counted)`
turns it into the delta, and the server applies the delta atomically.

### Archived products cannot move stock

Archiving is the soft delete. A movement on an archived product fails with a clear message.

---

## Seed data

- `src/lib/seed/generate.ts` is a **pure, deterministic generator** (mulberry32 PRNG, fixed seed):
  60 products in 6 categories, 5 suppliers, **400 movements over the last 90 days** — 60 opening
  receipts, then ~262 sales, ~52 restocks and ~26 adjustments. It _simulates_ the history in
  order with the app's own rule (`nextQuantity()`), so no product is ever negative at any moment
  and every final quantity equals the sum of its movements (unit-tested, and re-checked in the
  database by the integration test).
- Reorder levels are **derived from each product's simulated demand** (~4 weeks of sales, rounded
  to values a person would type) instead of hand-picked numbers that contradict the history.
  Restocks go to the line that is lowest relative to its reorder level. Eight popular lines are
  not reordered in the last four weeks and sell faster there, so the dashboard always has
  alerts: across 120 simulated seed dates the result was 6–8 products at or below reorder level.
- Traffic grows over the quarter and peaks on Saturdays so the 30-day chart has shape; at least
  three movements are always "today". Dates are relative to the moment the seed runs (server local
  time).
- Product names are generic (no brands); supplier emails use the reserved `.example` domain and
  phones the fictional 555-01xx range; account emails use the reserved `.test` domain.
- **`npm run db:seed`** wipes business data (products, movements, categories, suppliers, audit
  log) and upserts the three seeded accounts, keeping any other users.
  **`npm run db:reset-demo`** does the same and also deletes every account that is not one of
  the three, so a public demo returns to a known state. Both are idempotent and run in one
  transaction. The seeded accounts' passwords are public on purpose; `SEED_ADMIN_PASSWORD` etc.
  override them for a real deployment.

| Role  | Email                  | Password     |
| ----- | ---------------------- | ------------ |
| Admin | `admin@stockflow.test` | `Admin#2026` |
| Staff | `staff@stockflow.test` | `Staff#2026` |
| Demo  | `demo@stockflow.test`  | `Demo#2026`  |

---

## Two database modes

### PostgreSQL (default)

Production target is Vercel + Neon. `npm run build` on Vercel (`VERCEL=1`) runs
`prisma migrate deploy` and then `seed --if-empty` before `next build`, so the first deployment
against an empty Neon database comes up with demo data and later deployments never reseed.
Locally, `npm run build` only generates the client.

### SQLite (`DATABASE_PROVIDER=sqlite`) — zero external services

For a public demo URL before Neon exists, and for quick local work.

1. `scripts/lib/common.mjs` derives `prisma/sqlite/schema.prisma` from the main schema (provider
   swap, `@db.*` attributes stripped), generates the client, creates `prisma/sqlite/stockflow.db`
   with `db push` and seeds it (`npm run db:sqlite`, or automatically in `npm run build`).
2. `next.config.ts` ships that file inside every server function (`outputFileTracingIncludes`)
   and inlines `DATABASE_PROVIDER`, so the running app always matches the generated client.
3. On first use per server instance, `src/lib/prisma-client.ts` copies the file to
   `os.tmpdir()/stockflow/` (the deployment filesystem is read-only; `/tmp` is writable) and
   points Prisma at the copy.

Consequences, accepted for a demo: every cold start begins from the seeded data; two visitors on
two different instances may see different data; the daily cron resets only the instance it hits.
A small banner — "Demo environment — data resets periodically" — is shown only in this mode.
Locally the copy lives in `%TEMP%/stockflow`, is reused across restarts, and is replaced when
`npm run db:sqlite` rebuilds the file (the copy's name includes the file's size and mtime).

The code must compile against **both** generated clients (the SQLite build type-checks against
SQLite types). That rules out Postgres-only Prisma features in app code: use `containsText()`
instead of `mode: 'insensitive'`, avoid `skipDuplicates`, JSON filters and raw SQL.

Switching locally: set `DATABASE_PROVIDER` in `.env`, then `npm run db:generate` (PostgreSQL) or
`npm run db:sqlite` (SQLite) — the Prisma Client is generated for one provider at a time.

### No Docker here, but `docker-compose.yml` for owners

`docker-compose.yml` runs `postgres:16`. This machine has no Docker, so `npm run db:local` runs a
real PostgreSQL 16 through the `embedded-postgres` package (port 54329, data in `.pg/`, git-
ignored; `npm run db:local:stop` stops it). All PostgreSQL verification was done against it.

---

## Permissions

`src/lib/permissions.ts` is the capability matrix; `can(role, permission)` is pure and safe in
client components (to hide buttons), but **the control is `requirePermission()` on the server**.

- **ADMIN**: everything.
- **STAFF**: view everything (including reports and CSV export), create/edit products, register
  movements, manage their own profile and password. Strict reading of the spec: no deletes of any
  kind, **no archiving** (archive is the app's delete), no category/supplier maintenance, no user
  management.
- **DEMO**: like ADMIN, minus `password:change`, `user:set-password`, `user:delete` — and minus
  `profile:change-email`, because a visitor changing the shared demo account's email would break
  "Try the demo" for everyone until the next reset.

`userChangeRefusal(actor, target, change)` adds the relational rules a flat matrix cannot express:
nobody deletes themselves or changes their own role; the last admin cannot be deleted or
demoted; DEMO can only manage STAFF accounts and cannot grant ADMIN.

`requirePermission()` re-reads the user from the database on every request (memoised per request
with React `cache`), so a role change or a deleted account takes effect immediately instead of
when the 12-hour JWT expires.

## Authentication

- Auth.js v5, Credentials provider, bcryptjs (cost 10), JWT sessions (12 h).
- Split config: `src/lib/auth.config.ts` is edge-safe (no Prisma/bcrypt) and is all the
  middleware loads; `src/lib/auth.ts` adds the provider. The middleware only checks that a valid
  session cookie exists; guests get a redirect to `/login?callbackUrl=…` (APIs get a 401 JSON).
- **Rate limiting** lives inside `authorize()`, so it also covers direct POSTs to
  `/api/auth/callback/credentials`: 5 failed attempts per IP + email in a sliding 15-minute
  window; success clears the key. Registration: 5 accounts per IP per hour.
  **Limitation:** the limiter is in memory. On Vercel each serverless instance has its own
  counters and instances are recycled, so it slows a naive brute-force loop but is not a hard
  guarantee. The upgrade path is a shared store (Upstash Redis / Vercel KV / a table) behind the
  same three methods.
- Unknown emails still pay one bcrypt comparison, so response time does not reveal which emails
  exist. Wrong passwords are not logged as server errors.
- `callbackUrl` is reduced to a same-host path (Auth.js sends an absolute URL); anything else goes
  to `/dashboard`.
- `/register` creates **STAFF** users and signs them in. `ALLOW_REGISTRATION=false` closes it
  (page and action). `DEMO_ENABLED=false` hides "Try the demo" and disables the reset endpoint.
- `/logout` (GET route) exists for one case: a valid JWT whose user was deleted. A server
  component cannot clear cookies, so the app layout redirects there.
- Build note: Next prints "A Node.js API is used (CompressionStream…) which is not supported in
  the Edge Runtime" for `jose` inside the middleware bundle. It is a known false positive (the Edge
  runtime has `CompressionStream`; jose only uses it for compressed JWEs, which Auth.js does not
  create). The middleware works on Edge; the warning is left rather than moving middleware to the
  Node runtime.

## App shell

- Desktop sidebar collapses to icons (button or Ctrl/Cmd+B). The state is a cookie read by the
  server layout, so the first paint already has the right width. Below `lg` (1024 px) it is a
  drawer. Stage 1 used `md`; stage 2 moved it because a fixed 240 px sidebar on a 768 px portrait
  tablet left the tables only ~480 px, less than a phone in landscape.
- Ctrl/Cmd+K opens the command palette: pages (filtered locally, respecting permissions), products
  (searched by name or SKU through the guarded `GET /api/search`), theme switching. A route
  handler rather than a server action because it is a cancellable, debounced read.
- In development the Next.js "N" badge is moved to the bottom right; bottom left it covered the
  sidebar's collapse button.

## Deployment files

- `vercel.json` schedules `GET /api/cron/reset-demo` daily at 04:00 UTC (the Hobby plan allows one
  daily cron). Vercel sends `Authorization: Bearer $CRON_SECRET`; the handler compares it in
  constant time, answers 503 when `CRON_SECRET` is not set and does nothing when
  `DEMO_ENABLED=false`, so a real deployment is never wiped by the schedule.
- Security headers (`nosniff`, `X-Frame-Options: DENY`, referrer and permissions policies) are set
  in `next.config.ts`.

---

## Feature pages (stage 2)

### Time zone

"Movements today", the 30 daily chart buckets, the history's date filters, CSV timestamps and the
dated CSV filenames all use one zone: `APP_TIME_ZONE` (an IANA name, e.g. `America/Bogota`) or,
when unset or invalid, the server's zone (`src/lib/dates.ts`). Dates are formatted on the server
and sent as text, so a server in UTC and a visitor elsewhere never disagree during hydration.
Vercel runs in UTC, so a real deployment should set `APP_TIME_ZONE`.

### Currency

Money is shown in US dollars with US formatting (`CURRENCY`/`LOCALE` in `src/lib/constants.ts`).
The spec names no currency and the UI is in English; one constant changes it. CSV files carry
money as plain two-decimal numbers (`1234.50`, no symbol or separators) so spreadsheets read them
as numbers.

### Dashboard figures

- **Inventory value** = Σ quantity × unit cost over non-archived products, summed in integer cents
  (`inventoryValue()` in `src/lib/metrics.ts`). Archived products are off the shelf, so they are not
  counted; the reports use the same rule.
- **Low stock** counts products at or below their reorder level _including_ out of stock (the ones
  that need a purchase order); the tile says how many of them are out. The tile links to the alert
  table on the same page instead of the product filter, because the filter separates "low" from
  "out" and the numbers would not match.
- **Movements today** counts every movement type since local midnight; the detail line gives units
  in and out.
- **Best sellers** rank products by units of `OUT` movements over the same 30 days as the line
  chart (today included), so the two charts describe the same period; the card says so.
  Adjustments are corrections, not sales, and are left out of both charts.
- The alert table shows the 10 emptiest products and says when there are more. Each row has a
  **Restock** button that opens the movement dialog preset to a stock-in for that product.

### Chart colours

`--chart-1` (blue, the primary) is "stock in" and `--chart-2` (orange) is "stock out" in both
themes: blue/orange stays distinguishable for the common colour-vision deficiencies, and each series
is also named in the legend and the tooltip. Axis text uses the muted foreground token, never the
series colour. Every chart has a visually hidden table with the same numbers for screen readers.
Charts take a named value format (`'number' | 'currency'`) instead of a formatter function, because
server components render them and functions cannot cross into client components.

### Products table

- Search (name or SKU, case-insensitive on both databases), category, supplier (plus "No
  supplier"), stock status, active/archived, sorting and paging all live in the URL and run in the
  database; the page reads them with `productListQuerySchema`, which never throws. Sort keys are a
  whitelist (`src/lib/list-options.ts`); an out-of-range page shows the last page.
- Stock status: **out** = 0; **low** = 1 … reorder level; **in stock** = above it.
- The CSV export button sends the same filters and order as the table (all pages).
- On phones the table keeps name, stock and the row menu; the status badge moves under the name.
  Wider screens add columns (category at `lg`, reorder level and price at `xl`, supplier and unit
  cost at `2xl`) so no breakpoint needs sideways scrolling.

### Products: create, edit, archive, delete

- Create and edit share one dialog and the shared Zod schema; a taken SKU comes back from the
  database (unique index, P2002) and is shown under the SKU field.
- Quantity is not a form field. Opening stock on create is an `IN` movement ("Opening stock") in
  the same transaction, so the ledger is complete from the first unit.
- **Archive** (ADMIN/DEMO) hides a product from the active list, the dashboard and the valuation,
  and blocks movements; it can be restored. STAFF cannot archive (see Permissions).
- **Delete** (ADMIN/DEMO only; hidden for STAFF and refused by the server action) is allowed only
  for a product with no movements, because the stock history must stay intact. The menu item is
  disabled with "Has stock history, archive instead" rather than failing after a click.

### Movements

- One "Register movement" dialog (movements page, dashboard, product page, low-stock rows) with a
  type switch, a searchable product combobox (server search through `GET /api/search`, active
  products only), quantity and optional reason.
- The form always asks for a positive number of units. For an adjustment the user picks
  "Remove units" or "Add units", and the form sends the signed delta
  (`movementQuantity()` in `src/lib/movement-form.ts`).
- The dialog previews the resulting stock and warns when a stock-out exceeds what is on hand, but
  still sends it: the server is the authority (the figure may have changed since the search) and
  its refusal - "Not enough stock: X available, tried to remove Y." - is shown as an error toast
  and under the quantity field. Nothing is written in that case.
- History filters: date range (inclusive days in the app time zone), type, user (including
  "Deleted user"), and a product chip when opened from elsewhere. Newest first by default.

### Categories and suppliers

- Full CRUD in dialogs; the category form has ten preset swatches (arrow keys move between them),
  a native colour picker and a hex field. Create/edit/delete are ADMIN/DEMO; STAFF sees read-only
  lists.
- A category or supplier still used by any product (archived ones included) cannot be deleted.
  The dialog explains why and links to those products instead of offering the button; the server
  action refuses the same case with the same explanation, whatever the UI shows. (Suppliers could
  have been detached automatically - the relation is `SetNull` - but silently unlinking products
  from their vendor is the kind of surprise an inventory owner would not want.)

### Reports

- CSV downloads are plain links to guarded Route Handlers (`/api/export/products`,
  `/api/export/movements`), so the browser saves the file itself. RFC 4180 quoting, CRLF, a UTF-8
  BOM for Excel, a leading apostrophe on text that starts with `= + - @` (spreadsheet formula
  injection) and a dated filename (`stockflow-products-2026-09-24.csv`).
- The movements export defaults to the last 30 days; products export active products by default.
- Valuation by category: active products, at cost and at sale price, share of the total and a bar
  chart; every category appears even when empty.

### Settings

- Tabs: Account (profile + password), Appearance (light/dark/system, same provider as the top-bar
  toggle), Users (only for roles with `user:view`). `?tab=users` opens a tab directly.
- The DEMO account sees the password form disabled with the reason, and its email field is
  read-only with the reason; both are also refused by the server actions.
- Users: ADMIN creates users with any role, edits names and roles, sets a new password for someone
  else (`setUserPassword`, audited) and deletes. DEMO can view, create STAFF accounts and edit
  STAFF accounts, but cannot delete users or reset passwords. Menu items the rules refuse are shown
  disabled with the reason from `userChangeRefusal()`; nobody can reset their own password there
  (that path skips the current-password check).

### Empty states and feedback

Every list has an empty state with an inline SVG and a call to action; three drawings tell "nothing
here yet" (box), "no match for these filters" (magnifier, with "Clear filters") and "nothing needs
attention" (check). Every mutation shows a success or error toast and writes an AuditLog row in the
same transaction.

---

## Architecture

### Layout

```
prisma/schema.prisma          source of truth for both providers (+ migrations/, seed.ts CLI)
scripts/                      build.mjs, db.mjs (provider-aware db:* commands), db-local.mjs,
                              lib/common.mjs (sqlite schema derivation), seed-stats.ts (tuning)
src/middleware.ts             edge auth gate
src/app/(auth)/               login, register (+ split-screen layout)
src/app/(app)/                every signed-in page; layout.tsx = shell + fresh user
src/app/api/                  auth/[...nextauth], search, cron/reset-demo, export/products,
                              export/movements (CSV)
src/app/logout/route.ts       sign-out for deleted accounts
src/components/ui/            shadcn/ui primitives
src/components/layout/        app-shell, sidebar, command-palette, user-menu, page-header,
                              empty-state (3 illustrations), page-skeleton, demo-banner
src/components/theme/         theme provider + toggle
src/components/auth/          login/register forms
src/components/charts/        Recharts wrappers: movement-trend-chart, horizontal-bar-chart
src/components/tables/        data-table (TanStack, manual mode), pagination, toolbar,
                              products-table, movements-table, low-stock-table
src/components/inventory/     badges, confirm-dialog, product-dialog, product-actions,
                              product-combobox, movement-dialog
src/components/catalog/       categories/suppliers tables and dialogs, colour picker,
                              record-delete-dialog (explains "still in use")
src/components/dashboard/     kpi-card
src/components/reports/       report-exports (CSV download options)
src/components/settings/      profile-form, password-form, theme-picker, users-section
src/hooks/                    use-search-params-updater (URL-driven tables), use-product-search
src/lib/                      auth.ts, auth.config.ts, db.ts, prisma-client.ts, permissions.ts,
                              stock.ts, errors.ts, rate-limit.ts, audit.ts, config.ts,
                              constants.ts, navigation.ts, forms.ts, utils.ts,
                              csv.ts, dates.ts, format.ts, metrics.ts, list-options.ts,
                              search-params.ts, movement-form.ts (pure, unit-tested)
src/lib/queries/              server-only reads that feed pages (plain JSON, no Decimals)
src/lib/validations/          Zod schemas shared by forms and actions (import from the index)
src/lib/actions/              guard.ts (requirePermission, createAction), auth.ts, movements.ts,
                              products.ts, catalog.ts, users.ts, account.ts
src/lib/seed/                 catalog, deterministic generator, seedDatabase()
tests/unit                    Vitest (npm test)            tests/integration  real DB
tests/e2e                     Playwright (fixtures.ts has accounts + console-error guard)
```

### Writing a server action (stage 2)

```ts
'use server';
export const deleteSupplier = createAction(
  { permission: 'supplier:delete', schema: byIdSchema },
  async ({ id }, { user }) => {
    await prisma.$transaction(async (tx) => {
      await tx.supplier.delete({ where: { id } });
      await audit(tx, {
        userId: user.id,
        action: 'supplier.delete',
        entity: 'Supplier',
        entityId: id,
      });
    });
    revalidatePath('/suppliers');
    return null;
  },
);
```

- Every action goes through `createAction` (or calls `requirePermission` first). It returns
  `{ ok: true, data }` or `{ ok: false, code, error, fieldErrors? }`; typed `AppError`s and Prisma
  P2002/P2003/P2025 become user-safe messages. A STAFF call to a delete action returns
  `{ ok: false, code: 'FORBIDDEN' }` before the handler runs (unit-tested).
- Stock changes: call `registerMovement` (already written) or `applyStockMovement(tx, …)` inside
  your own transaction — e.g. product creation with `initialQuantity` creates the product with
  quantity 0 and then applies an `IN` with reason "Opening stock" in the same transaction. Never
  write `Product.quantity` directly.
- Write an `AuditLog` row for every mutation with `audit(tx, …)`.

### Writing a page (stage 2)

- Server component; start with `await requirePagePermission('product:view')` (redirects instead
  of throwing) or `getCurrentUser()`; both are cached per request.
- Header with `<PageHeader title description actions />`; empty lists with `<EmptyState … action />`;
  a `loading.tsx` using `<PageSkeleton />` / `<TableSkeleton />`; errors are caught by
  `(app)/error.tsx`.
- Server-side tables read their state from URL search params parsed with
  `productListQuerySchema` / `movementListQuerySchema` (they never throw on garbage input).
- Search with `containsText(q)`; low stock with `lowStockWhere()`; money through `toNumber()`.
- Client forms: `useForm({ resolver: zodResolver(schema) })` + `<Form>` components, call the
  action, then `applyFieldErrors(form, result.fieldErrors)` and `toast.error(result.error)` /
  `toast.success(...)`.
- Hide controls with `can(user.role, '...')`; pass the role down from the server component.
- Colours: `text-link` for primary-coloured text (readable in dark mode), `chart-1..5` tokens for
  Recharts series (`chart-1` blue for IN, `chart-2` orange for OUT), badge variants `success`,
  `warning`, `danger`, `info` for stock status.

### Pages (stage 2)

Every page under `src/app/(app)` is a server component that checks its permission, reads its
data through `src/lib/queries`, and hands plain JSON to client components; each has a
`loading.tsx` skeleton. Tables are driven by URL search params (`useSearchParamsUpdater`), forms
by react-hook-form with the shared schemas, and every mutation is a guarded server action that
revalidates the affected pages.

### Commands

```
npm run db:local                     # PostgreSQL 16 on :54329 (keep running)
npm run db:deploy && npm run db:seed
npm run dev                          # or: npm run build && npm start
npm test                             # unit tests
npm run test:integration             # real database (re-seeds it!)
npm run test:e2e                     # production build on :3100, seeded database
DATABASE_PROVIDER=sqlite npm run build   # self-contained demo build
```
