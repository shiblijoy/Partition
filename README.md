# Green Pastures Farm — Farm Management App

A web app (mobile-friendly, installable as a home-screen app) for running a
small livestock operation: track every cow, goat, lamb, and chicken, log
their daily costs, see cost-to-date and a suggested selling price, and let
buyers browse and request to buy animals online.

## What's built (MVP)

**Admin (staff-only, behind login)**
- Dashboard: counts by species, pending orders, total cost invested this month.
- Animal profiles: species, breed, sex, DOB, acquisition cost/date, weight, notes.
- Cost ledger per animal: log feed/medical/labor/housing/transport/other costs
  with a date and note; delete mistakes.
- Bulk cost logging: pick a whole group (e.g. "all chickens") and log one
  cost entry each, or split a single total cost evenly across the group —
  useful for a shared feed delivery or vet visit.
- Automatic **cost-to-date** (acquisition cost + every logged cost entry) and
  **average daily cost** per animal.
- **Suggested selling price** = cost-to-date × (1 + margin%). Margin defaults
  per species (set in Settings) and can be overridden per animal, or replaced
  entirely with a manual price.
- Mark an animal "for sale" to publish it on the public site; mark it sold
  (manually, or by completing a buyer's order) to record a `SaleRecord`
  snapshotting cost and profit at the time of sale.
- Order inbox: confirm, cancel, or complete buyer requests.
- Photo panel per animal: upload one or more photos at once (JPEG/PNG/WebP/GIF,
  up to 8MB each) and delete any of them; the first photo uploaded is the
  cover image used on listing cards and the storefront.

**Public storefront (no login)**
- Browse everything currently listed for sale, grouped by species, with
  price and a cover photo when one's been uploaded.
- Animal detail page with an order form (name, phone, email, note). This
  creates a pending order for staff to follow up on — **no online payment
  yet**, orders are a reservation that staff confirms offline (cash, bank
  transfer, etc).
- Works well on mobile browsers and can be added to a phone's home screen
  (`public/manifest.json`) for an app-like experience without building
  separate iOS/Android apps.

## Tech stack

Next.js 16 (App Router, Server Actions) + TypeScript + Tailwind CSS +
Prisma + Postgres, with photos on Vercel Blob storage. Auth is a small
custom session (signed JWT in an httpOnly cookie via `jose`) rather than a
heavier auth library — just one admin/staff user table with bcrypt-hashed
passwords.

## Getting started

You need a Postgres database (any Postgres works — a local install, Neon,
Supabase, Vercel Postgres) and, if you want to test photo uploads locally, a
Vercel Blob store (`vercel blob create-store`, then copy its read-write
token — this works from anywhere, not just when deployed on Vercel).

```bash
npm install
cp .env.example .env        # fill in DATABASE_URL, AUTH_SECRET, BLOB_READ_WRITE_TOKEN
npm run db:migrate           # applies the schema to your Postgres database
npm run db:seed              # creates an admin login + a few sample animals
npm run dev
```

Seed admin login (from `.env`): `admin@farm.local` / `ChangeMe123!` — change
this password (or the user row) before putting the app in front of anyone.

Useful scripts:
- `npm run db:studio` — Prisma Studio, a GUI to browse/edit the database directly.
- `npm run build` — production build (also type-checks).

## Data model

- `Animal` — one row per animal; `status`/`forSale` control storefront visibility.
- `CostEntry` — one row per logged cost, linked to an animal; `batchId` groups
  entries created together via the bulk-logging screen.
- `PriceSetting` — default margin % per species, used when an animal has no
  margin override or manual price.
- `Order` — a buyer's request to purchase a specific animal.
- `SaleRecord` — created when an animal is marked sold; snapshots cost and
  profit at that moment (so later cost edits don't rewrite sale history).
- `AnimalPhoto` — uploaded photos for an animal; `sortOrder` decides which is
  the cover (lowest first, so simply upload order).
- `User` — admin/staff logins.

## Deploying

Built for Vercel (Postgres + Blob storage are both first-class there), but
it's a normal Next.js app and will run on any Node host too.

On Vercel:
1. Add a Postgres database to the project (Storage tab, or `vercel storage`)
   — sets `DATABASE_URL` for you.
2. Add a Blob store to the project (Storage tab, or `vercel blob create-store`
   + `vercel storage connect`) — sets `BLOB_READ_WRITE_TOKEN` for you.
3. Set `AUTH_SECRET` yourself to a long random string (`openssl rand -hex 32`).
4. Run `npm run db:migrate` (or `prisma migrate deploy` in a build step)
   against that `DATABASE_URL`, then `npm run db:seed` once to create the
   first admin login.

Don't ship the sample `.env` secrets — generate fresh ones for production.

## Roadmap ideas (not built yet)

Roughly in the order they'd add the most value:

1. **More admin users / roles** — invite farmhands with limited permissions
   (e.g. can log costs but not change prices or delete animals).
2. **Notifications** — email/SMS to staff when a new order comes in, and to
   buyers when their order is confirmed (currently everything is manual).
3. **Real online payment** — Stripe/PayPal checkout instead of "we'll
   contact you," once you're ready to take card payments.
4. **Recurring costs** — auto-apply a daily housing/overhead cost per animal
   instead of logging it by hand every time.
5. **Reports** — profit by species/month, cost trend charts, export to CSV.
6. **Native mobile app** — the current app is an installable mobile-friendly
   website (PWA); a true native app (e.g. with push notifications) would be
   a separate project built against the same data via an API.
7. **Multi-farm / multi-location** support if this grows beyond one farm.
