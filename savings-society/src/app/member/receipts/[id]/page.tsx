import { notFound } from "next/navigation";
import { requireMember } from "@/lib/auth-guard";
import { getSettings } from "@/lib/settings";
import { tFor } from "@/lib/i18n";
import { ScreenHeader } from "@/components/ui";
import { DepositReceipt, loadReceipt } from "@/components/DepositReceipt";

export default async function ReceiptPage({ params }: PageProps<"/member/receipts/[id]">) {
  const viewer = await requireMember();
  const { id } = await params;
  const [settings, payment] = await Promise.all([getSettings(), loadReceipt(id)]);
  if (!payment || payment.memberId !== viewer.userId || !payment.receipt) notFound();

  return (
    <div>
      <div className="no-print"><ScreenHeader title={tFor(viewer.language)("Receipt")} back="/member/history" /></div>
      <DepositReceipt payment={payment} settings={settings} lang={viewer.language} />
    </div>
  );
}
