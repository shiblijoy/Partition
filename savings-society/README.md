# Dreamhive — savings society app

A phone-first member app and a desktop admin console for a savings society:
every member deposits a fixed amount each month (default **৳10,000**), the
society invests the pooled money, and profits, costs and settlements are
shared equally. It's one responsive web app that members can **add to their
phone's home screen**.

The screens follow the *Dreamhive App* design canvas. Bracketed text such as
`[Location]`, `[Bank]` or `[Admin name]` in the demo data are placeholders
from the design, waiting for the society's real details.

## Member app (phone)

| Screen | What it does |
|---|---|
| Login | Mobile number + password, show/hide, "keep me logged in". |
| Set / change password | Forced at first login (temporary password from the admin). Changing it signs out every other phone. |
| Home | Approved savings, cost share, savings after costs, this month's status, recent approved payments, unread-notice dot. |
| Pay | Pick one or more months (amount worked out), method, transaction ID, proof photo/PDF, note. |
| History | Deposited / pending / due, every submission with its status, rejection reasons, receipt links, payouts. |
| Receipt | Official receipt: number, amount in words, months, method, approver, savings total, verification code. Download (print to PDF) and Share. |
| Investments & voting | Money invested, open proposals with live yes/no tally and the votes needed; vote or change your vote. |
| Withdraw | Leave the society or take out part of your savings, with deposits after costs (the admin works out the final amount); tracker and cancel until approved. |
| Payout receipt | The amount paid, deposits and cost share; confirm "I received ৳…" or report a problem. |
| Profile & nominee | Masked NID and nominee. Members edit their own date of birth, address, NID and nominee; changes apply only after the admin approves them (name and mobile number are changed by the admin). Account deletion (= full withdrawal, personal data erased after payout). |
| Notices | Meetings (add to calendar), votes, reminders and decisions; opening the page marks them read. |
| Asset documents / Society books | Read-only deeds and agreements by asset (watermarked downloads); open books of costs, and your own cost share. |
| Notifications | Approvals, rejections, receipts, votes, withdrawals, notices; turn on push for this phone. |
| Yearly statement | Deposits, cost share and savings after costs for a year, with a PDF. |
| Language | Bangla or English, on the login page or in My profile. |
| Check a receipt | Enter a receipt's code to confirm the society issued it. |

## Admin console (desktop, works on phones too)

| Screen | What it does |
|---|---|
| Dashboard | Fund balance, collection progress, approval queue with one-tap approve, unpaid members with WhatsApp reminder links, withdrawal requests, and members' detail edits (old → new) to approve or reject. |
| Review proof | The uploaded proof, payment details, a three-point checklist before approving, required message when rejecting, then on to the next proof. |
| Approvals | Pending / approved / rejected lists; undo or delete. |
| Members | Withdrawal requests, member list with status (Active, Behind, Exiting, Left, Removed, Deceased) and search, add member with joining rule and temporary password + WhatsApp invite. |
| Member detail | Profile and nominee, year payment grid, record a cash payment for several months (receipts issued), reset password, remove (opens a settlement), mark as deceased (opens a settlement to the nominee), restore. |
| Settlement | Settlement worked out from deposits, profit share, cost share and land gain (paid now or on sale); approve, decline, record the payout, issue the payout receipt. |
| Fund & expenses | Totals, expenses with receipts, monthly collection chart, add expense. |
| Investments | Cash, invested, profit, unrealised gain; votes in progress (close the vote → invest or reject, with a decision notice); per-investment valuation, profit payments, sell/close, documents; new proposal form with vote rule and cash check. |
| Income & FDRs | FDRs (a transfer, not a cost) with maturity, and income (bank interest, FDR profit, donations, late fees) shared as profit. |
| Close month | Enter each account's real balance; the difference must be zero, booked as a bank charge, or explained in a note; the month is then locked. |
| Notice board | Post meetings / reminders / decisions with attachments, share text for the WhatsApp group, read counts. |
| Asset documents | Upload with versions (nothing is deleted), "seen by" counts, filters. |
| Reports | Monthly report, annual summary, member statement, audit log and deposits grid — print to PDF, download CSV, share a summary with members. Draft until the month is closed. |
| Accounts & ledger | Each society account (bank, bKash/Nagad, cash, FDRs) with its balance, moving money between accounts, and every ledger entry. |
| Settings | Society rules, monthly amount changes from a future month, second-admin limit, reminders, connections (WhatsApp/SMS/push), export everything (Excel workbook + ZIP of files), admins and auditors, and an admin handover both admins confirm. |

## The calculations

Everything is a sum of the **ledger**: every taka that moves (deposit, expense,
income, investment out, capital back, payout, transfer between accounts) is one
entry naming the society account it moved through. Nothing is typed in as a total.

- **Deposits:** one payment per month. A month is paid once its payment is
  approved; a second payment for the same month is refused by the database.
  Paying several months at once makes one linked payment per month, each with its
  own receipt. The amount is the monthly rate in force for that month; a change
  of rate applies from a future month only.
- **Due / Behind:** months since the member's first month with no approved
  payment, at each month's rate.
