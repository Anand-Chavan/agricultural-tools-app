# Agricultural Tools Business Management Application

Desktop-first web application for an agricultural tools manufacturing and selling business. Covers catalogue, inventory ledger, purchases, sales/invoicing, customers, reports, users/roles, settings, and audit logging.

> Sample product names, SKUs, prices, and tax values are **demo placeholders**. Reference photos come from the supplied product photo PDF and do not establish commercial specifications. Confirm tax/GST configuration with a qualified accountant before production use.

## Stack

- **Frontend:** React, TypeScript, Vite, Bootstrap 5, React Router, TanStack Query, React Hook Form/Zod-ready patterns
- **Backend:** Node.js, Express, TypeScript
- **Database:** PostgreSQL + Prisma migrations
- **Auth:** Server-side sessions (PostgreSQL session store), HttpOnly cookies, CSRF protection, bcrypt password hashing

## Prerequisites

- Node.js 20+
- PostgreSQL 14+
- npm 10+

## Setup

```bash
# from repo root
cp .env.example .env
# edit DATABASE_URL / SESSION_SECRET as needed

npm install
cd apps/api
npx prisma migrate deploy
npm run db:seed
cd ../..
```

### Demo users (development only — change immediately)

| Email | Password | Role |
| --- | --- | --- |
| admin@demo.local | ChangeMe123! | Admin |
| manager@demo.local | ChangeMe123! | Manager |
| sales@demo.local | ChangeMe123! | Sales |
| inventory@demo.local | ChangeMe123! | Inventory |
| readonly@demo.local | ChangeMe123! | Read-only |

## Run

```bash
# API on :4000 and web on :5173
npm run dev
```

Open http://localhost:5173

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start API + web |
| `npm run build` | Build API and web |
| `npm test` | API + web tests |
| `npm run db:migrate` | Apply Prisma migrations |
| `npm run db:seed` | Seed demo data |

## Product images

Extracted reference photos live in:

- `apps/web/public/product-references/` (static catalogue references)
- `apps/api/seed-assets/` and runtime `apps/api/uploads/products/` (seeded/uploaded images)

Replace these with approved business photos as needed. Uploads accept JPEG/PNG/WebP up to 5 MB.

## Business rules (highlights)

- Draft purchases do **not** change stock; receiving does, atomically with ledger rows.
- Invoice issue allocates a unique number and decrements stock in one transaction.
- Insufficient stock blocks issue (unless `allowNegativeStock` is enabled in settings).
- Money uses decimal types; totals are recomputed server-side.
- Permissions are enforced on API routes, not only in the UI.
- Gross profit appears only when cost snapshots exist; costing method is labelled in the UI.

## Backup / restore

```bash
# backup
pg_dump "$DATABASE_URL" > backup-$(date +%Y%m%d).sql

# restore
psql "$DATABASE_URL" < backup-YYYYMMDD.sql
```

Also back up the `uploads/` directory with the database.

## Deployment notes

- Set strong `SESSION_SECRET`, `COOKIE_SECURE=true`, HTTPS, and a locked-down `CORS_ORIGIN`.
- Run migrations before starting the API.
- Do not commit `.env` or uploaded files containing sensitive data.
- Have an accountant review tax invoice fields and rates before go-live.

## Tests

```bash
npm test
```

API integration tests cover calculations, invoice numbering/stock deduction, insufficient stock, and sales-role permission denials.
