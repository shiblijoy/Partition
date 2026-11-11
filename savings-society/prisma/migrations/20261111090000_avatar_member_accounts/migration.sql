-- Profile pictures, bank details shown to members, and the account a member says they paid into.
ALTER TABLE "User" ADD COLUMN "avatarPath" TEXT;
ALTER TABLE "Account" ADD COLUMN "memberDetails" TEXT;
ALTER TABLE "Payment" ADD COLUMN "paidToId" TEXT;
