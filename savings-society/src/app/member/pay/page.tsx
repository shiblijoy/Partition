import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth-guard";
import { getSettings, money } from "@/lib/settings";
import { ledgerFor } from "@/lib/society";
import { openMonths } from "@/lib/services/payments";
import { rateFor } from "@/lib/rates";
import { dateInput } from "@/lib/format";
import { tFor, monthName } from "@/lib/i18n";
import { Notice, ScreenHeader } from "@/components/ui";
import { PayForm } from "./PayForm";

export default async function PayPage() {
  const viewer = await requireMember();
  const t = tFor(viewer.language);
  const settings = await getSettings();
  if (viewer.readOnly) {
    return (
      <div>
        <ScreenHeader title={t("Submit payment")} back="/member" />
        <Notice tone="neutral">{t("Your membership has ended, so your account is read-only.")}</Notice>
      </div>
    );
  }
  const [ledger, open, banks] = await Promise.all([
    ledgerFor(viewer.userId, settings),
    openMonths(viewer.userId, settings),
    // The society bank accounts members can pay into: open, with details for members.
    prisma.account.findMany({ where: { active: true, type: "BANK", memberDetails: { not: null } }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, memberDetails: true } }),
  ]);
  // FR-PAY-01/07: every unpaid month since joining plus up to 12 months ahead, never one already pending or approved.
  const months = open.map((key) => ({ key, label: monthName(key, viewer.language), due: ledger.statusFor(key) === "due", amount: rateFor(key, settings.rates) }));

  return (
    <div>
      <ScreenHeader title={t("Submit payment")} back="/member" />
      <PayForm
        months={months}
        currency={settings.currencySymbol}
        monthlyLabel={money(settings.monthlyAmount, settings.currencySymbol)}
        paymentInfo={settings.paymentInfo}
        banks={banks.map((b) => ({ id: b.id, name: b.name, details: b.memberDetails ?? "" }))}
        today={dateInput()}
      />
    </div>
  );
}
