-- Keep what the old tables held that the new ones store differently. prisma/upgrade.ts turns
-- these into accounts, ledger entries, receipts and month slots, then drops them.
CREATE TABLE "_Legacy_Setting" AS SELECT "monthlyAmount", "cashAccounts", "startMonth" FROM "Setting";
CREATE TABLE "_Legacy_Fdr" AS SELECT * FROM "Fdr";
CREATE TABLE "_Legacy_Payment" AS SELECT "id", "monthsCount", "receiptNo", "verifyCode" FROM "Payment";
CREATE TABLE "_Legacy_Withdrawal" AS SELECT "id", "receiptNo" FROM "Withdrawal";
CREATE TABLE "_Legacy_Income" AS SELECT "id", "account" FROM "Income";

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN "after" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "before" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "device" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "entity" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "ip" TEXT;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Fdr";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "device" TEXT,
    "ip" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LoginCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoginCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MonthSlot" (
    "memberId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,

    PRIMARY KEY ("memberId", "month"),
    CONSTRAINT "MonthSlot_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MonthSlot_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "receiptNo" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "paymentId" TEXT,
    "withdrawalId" TEXT,
    "memberId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "verifyCode" TEXT NOT NULL,
    "issuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedBy" TEXT,
    "pdfPath" TEXT,
    "cancelledAt" DATETIME,
    "cancelReason" TEXT,
    CONSTRAINT "Receipt_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Receipt_withdrawalId_fkey" FOREIGN KEY ("withdrawalId") REFERENCES "Withdrawal" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Receipt_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "last4" TEXT,
    "openingBalance" INTEGER NOT NULL DEFAULT 0,
    "rate" REAL,
    "openedOn" DATETIME,
    "maturesOn" DATETIME,
    "closedOn" DATETIME,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "accountId" TEXT NOT NULL,
    "memberId" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "transferGroup" TEXT,
    "note" TEXT,
    "reversesId" TEXT,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LedgerEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LedgerEntry_reversesId_fkey" FOREIGN KEY ("reversesId") REFERENCES "LedgerEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Allocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "paisa" INTEGER NOT NULL,
    "date" DATETIME NOT NULL,
    "frozen" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Allocation_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Valuation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "investmentId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "date" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedBy" TEXT,
    CONSTRAINT "Valuation_investmentId_fkey" FOREIGN KEY ("investmentId") REFERENCES "Investment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "url" TEXT,
    "whatsapp" TEXT,
    "readAt" DATETIME,
    "pushedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MessageLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "to" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "providerId" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MonthlyRate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromMonth" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "JobRun" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "ranAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assetType" TEXT NOT NULL,
    "investmentId" TEXT,
    "docType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "docDate" DATETIME,
    "adminOnly" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "replacedById" TEXT,
    "filePath" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Document_investmentId_fkey" FOREIGN KEY ("investmentId") REFERENCES "Investment" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Document_replacedById_fkey" FOREIGN KEY ("replacedById") REFERENCES "Document" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Document" ("assetType", "createdAt", "docType", "filePath", "id", "investmentId", "replacedById", "title", "version") SELECT "assetType", "createdAt", "docType", "filePath", "id", "investmentId", "replacedById", "title", "version" FROM "Document";
DROP TABLE "Document";
ALTER TABLE "new_Document" RENAME TO "Document";
CREATE UNIQUE INDEX "Document_replacedById_key" ON "Document"("replacedById");
CREATE TABLE "new_Expense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "category" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "receiptPath" TEXT,
    "accountId" TEXT,
    "createdById" TEXT,
    "reversedAt" DATETIME,
    "reversalReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Expense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Expense" ("amount", "category", "createdAt", "createdById", "date", "description", "id", "receiptPath") SELECT CAST(ROUND("amount") AS INTEGER), "category", "createdAt", "createdById", "date", "description", "id", "receiptPath" FROM "Expense";
