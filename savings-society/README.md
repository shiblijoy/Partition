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
| Home | Approved savings, cost share, net value, this month's status, recent approved payments, unread-notice dot. |
| Pay | Pick one or more months (amount worked out), method, transaction ID, proof photo/PDF, note. |
| History | Deposited / pending / due, every submission with its status, rejection reasons, receipt links, payouts. |
| Receipt | Official receipt: number, amount in words, months, method, approver, savings total, verification code. Download (print to PDF) and Share. |
| Investments & voting | Society totals, your profit share, open proposals with live yes/no tally and the votes needed; vote or change your vote. |
| Withdraw | Leave the society or take out part of your savings, with the estimated settlement; tracker and cancel until approved. |
| Payout receipt | The settlement breakdown; confirm "I received ৳…" or report a problem. |
| Profile & nominee | Masked NID and nominee. Members edit their own date of birth, address, NID and nominee; changes apply only after the admin approves them (name and mobile number are changed by the admin). Account deletion (= full withdrawal, personal data erased after payout). |
| Notices | Meetings (add to calendar), votes, reminders and decisions; opening the page marks them read. |
| Asset documents / Society books | Read-only deeds and agreements by asset; open books of income and costs. |
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
| Settings | Society rules, society accounts, export everything (Excel workbook + ZIP of files), add admins, and an admin handover both admins confirm. |

## The calculations

- **Expected / due**: months since the member's first month × the monthly
  amount, against their *approved* deposits. Money is applied oldest month first.
- **Profit** = recorded income + gain (or loss) on closed investments.
  **Costs** = expenses. Both are split equally across current members.
- **Fund balance** = deposits − costs + profit − payouts. **Cash** = fund
  balance − money currently invested. Estimated land/share gains are shown
  separately and only count once sold.
- **Settlement** = deposits (less earlier partial withdrawals) + profit share −
  cost share (+ land share if paid now). It's frozen when the admin approves.
  A member who leaves takes their share out of the profit and cost pools, so
  the rest is split across whoever remains.
- A member stops counting as soon as their settlement is paid; they keep their
  login until they confirm the payout.

## Security & records

- Proofs, statements and certificates live outside `public/` in `storage/`
  and are served by `/files/...` after a session check: members see only their
  own proofs; receipts, documents and notice attachments are open to members;
  statements are admin-only.
- Every server action re-checks the role; member IDs come from the session.
- Approvals only act on pending payments, so a double tap can't approve twice.
- Admin actions are written to an append-only **audit log**.
- Closed months are locked: expenses and income dated in them can't be added or deleted.

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

Set `SEED_DEMO=0` to skip the demo data, and change the admin password before real use.

## Deploying

See **[DEPLOY.md](DEPLOY.md)** for a step-by-step guide to running it on a VPS
with your own domain, HTTPS (Caddy) and nightly backups. The files it uses are in
[`deploy/`](deploy/): a systemd service, a Caddyfile, `backup.sh` and `update.sh`.
The database and uploads live outside the code (`DATABASE_URL`, `STORAGE_DIR`),
so updates never touch the society's records.

## Known limits

1. **No automatic WhatsApp/SMS.** Invites, reminders and notices open WhatsApp
   with the message ready (`wa.me` links); the admin taps send. The admin
   login's 6-digit WhatsApp code in the design needs a WhatsApp Business API
   account, so it isn't built yet.
2. **No QR code** on receipts yet — the verification code is printed instead.
3. Changing the monthly amount re-prices every month, including past ones.
4. Admins log in by email, so an admin can also keep a separate member account
   on their phone number.
