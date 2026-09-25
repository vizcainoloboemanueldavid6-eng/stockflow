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
  time); the seed's audit row (`system.seed` / `system.demo-reset`) carries that moment, which the
  SQLite demo uses to tell aged data from fresh data.
- Product names are generic (no brands); supplier emails use the reserved `.example` domain and
  phones the fictional 555-01xx range; account emails use the reserved `.test` domain.
- **`npm run db:seed`** wipes business data (products, movements, categories, suppliers, audit
  log) and upserts the three seeded accounts, keeping any other users.
  **`npm run db:reset-demo`** does the same and also deletes every account that is not one of
  the three, so a public demo returns to a known state. Both are idempotent and run in one
  transaction. The seeded accounts' passwords are public on purpose; `SEED_ADMIN_PASSWORD` etc.
  override them for a real deployment.
- **`DEMO_ENABLED=false` is what marks a real deployment**, so the seed treats it that way: it
  creates no demo account (and deletes a DEMO-role account with the demo email left from an earlier
  seed; its share of the generated history goes to the staff account), and it **refuses to run**
  until `SEED_ADMIN_PASSWORD` and `SEED_STAFF_PASSWORD` are set, because the defaults are printed in
  the README. On Vercel that fails the first build with the message, which is the point: better a
  failed first deploy than a production admin whose password is on GitHub. With the demo off the
  seed CLI does not print the passwords either (build logs are not a place for them).

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

**Aged data.** The build seeds the file once, and every date in it is relative to that moment, so a
deployment left alone for a month would show an empty 30-day chart. A runtime copy made by the
current process whose seed marker is from an earlier day (in `APP_TIME_ZONE`) or over an hour old
is seeded again for "now" before the app's first query (`src/lib/sqlite-demo.ts`). The gate wraps
the client: a query extension makes every operation wait, and a proxy makes `$transaction` wait
_before_ it starts, because a SQLite transaction takes the write lock at `BEGIN` and the re-seed,
which runs on its own short-lived client, would otherwise wait for it (measured: a second writer
waited for the whole open transaction). An existing copy is never re-seeded, so local work in
SQLite mode survives restarts. Cost: about half a second on the first request of a cold instance.
Why not the instrumentation hook: `next start` awaits `register()`, but the minimal server Vercel
runs starts it without waiting, so it cannot gate the first request there.

**One connection.** SQLite has one writer at a time for the whole file. With Prisma's default
pool, 40 simultaneous stock-outs contended for the file lock inside the engine and 32 failed with
"Socket timeout" (P1008). The SQLite URL now carries `connection_limit=1&socket_timeout=15`, so
transactions queue in Prisma (up to the 10-second `maxWait`) and each takes milliseconds: the same
burst gives exactly the expected successes and "not enough stock" answers.

**Scripts and the live copy.** `db:seed` / `db:reset-demo` write the bundled file, which a running
app never reads again. In SQLite mode they now also seed the copy a running app is using (found by
the same size-and-mtime name, computed before the seed changes the file), so they work without a
restart; the next start copies the freshly seeded file anyway.
A small banner — "Demo environment — data resets periodically" — is shown only in this mode.
Locally the copy lives in `%TEMP%/stockflow`, is reused across restarts, and is replaced when
`npm run db:sqlite` rebuilds the file (the copy's name includes the file's size and mtime).

The code must compile against **both** generated clients (the SQLite build type-checks against
SQLite types). That rules out Postgres-only Prisma features in app code: search products with
`productTextWhere()` (it adds `mode: 'insensitive'` only at runtime on PostgreSQL), avoid
`skipDuplicates` and JSON filters, and keep raw SQL to provider-specific branches such as the one
in `productTextWhere()`.

Switching locally: set `DATABASE_PROVIDER` in `.env`, then `npm run db:generate` (PostgreSQL) or
`npm run db:sqlite` (SQLite) — the Prisma Client is generated for one provider at a time.

### No Docker here, but `docker-compose.yml` for owners

`docker-compose.yml` runs `postgres:16-alpine`. This machine has no Docker, so `npm run db:local` runs a
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
demoted; DEMO can rename STAFF accounts but **changes no roles at all** (turning Staff into Demo
would take the account out of DEMO's reach and make the published Staff login show Demo powers;
promoting to Admin was already refused).