DROP TABLE "Expense";
ALTER TABLE "new_Expense" RENAME TO "Expense";
CREATE INDEX "Expense_date_idx" ON "Expense"("date");
CREATE TABLE "new_Income" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "date" DATETIME NOT NULL,
    "accountId" TEXT,
    "description" TEXT NOT NULL,
    "filePath" TEXT,
    "investmentId" TEXT,
    "reversedAt" DATETIME,
    "reversalReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Income_investmentId_fkey" FOREIGN KEY ("investmentId") REFERENCES "Investment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Income" ("amount", "createdAt", "date", "description", "filePath", "id", "investmentId", "kind") SELECT CAST(ROUND("amount") AS INTEGER), "createdAt", "date", "description", "filePath", "id", "investmentId", "kind" FROM "Income";
DROP TABLE "Income";
ALTER TABLE "new_Income" RENAME TO "Income";
CREATE INDEX "Income_date_idx" ON "Income"("date");
CREATE TABLE "new_Investment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "details" TEXT,
    "plan" TEXT,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "voteRule" TEXT NOT NULL DEFAULT 'MAJORITY',
    "voteEndsAt" DATETIME,
    "voteClosedAt" DATETIME,
    "currentValue" INTEGER,
    "accountId" TEXT,
    "startedAt" DATETIME,
    "closedAt" DATETIME,
    "returnedAmount" INTEGER,
    "firstApprover" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Investment" ("amount", "closedAt", "createdAt", "currentValue", "details", "id", "kind", "name", "plan", "returnedAmount", "startedAt", "status", "voteEndsAt", "voteRule") SELECT CAST(ROUND("amount") AS INTEGER), "closedAt", "createdAt", CAST(ROUND("currentValue") AS INTEGER), "details", "id", "kind", "name", "plan", CAST(ROUND("returnedAmount") AS INTEGER), "startedAt", "status", "voteEndsAt", "voteRule" FROM "Investment";
DROP TABLE "Investment";
ALTER TABLE "new_Investment" RENAME TO "Investment";
CREATE TABLE "new_MonthClose" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "month" TEXT NOT NULL,
    "appBalance" INTEGER NOT NULL,
    "note" TEXT,
    "closedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedBy" TEXT NOT NULL
);
INSERT INTO "new_MonthClose" ("appBalance", "closedAt", "closedBy", "id", "month", "note") SELECT CAST(ROUND("appBalance") AS INTEGER), "closedAt", "closedBy", "id", "month", "note" FROM "MonthClose";
DROP TABLE "MonthClose";
ALTER TABLE "new_MonthClose" RENAME TO "MonthClose";
CREATE UNIQUE INDEX "MonthClose_month_key" ON "MonthClose"("month");
CREATE TABLE "new_Notice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "eventAt" DATETIME,
    "place" TEXT,
    "attachmentPath" TEXT,
    "minutes" TEXT,
    "investmentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notice_investmentId_fkey" FOREIGN KEY ("investmentId") REFERENCES "Investment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Notice" ("attachmentPath", "body", "createdAt", "eventAt", "id", "kind", "place", "title") SELECT "attachmentPath", "body", "createdAt", "eventAt", "id", "kind", "place", "title" FROM "Notice";
DROP TABLE "Notice";
ALTER TABLE "new_Notice" RENAME TO "Notice";
CREATE TABLE "new_Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "memberId" TEXT NOT NULL,
    "forMonth" TEXT NOT NULL,
    "batchId" TEXT,
    "amount" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "paidOn" DATETIME NOT NULL,
    "receivedOn" DATETIME,
    "accountId" TEXT,
    "proofPath" TEXT,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "recordedBy" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" DATETIME,
    "reviewNote" TEXT,
    "reversedAt" DATETIME,
    "reversalReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payment_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Payment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Payment_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Payment" ("amount", "createdAt", "forMonth", "id", "memberId", "method", "note", "paidOn", "proofPath", "reference", "reviewNote", "reviewedAt", "reviewedById", "status") SELECT CAST(ROUND("amount") AS INTEGER), "createdAt", "forMonth", "id", "memberId", "method", "note", "paidOn", "proofPath", "reference", "reviewNote", "reviewedAt", "reviewedById", "status" FROM "Payment";
