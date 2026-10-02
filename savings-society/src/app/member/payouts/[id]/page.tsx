import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth-guard";
import { getSettings, money } from "@/lib/settings";
import { ScreenHeader, inputClass, primaryButton, secondaryButton } from "@/components/ui";
import { PayoutReceipt } from "@/components/PayoutReceipt";
import { ReceiptActions } from "@/components/ReceiptActions";
import { ActionForm } from "@/components/ActionForm";
import { confirmPayout, reportPayoutProblem } from "./actions";

export default async function PayoutPage({ params }: PageProps<"/member/payouts/[id]">) {
  const session = await requireMember();
  const { id } = await params;
  const [settings, withdrawal] = await Promise.all([
    getSettings(),
    prisma.withdrawal.findUnique({ where: { id }, include: { member: true } }),
  ]);
  if (!withdrawal || withdrawal.memberId !== session.userId) notFound();
  const payer = await prisma.auditLog.findFirst({
    where: { action: "payout.paid", detail: { contains: withdrawal.id } },
    include: { actor: { select: { name: true } } },
  });
  const awaiting = withdrawal.status === "PAID" && !withdrawal.memberConfirmedAt;

  return (
    <div className="flex flex-col gap-3">
      <div className="no-print"><ScreenHeader title="Payout receipt" back="/member/history" /></div>
      <PayoutReceipt withdrawal={withdrawal} member={withdrawal.member} settings={settings} paidBy={payer?.actor?.name ?? "Admin"} />
      {withdrawal.status !== "PAID" && <p className="text-sm text-muted">The admin hasn&apos;t sent the money yet. This receipt fills in once they do.</p>}
      {awaiting && (
        <div className="no-print flex flex-col gap-2">
          <form action={confirmPayout.bind(null, withdrawal.id)}>
            <button className={`h-13 w-full ${primaryButton}`}>I received {money(withdrawal.payable ?? 0, settings.currencySymbol)}</button>
          </form>
          <details>
            <summary className={`w-full cursor-pointer list-none ${secondaryButton}`}>Report a problem</summary>
            <ActionForm action={reportPayoutProblem.bind(null, withdrawal.id)} submitLabel="Send to admin" buttonClass={`w-full ${secondaryButton}`} className="mt-3 flex flex-col gap-3">
              <input name="problem" required aria-label="What's wrong?" placeholder="e.g. Money hasn't arrived yet" className={inputClass} />
            </ActionForm>
          </details>
        </div>
      )}
      {withdrawal.status === "PAID" && <ReceiptActions title={`${settings.societyName} payout ${withdrawal.receiptNo ?? ""}`} />}
    </div>
  );
}