**Shared demo accounts.** The README publishes the Admin and Staff passwords too, and ADMIN has no
DEMO limits, so locking only the DEMO role was not enough: any visitor could sign in as the admin
and delete the demo user, change the admin password or email, or demote the Staff account. While
`DEMO_ENABLED` is on, the three seeded accounts (matched by their configured emails,
`sharedDemoAccount()` in `src/lib/config.ts`) are therefore locked for everyone: no delete, no role
change, no password reset by an admin, no own password or email change. Renaming stays allowed
(harmless, and reset daily). Accounts people create are ordinary. With the demo off, the seeded
accounts are ordinary accounts of a real business.

`requirePermission()` re-reads the user from the database on every request (memoised per request
with React `cache`), so a role change or a deleted account takes effect immediately instead of
when the 12-hour JWT expires.

## Authentication

- Auth.js v5, Credentials provider, bcryptjs (cost 10), JWT sessions (12 h).
- Split config: `src/lib/auth.config.ts` is edge-safe (no Prisma/bcrypt) and is all the
  middleware loads; `src/lib/auth.ts` adds the provider. The middleware only checks that a valid
  session cookie exists; guests get a redirect to `/login?callbackUrl=…` (APIs get a 401 JSON).
- **Rate limiting** lives inside `authorize()` (`verifyCredentials()` in `src/lib/credentials.ts`),
  so it also covers direct POSTs to `/api/auth/callback/credentials`: 5 failed attempts per client +
  email in a sliding 15-minute window; success clears the key. Registration: 5 attempts per client
  per hour, where an "email already exists" answer counts too (otherwise probing which emails have
  accounts was free, undoing the login's anti-enumeration work).
  - **Counted before the check's awaits.** The first version checked, then awaited the database and
    bcrypt, then recorded a failure: 30 simultaneous guesses all passed the check. `consume()`
    checks and records in one synchronous step before the first await; success resets the key.
  - **Which client.** `X-Forwarded-For` is trusted only when a proxy vouches for it: on Vercel
    (`VERCEL=1`; the platform overwrites the header - first entry) or with `TRUST_PROXY=true` behind
    a self-hosted reverse proxy (the entry it appended - last). `next start` keeps whatever the
    client sent, so otherwise every request shares one key: the login limit becomes per email and
    the registration limit per server. Stricter (someone can hold one email's sign-in for 15
    minutes), but a rotating fake header no longer buys unlimited guesses.
  - **The public demo account is exempt** while the demo is on: its password is published and "Try
    the demo" signs in with it, so limiting it protected nothing and let anyone behind the same
    address lock the one-click demo for everyone.
    **Limitation:** the limiter is in memory. On Vercel each serverless instance has its own
    counters and instances are recycled, so it slows a naive brute-force loop but is not a hard
    guarantee. The upgrade path is a shared store (Upstash Redis / Vercel KV / a table) behind the
    same three methods.
- Unknown emails still pay one bcrypt comparison, so response time does not reveal which emails
  exist. Wrong passwords are not logged as server errors.
- `callbackUrl` is reduced to a same-host path (Auth.js sends an absolute URL); anything else goes
  to `/dashboard`.
- `/register` creates **STAFF** users and signs them in. `ALLOW_REGISTRATION=false` closes it
  (page and action).
- `DEMO_ENABLED=false` hides "Try the demo", disables the reset endpoint and the "portfolio demo"
  line of the sign-in page, and **closes the demo account**: `verifyCredentials()` answers a
  DEMO-role user like a wrong password, and `getCurrentUser()` treats an existing DEMO session as
  signed out (so a token issued before the switch stops working too). Hiding the button alone left
  the published demo credentials working through the normal form with near-admin rights.
- "Try the demo" with no demo account in the database tells the visitor the demo is not available
  right now and logs the fix (`npm run db:seed`) on the server, instead of showing a developer
  command to a prospect.
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

- Search (name or SKU, case-insensitive on both databases, `%` and `_` matched literally: Prisma
  passes `contains` text into `LIKE` unescaped, so PostgreSQL gets them escaped and SQLite, whose
  `LIKE` has no escape character, matches such text with `instr()`), category, supplier (plus "No
  supplier"), stock status, active/archived, sorting and paging all live in the URL and run in the
  database; the page reads them with `productListQuerySchema`, which never throws. Sort keys are a
  whitelist (`src/lib/list-options.ts`); an out-of-range page shows the last page.
- Stock status: **out** = 0; **low** = 1 … reorder level; **in stock** = above it.
- The CSV export button sends the same filters and order as the table (all pages).
- On phones the table keeps name, stock and the row menu; the status badge moves under the name.
  Wider screens add columns (category at `lg`, reorder level and price at `xl`, supplier and unit
  cost at `2xl`) so no breakpoint needs sideways scrolling.

### Products: create, edit, archive, delete

- Create and edit share one dialog and the shared Zod schema; a taken SKU is shown under the SKU
  field. The action checks it first (`assertUnique()` in `src/lib/unique-checks.ts`, also used for
  category names and emails) so an ordinary typo does not log a database error; the unique index
  stays the guarantee, and a race that slips past the check (P2002) becomes the same field error.
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
- After a movement, the "now appears in the low stock alerts" warning shows only when that movement
  crossed the reorder level; a restock that leaves the product low says it stays in the alerts.
- Interactive transactions may wait 10 s for a connection and run 15 s (Prisma's defaults, 2 s and
  5 s, turned a burst of 40 simultaneous stock-outs into P2028 errors). Contention that still
  happens (P1008, P2028, P2034, "database is locked") is answered with a "busy, nothing was saved,
  try again" message (`BUSY`, HTTP 503 in route handlers) instead of the generic error.
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
- Category names are unique **without regard to case or surrounding spaces** ("audio" next to
  "Audio" would show as two identical entries in filters and charts). The pre-check reads the
  categories and compares in code, which works the same on both providers; renaming a category to
  its own name in another case is allowed. The database index stays case-sensitive, so two
  simultaneous creates could still both pass, which is acceptable for a list edited by admins.
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
attention" (check). A product needs a category, so with no categories the products empty state
links to /categories instead of opening a form whose required field has no options, and the "Add
product" dialog says the same (or "ask an administrator" for Staff).

Long unbroken text (a pasted link, a 50-letter name) wraps instead of widening a page: the product
detail fields use `overflow-wrap: anywhere` in a `minmax(0, 1fr)` grid, category labels wrap even
inside the tables' no-wrap cells, truncated links carry their own `max-width` (browsers ignore it
on table cells), and the screen-reader tables under the charts are hidden through a wrapper div,
because a table ignores its own `sr-only` width. Every mutation shows a success or error toast and writes an AuditLog row in the
same transaction.

---

## Tests, docs and shipping (stage 3)

### `npm run test:e2e` starts everything itself

The spec asks for `npm run test:e2e` to pass, so it must not depend on servers someone remembered
to start. Playwright's `webServer` list runs, in order:

1. `scripts/e2e-db.mjs`: uses the embedded PostgreSQL on :54329 (starts it when nothing listens
   there, reuses a running `npm run db:local`), then `prisma migrate deploy` and the demo reset on
   a **separate `stockflow_e2e` database**. Every run starts from the same seeded state and the
   development database is never touched. It answers `/ready` on :3119 once done.
2. `scripts/e2e-server.mjs`: `npm run build`, then `next start` on :3100.
3. The same build on :3101 with `ALLOW_REGISTRATION=false` and `DEMO_ENABLED=false`.

`E2E_SKIP_BUILD=1` reuses the current build; `E2E_BASE_URL` runs against servers started by hand.
On Windows Playwright can only force-kill web servers, so a global teardown asks the database
script (`/shutdown`) to stop PostgreSQL first, and only if that script started it. The stop uses
`pg_ctl stop -m fast`: embedded-postgres' own `stop()` terminates the server abruptly on Windows
and left `postmaster.pid` behind in an early run. A stale `postmaster.pid` (nothing listening on
the port) is removed on the next start. In SQLite mode the script rebuilds and seeds the SQLite
file instead.

### Direct server-action calls: record and replay

The spec: STAFF cannot delete, "also calling the action directly", in e2e. Server-action ids are
build-specific hashes and are not exposed, and a test-only route handler would add production code
that the real UI never uses. So the e2e test records the real request an admin's browser sends
(`Next-Action` header + serialised arguments) and replays it with the STAFF session cookie, with the
target id swapped for another deletable record. The server must answer `FORBIDDEN` and the record
must still exist; the same replay with the admin's cookie deletes it (positive control, which proves
the replay really reaches the action). The same technique covers DEMO changing its password (and
the seeded Admin and Staff accounts, which are shared while the demo is on; the recording comes from
a freshly registered Staff account) and the register / demo-login actions on the server started
with both switches off. That closed server also gets the published demo credentials through the
form and through a direct POST to the Auth.js endpoint, and a demo session cookie issued by the open
server: all three must be refused.