DROP TABLE "Payment";
ALTER TABLE "new_Payment" RENAME TO "Payment";
CREATE INDEX "Payment_memberId_idx" ON "Payment"("memberId");
CREATE INDEX "Payment_status_idx" ON "Payment"("status");
CREATE INDEX "Payment_batchId_idx" ON "Payment"("batchId");
CREATE INDEX "Payment_reference_idx" ON "Payment"("reference");
CREATE TABLE "new_ReconLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "monthCloseId" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "accountId" TEXT,
    "calculated" INTEGER NOT NULL DEFAULT 0,
    "actual" INTEGER NOT NULL,
    "note" TEXT,
    "statementPath" TEXT,
    CONSTRAINT "ReconLine_monthCloseId_fkey" FOREIGN KEY ("monthCloseId") REFERENCES "MonthClose" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReconLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ReconLine" ("account", "actual", "id", "monthCloseId", "statementPath") SELECT "account", CAST(ROUND("actual") AS INTEGER), "id", "monthCloseId", "statementPath" FROM "ReconLine";
DROP TABLE "ReconLine";
ALTER TABLE "new_ReconLine" RENAME TO "ReconLine";
CREATE TABLE "new_Setting" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "societyName" TEXT NOT NULL DEFAULT 'Dreamhive',
    "currencySymbol" TEXT NOT NULL DEFAULT '৳',
    "startMonth" TEXT NOT NULL,
    "paymentInfo" TEXT,
    "reminderDay" INTEGER NOT NULL DEFAULT 10,
    "remindersOn" BOOLEAN NOT NULL DEFAULT true,
    "defaultVoteRule" TEXT NOT NULL DEFAULT 'MAJORITY',
    "dualApprovalLimit" INTEGER,
    "lastExportAt" DATETIME,
    "dataVersion" INTEGER NOT NULL DEFAULT 2
);
INSERT INTO "new_Setting" ("currencySymbol", "defaultVoteRule", "id", "lastExportAt", "paymentInfo", "reminderDay", "societyName", "startMonth", "dataVersion") SELECT "currencySymbol", "defaultVoteRule", "id", "lastExportAt", "paymentInfo", "reminderDay", "societyName", "startMonth", 1 FROM "Setting";
DROP TABLE "Setting";
ALTER TABLE "new_Setting" RENAME TO "Setting";
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "memberNo" INTEGER,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "contactPhone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "passwordChangedAt" DATETIME,
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "joinMonth" TEXT NOT NULL,
    "joiningRule" TEXT NOT NULL DEFAULT 'FRESH',
    "caughtUpAt" DATETIME,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "exit" TEXT,
    "exitedAt" DATETIME,
    "deceasedOn" DATETIME,
    "language" TEXT NOT NULL DEFAULT 'en',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nid" TEXT,
    "dateOfBirth" TEXT,
    "address" TEXT,
    "nomineeName" TEXT,
    "nomineeRelation" TEXT,
    "nomineePhone" TEXT,
    "nomineeNid" TEXT
);
INSERT INTO "new_User" ("active", "address", "createdAt", "dateOfBirth", "email", "exit", "exitedAt", "id", "joinMonth", "memberNo", "mustChangePassword", "name", "nid", "nomineeName", "nomineeNid", "nomineePhone", "nomineeRelation", "passwordChangedAt", "passwordHash", "phone", "role") SELECT "active", "address", "createdAt", "dateOfBirth", "email", "exit", "exitedAt", "id", "joinMonth", "memberNo", "mustChangePassword", "name", "nid", "nomineeName", "nomineeNid", "nomineePhone", "nomineeRelation", "passwordChangedAt", "passwordHash", "phone", "role" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_memberNo_key" ON "User"("memberNo");
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE TABLE "new_Withdrawal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "memberId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "amount" INTEGER,
    "payTo" TEXT NOT NULL,
    "reason" TEXT,
    "eraseData" BOOLEAN NOT NULL DEFAULT false,
    "exitAs" TEXT,
    "attachmentPath" TEXT,
    "deposits" INTEGER,
    "profitShare" INTEGER,
    "costShare" INTEGER,
    "landShare" INTEGER,
    "landTiming" TEXT,
    "payable" INTEGER,
    "firstApprover" TEXT,
    "approvedBy" TEXT,
    "approvedAt" DATETIME,
    "accountId" TEXT,
    "paidAt" DATETIME,
    "paidBy" TEXT,
    "paidReference" TEXT,
    "memberConfirmedAt" DATETIME,
    "problemNote" TEXT,
    "adminNote" TEXT,
    "parentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Withdrawal_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Withdrawal" ("adminNote", "amount", "approvedAt", "attachmentPath", "costShare", "createdAt", "deposits", "eraseData", "exitAs", "id", "kind", "landShare", "landTiming", "memberConfirmedAt", "memberId", "paidAt", "paidReference", "payTo", "payable", "problemNote", "profitShare", "reason", "status") SELECT "adminNote", CAST(ROUND("amount") AS INTEGER), "approvedAt", "attachmentPath", CAST(ROUND("costShare") AS INTEGER), "createdAt", CAST(ROUND("deposits") AS INTEGER), "eraseData", "exitAs", "id", "kind", CAST(ROUND("landShare") AS INTEGER), "landTiming", "memberConfirmedAt", "memberId", "paidAt", "paidReference", "payTo", CAST(ROUND("payable") AS INTEGER), "problemNote", CAST(ROUND("profitShare") AS INTEGER), "reason", "status" FROM "Withdrawal";