- **Shares:** each expense and each profit (income, or the gain on a closed
  investment) is split, on its own date, among the members active that day, in
  paisa. Shares are shown rounded to the taka and the left-over paisa stay in
  the fund. "Start fresh" members share from their first month; "pay back"
  members become founding members once every back month is approved.
- **Cash** = deposits − expenses − invested + capital returned + income −
  payouts (+ opening balances). **Fund balance** = cash + money invested.
  Estimated land/share gains are shown separately and count only once sold.
- **Settlement** = deposits (less earlier withdrawals) + profit share − cost
  share (+ land share if paid now). It's frozen when approved.
- **Who sees profit:** only admins and the auditor. Members see their deposits,
  their cost share and the costs list, never income, profit shares, gains or
  the fund's cash balance; their payout receipt shows the amount paid without
  the profit line. A land share left
  "on sale" stays listed as owed until the land is sold and it's paid.
- **Corrections:** nothing is deleted. A mistaken approval, expense or income is
  reversed by an opposite entry with a reason (its receipt marked cancelled).
  Closed months are locked.

## Security & records

- Logins have a session record each. Changing or resetting a password signs out
  every other device. Five wrong passwords lock an account for 15 minutes.
  Admin sessions last 8 hours; admins also confirm a 6-digit WhatsApp code once
  WhatsApp is connected. An auditor role can read everything but change nothing.
- NID numbers, addresses, dates of birth and nominee details are encrypted in
  the database (AES-256-GCM, `DATA_KEY`).
- Proofs, statements and documents live outside `public/` in `storage/` and are
  served after a session check. Members see only their own proofs; members'
  document downloads go through `/docs/…`, which records "seen by" and stamps a
  watermark with the society's name, the member's name and the date.
- Payouts and investments above a limit need a second, different admin.
- The audit log records who, when, before/after values, IP and device, for
  approvals, reversals, edits, logins, lockouts and password resets.
- Members who left keep read-only access to their history and receipts for 12
  months.

## Messages, jobs and offline use

- WhatsApp (Cloud API, four approved templates) for admin login codes,
  temporary passwords, due reminders and rejections, with an SMS fallback.
  Without keys, the app logs them as skipped and shows ready-to-send links.
- Push notifications (web push) and an in-app notification list for approvals,
  rejections, receipts, votes, withdrawals, notices and documents.
- Scheduled jobs every 15 minutes (`deploy/dreamhive-jobs.timer` → `/api/cron`):
  votes close at their deadline and every member is told the result, due
  reminders go out on the reminder day, admins are reminded 7 days before an FDR
  matures, members with no nominee are flagged after 30 days, and expired
  sessions and codes are purged.
- A service worker shows the last copy of member pages offline. A payment
  submitted offline is saved on the phone and sent when the connection returns.
  Proof photos are shrunk to under 1 MB on the phone before upload.
- The member app is in **Bangla or English**; the member picks. The admin
  console is in English.

## Tests

`npm test` runs a test for each business rule in §4 of the specification and the
acceptance checks of §9.1 (on a throw-away database): pending payments change no
total, a repeat month is blocked, a three-month payment gives three receipts,
৳18,450 across 24 members is ৳769 each, ৳2,400 interest is ৳100 each, the worked
settlement is ৳92,106 (৳98,356 with land), a payout above cash is blocked, a
৳500 reconciliation difference blocks closing, and so on.

## Getting started

```bash
cd savings-society
npm install
cp .env.example .env        # set AUTH_SECRET to a long random string
npm run db:migrate          # creates prisma/dev.db and seeds demo data
npm run dev
```

- Admin: `01700000000` (or `admin@society.local`) / `ChangeMe123!`
- Demo member (Rahim Ahmed): `01711111111` / `Member123!` (all 24 demo members use `Member123!`)

Upgrading a database made by the first version: `npx prisma migrate deploy && npm run db:upgrade` (deploy/update.sh does this).

Set `SEED_DEMO=0` to skip the demo data, and change the admin password before real use.

## Deploying

See **[DEPLOY.md](DEPLOY.md)** for a step-by-step guide to running it on a VPS
with your own domain, HTTPS (Caddy) and nightly backups. The files it uses are in
[`deploy/`](deploy/): a systemd service, a Caddyfile, `backup.sh` and `update.sh`.
The database and uploads live outside the code (`DATABASE_URL`, `STORAGE_DIR`),
so updates never touch the society's records.

## Known limits

1. **WhatsApp and push need your own accounts.** The code is in place; they start
   working once the keys are in `.env` (DEPLOY.md). Until then, invites and
   reminders use ready-to-send WhatsApp links, and admin login has no code step.
2. **The Android app is the website in a Trusted Web Activity**, built with
   Bubblewrap from `manifest.json` (DEPLOY.md → Android app); there's no separate
   Flutter codebase. An iPhone uses the home-screen web app.
3. **Receipt PDFs are in English** (the standard PDF fonts have no Bangla); the
   on-screen receipt shows the amount in words in Bangla for Bangla users.
4. The Bangla text was written for this app; have a native speaker on the
   committee read it before launch.