Registration counts every attempt per client, and `next start` without `TRUST_PROXY` shares one key
for the whole server, so the suite keeps to three registrations per run (the limit is five an
hour). An integration test
(`tests/integration/actions.test.ts`) calls the real actions against the real database with only
the session mocked, including a session that _claims_ ADMIN for the STAFF account.

### Concurrency on PostgreSQL, and what SQLite does

`tests/integration/database.test.ts` forces the interleaving instead of hoping for it: the first
transaction takes 7 of 10 units and stays open; the test waits until `pg_stat_activity` shows the
second transaction waiting on the row lock, then commits the first. Under READ COMMITTED the second
`UPDATE ... WHERE quantity >= 7` is re-evaluated on the committed row (3 units), matches nothing
and fails with "Not enough stock: 3 available, tried to remove 7." The unit tests run the same
scenario on an in-memory fake, plus a control showing that a read-then-write version overdraws.

**SQLite** (`DATABASE_PROVIDER=sqlite npm run test:integration`, all green) has no row locks: a
write transaction locks the whole database file, so writers run one after another. Observed: in
the overlapping case the second transaction only proceeds after the first commits and gets the
same "3 available, tried to remove 7" error; 8 simultaneous OUTs of 3 on a stock of 10 gave exactly
3 successes and 5 `InsufficientStockError`s. The same conditional `UPDATE` therefore protects both
modes. The difference is under heavy load: a writer that waits longer than SQLite's busy timeout
fails with a "database is locked" error instead of the stock message (still no overdraw). There is
no `CHECK` constraint in SQLite mode (Prisma cannot express it portably), which is acceptable for a
demo database.

