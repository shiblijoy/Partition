import { notFound } from "next/navigation";
import { getSettings } from "@/lib/settings";
import { PageHeader } from "@/components/ui";
import { DepositReceipt, loadReceipt } from "@/components/DepositReceipt";

export default async function AdminReceiptPage({ params }: PageProps<"/admin/receipts/[id]">) {
  const { id } = await params;
  const [settings, payment] = await Promise.all([getSettings(), loadReceipt(id)]);
  if (!payment || payment.status !== "APPROVED") notFound();

  return (
    <div className="mx-auto max-w-md">
      <div className="no-print">
        <PageHeader title="Deposit receipt" back={{ href: `/admin/members/${payment.memberId}`, label: payment.member.name }} />
      </div>
      <DepositReceipt payment={payment} settings={settings} />
    </div>
  );
}
