# Savings Society — Deposits, Proofs & Approvals

A mobile + desktop app for a savings society where every member deposits a
fixed amount each month (default **৳10,000**). Members upload proof of each
payment from their phone; the admin checks the money arrived in the account
and approves it. Totals, dues, costs and each member's share are calculated
automatically.

It's a responsive web app that can be **installed on a phone's home screen**
(PWA, with a bottom tab bar like a native app) and used on a desktop
browser, so you build and run one codebase.

## How it works

**Members (phone-first)**
- **Home**: how much they owe (or "up to date"), total deposited, expected so
  far, their share of society costs, and net savings. A month-by-month grid
  shows paid, part-paid, due and upcoming months.
- **Pay**: pick the month, amount, method (bKash / Nagad / Rocket / bank /
  cash), transaction ID and date, then take a photo or attach a screenshot/PDF
  of the receipt. The form fills in the next unpaid month and the amount that
  clears what they owe. The admin's "where to send money" note is shown here.
- **History**: every submission with its status. If a payment is rejected,
  the admin's reason is shown.
- **Fund**: open books. Members see total collected, costs, fund balance and
  every cost entry, with receipts.
- **Account**: profile and change password.

**Admin**
- **Dashboard**: fund balance, total collected vs expected, costs,
  outstanding dues, this month's collection progress, and who is behind.
- **Approvals**: a queue of pending proofs, showing the photo, amount,
  transaction ID and what the member currently owes. **Approve** only after
  confirming the money arrived. **Reject** needs a reason. Approved and
  rejected payments can be undone or deleted.
- **Members**: list with deposited, expected and due/ahead amounts and the
  month they've paid up to. Add members (phone + starting password). Each
  member's page lets you edit details, deactivate, reset the password, and
  **record a cash payment** directly (approved immediately).
- **Costs**: log society expenses (bank charges, meetings, etc.) with
  optional receipts.
- **Report**: a member × month paid/due matrix, member accounts (deposited,
  expected, due, cost share, net savings), monthly cash flow with running
  balance, and **CSV export** for Excel or Google Sheets.
- **Settings**: society name, monthly amount, currency symbol, first month,
  and payment instructions for members.

## The calculations

- **Expected** = months since the member's first deposit month (or the
  society's start month, whichever is later), up to and including this month,
  × the monthly amount.
- **Deposited** = the sum of the member's *approved* payments. Pending and
  rejected payments never count.
- **Due** = expected − deposited (when positive). **Paid ahead** = the reverse.
- Month status: approved money is applied to the **oldest month first**. A
  ৳20,000 transfer covers two months, and a short payment shows that month
  as part paid. Members never have to split transfers by month.
- **Fund balance** = all approved deposits − all costs.
- **Cost share** = total costs ÷ active members. **Net savings** = deposited − cost share.

## Security & privacy

- Payment proofs are stored **outside `public/`** (in `storage/`) and served
  only through `/files/...`, which checks the session. A member can see only
  their own proofs; the admin can see all. Cost receipts are visible to every
  signed-in member, since the books are open.
- Every server action checks the role again. The member ID always comes from
  the session, never from the form.
- On each request the user row is re-checked, so deactivating a member signs
  them out immediately.
- Approve and reject only act on payments that are still pending, so a
  double tap or two admins can't process a payment twice.

## Tech stack

Next.js 16 (App Router, Server Actions) + TypeScript + Tailwind CSS 4 +
Prisma + SQLite, with the same small JWT-cookie auth as the farm app in the
repo root.

## Getting started

```bash
cd savings-society
npm install
cp .env.example .env        # set AUTH_SECRET to a long random string
npm run db:migrate           # creates prisma/dev.db
npm run db:seed              # admin login + settings + 4 demo members
npm run dev
```

- Admin: `01700000000` (or `admin@society.local`) / `ChangeMe123!`
- Demo member: `01711111111` / `Member123!`. Other demo phones are
  01722222222, 01733333333 and 01744444444.

Set `SEED_DEMO=0` to skip the demo members, and change the admin password
before real use. On a phone, open the site and choose **Add to Home Screen**
to install it.

## Deploying

Run it on any host with a persistent disk (a VPS or Docker running
`npm run build && npm start`). Uploaded proofs live in `storage/` and the
database in `prisma/dev.db`, so **back both up**. For serverless hosts
(Vercel), switch to Postgres (`provider` in `schema.prisma` plus
`DATABASE_URL`) and move `src/lib/uploads.ts` to S3/R2.

## Known limits / next steps

1. Changing the monthly amount re-prices *all* months, including past ones. If
   the amount changes over time, add a dated rate table.
2. Notifications (SMS/WhatsApp/email) when a payment is approved or a
   member falls behind.
3. Profit or interest distribution if the fund is invested.
4. Multiple admins with roles (e.g. a treasurer who approves and a viewer).