### SQLite demo: the temp copy is always writable

The Vercel-style check (SQLite build, `next start` with `TEMP`/`TMP` pointed at an empty folder,
the bundled `stockflow.db` marked read-only like a deployment bundle) found that `copyFileSync`
keeps the source's permission bits: the copy was read-only too and every write failed with
"attempt to write a readonly database". `ensureWritableSqliteCopy()` now `chmod`s the copy to
0644 before using it (unit test fails without the fix). With it, "Try the demo" plus a movement
worked, the full e2e suite passed against that server (44/44), and the bundled file's SHA-256 was
unchanged afterwards.

### Vercel builds: migrations over the direct connection

Neon's pooled host is PgBouncer in transaction mode, which cannot keep the session-level advisory
lock `prisma migrate deploy` takes. On Vercel the build therefore runs the migrations and the
first-run seed with `DATABASE_URL_UNPOOLED` (set by Neon's Vercel integration) or `DIRECT_URL` when
present, and the app keeps using the pooled `DATABASE_URL`. No `directUrl` in the schema, because
that would make a second variable mandatory for every local setup.

### `postinstall`, and npm 11's install-script approvals

`postinstall` runs `scripts/postinstall.mjs`, which generates the Prisma Client for
`DATABASE_PROVIDER` (skipped with a notice when the Prisma CLI is absent, e.g. `--omit=dev`). It
guards against Vercel restoring a cached `node_modules` with a stale client. npm 11.19 (the version
on the development machine) blocks dependency install scripts unless `package.json` lists them in
`allowScripts`; the Prisma engines download, esbuild, the ESLint resolver and embedded-postgres all
have one. They are approved by name (not pinned to versions, so upgrades do not silently disable
them), including the Linux and macOS embedded-postgres packages that never install on Windows.
Older npm versions, such as the one Vercel uses, ignore the field.

### Dependency audit

`npm audit --omit=dev` reported 4 high and 1 moderate:

- `deepmerge-ts < 8` through `prisma` → `@prisma/config` (stack exhaustion on recursive objects).
  The only fix npm offered was downgrading Prisma to 6.12. `@prisma/config` only calls
  `deepmerge()` to load an optional `prisma.config.ts`, which v8 still exports, so an override pins
  `deepmerge-ts` to **8.0.2**; `prisma generate`, `migrate deploy` and the seed were re-run with it.
- `postcss <= 8.5.22` bundled by `next` (build-time CSS processing), which npm could only fix by
  jumping to Next 16. An override gives Next the project's own **postcss 8.5.28** (same major).
  `next build` and the full e2e suite were re-run with it.

Result: `npm audit --omit=dev` and the full `npm audit` both report 0 vulnerabilities.

### Screenshots

`npm run shots` signs in as the admin and captures dashboard, products and movements at 1440 px
and 390 px in both themes (`docs/<page>-<width>-<theme>.jpg`, JPEG like the owner's other
projects). Instead of Playwright's `fullPage`, the viewport is grown to the page height first: the
sidebar is `100dvh` tall and would otherwise stop halfway down a full-page capture. Phone captures
use a 2x device scale so they stay legible when GitHub shrinks them. The script fails on any console
error or HTTP error while capturing.

### A 404 page logs one line in Chrome

Chrome prints "Failed to load resource: ... 404" for any document that answers 404, including the
app's own not-found page. The console sweep accepts exactly that line for the deliberately missing
URL and nothing else; every real page is required to have zero console errors.

### How each database mode was verified

| Mode                                      | What was run                                                                                                                                                                                         | Result                                 |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Embedded PostgreSQL (default)             | `npm run test:e2e` from a stopped server (build, seed, both servers); `npm run test:integration`; `db:seed` then the dashboard test                                                                  | 44/44, 18/18, charts with data         |
| SQLite quick mode                         | `npm run db:sqlite`, `next dev` with `DATABASE_PROVIDER=sqlite`, "Try the demo" + a movement, console sweep on the dev server; `DATABASE_PROVIDER=sqlite npm run test:e2e`; SQLite integration suite | all passed (44/44 e2e, 17/17 + 1 skip) |
| Vercel-style ephemeral SQLite             | `DATABASE_PROVIDER=sqlite npm run build`, `next start` with `TEMP`/`TMP` on an empty folder and a read-only bundled file, demo + movement, full e2e against it                                       | 44/44 after the writable-copy fix      |
| Clean clone, `.env.example` values        | `git clone`, `cp .env.example .env`, `npm ci` (npm 11.19: no skipped install scripts), `npm run build`                                                                                               | build passed                           |
| Vercel build path (`VERCEL=1`, no `.env`) | Two builds with an unreachable `DATABASE_URL` and `DATABASE_URL_UNPOOLED` on an empty database: first migrated and seeded (3 users, 60 products, 400 movements), second skipped the seed             | both passed                            |

Not verified here: a real Linux build and a real Vercel/Neon deployment (no Linux machine, and
this stage does not deploy). The scripts are plain Node with `path.join` and `process.execPath`,
no shell syntax, and the schema already generates the `rhel-openssl-3.0.x` engine Vercel uses (it
is present in `node_modules/.prisma/client` and in the traced server bundle).

---

## Architecture

### Layout

```
prisma/schema.prisma          source of truth for both providers (+ migrations/, seed.ts CLI)
scripts/                      build.mjs, db.mjs (provider-aware db:* commands), db-local.mjs,
                              postinstall.mjs, e2e-db.mjs + e2e-server.mjs (test:e2e servers),
                              screenshots.mjs (npm run shots), seed-stats.ts (tuning),
                              lib/common.mjs (sqlite schema derivation, CLI runners),
                              lib/local-postgres.mjs (embedded PostgreSQL)
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
src/lib/                      auth.ts, auth.config.ts, credentials.ts (sign-in check), db.ts,
                              prisma-client.ts, sqlite-demo.ts, permissions.ts, like.ts,
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
tests/e2e                     Playwright (fixtures.ts: accounts, console-error guard,
                              server-action record/replay); *.closed.spec.ts = closed server
docs/                         README screenshots, DEPLOY.es.md (Neon + GitHub + Vercel)
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
- Search products with `await productTextWhere(q)`; low stock with `lowStockWhere()`; money
  through `toNumber()`.
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
npm run test:e2e                     # builds, seeds stockflow_e2e, serves :3100 and :3101
E2E_SKIP_BUILD=1 npm run test:e2e    # same, reusing the current .next build
npm run shots                        # README screenshots (needs a build + seeded database)
DATABASE_PROVIDER=sqlite npm run build   # self-contained demo build
```
