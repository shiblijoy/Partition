import { notFound } from "next/navigation";
import { requireMember } from "@/lib/auth-guard";
import { getSettings } from "@/lib/settings";
import { ScreenHeader } from "@/components/ui";
import { DepositReceipt, loadReceipt } from "@/components/DepositReceipt";

export default async function ReceiptPage({ params }: PageProps<"/member/receipts/[id]">) {
  const session = await requireMember();
  const { id } = await params;
  const [settings, payment] = await Promise.all([getSettings(), loadReceipt(id)]);
  if (!payment || payment.memberId !== session.userId || payment.status !== "APPROVED") notFound();

  return (
    <div>
      <div className="no-print"><ScreenHeader title="Receipt" back="/member/history" /></div>
      <DepositReceipt payment={payment} settings={settings} />
    </div>
  );
}
