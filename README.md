# Agricultural Tools Business Management Application

Desktop-first web application for an agricultural tools manufacturing and selling business.

**Stack:** Angular (frontend) · Node.js + Express + TypeScript (API) · PostgreSQL + Prisma

> Sample product names, SKUs, prices, and tax values are **demo placeholders**. Reference photos come from the supplied product photo PDF and do not establish commercial specifications. Confirm tax/GST configuration with a qualified accountant before production use.

## Features

- Login with role-based access (Admin, Manager, Sales, Inventory, Read-only)
- Dashboard with live KPIs
- Products / catalogue with reference photos, image upload
- Inventory balances + immutable stock ledger + adjustments
- Suppliers, purchase drafts, receiving, supplier payments
- Customers, sales invoices, partial payments, print/void
- Reports with CSV export
- Business settings, users/roles, audit log

## Prerequisites

- Node.js 20+
- PostgreSQL 14+
- npm 10+

## Setup

```bash
cp .env.example .env
# edit DATABASE_URL / SESSION_SECRET as needed

npm install
npm run db:migrate
npm run db:seed
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
npm run dev
```

- Web (Angular): http://localhost:5173  
- API: http://localhost:4000  

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start API + Angular |
| `npm run build` | Build API and web |
| `npm test` | API + Angular unit tests |
| `npm run db:migrate` | Apply Prisma migrations |
| `npm run db:seed` | Seed demo data |

## Product images

- `apps/web/public/product-references/` — static catalogue references from the supplied PDF
- `apps/api/seed-assets/` and runtime `apps/api/uploads/products/` — seeded/uploaded images

## Backup / restore

```bash
pg_dump "$DATABASE_URL" > backup-$(date +%Y%m%d).sql
psql "$DATABASE_URL" < backup-YYYYMMDD.sql
```

Also back up the `uploads/` directory with the database.