DROP TABLE "Withdrawal";
ALTER TABLE "new_Withdrawal" RENAME TO "Withdrawal";
CREATE INDEX "Withdrawal_memberId_idx" ON "Withdrawal"("memberId");
CREATE INDEX "Withdrawal_status_idx" ON "Withdrawal"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "LoginCode_userId_createdAt_idx" ON "LoginCode"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MonthSlot_paymentId_key" ON "MonthSlot"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_receiptNo_key" ON "Receipt"("receiptNo");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_paymentId_key" ON "Receipt"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_withdrawalId_key" ON "Receipt"("withdrawalId");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_verifyCode_key" ON "Receipt"("verifyCode");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEntry_reversesId_key" ON "LedgerEntry"("reversesId");

-- CreateIndex
CREATE INDEX "LedgerEntry_date_idx" ON "LedgerEntry"("date");

-- CreateIndex
CREATE INDEX "LedgerEntry_sourceType_sourceId_idx" ON "LedgerEntry"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "LedgerEntry_accountId_idx" ON "LedgerEntry"("accountId");

-- CreateIndex
CREATE INDEX "Allocation_memberId_idx" ON "Allocation"("memberId");

-- CreateIndex
CREATE INDEX "Allocation_sourceType_sourceId_idx" ON "Allocation"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_pushedAt_idx" ON "Notification"("pushedAt");

-- CreateIndex
CREATE INDEX "MessageLog_createdAt_idx" ON "MessageLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyRate_fromMonth_key" ON "MonthlyRate"("fromMonth");


-- Monthly amount history starts with the amount the old settings held.
INSERT INTO "MonthlyRate" ("id", "fromMonth", "amount", "createdAt") SELECT 'rate_' || lower(hex(randomblob(8))), "startMonth", CAST(ROUND("monthlyAmount") AS INTEGER), CAST(strftime('%s','now') AS INTEGER) * 1000 FROM "_Legacy_Setting";
