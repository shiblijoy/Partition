import Link from "next/link";
import { requireStaff } from "@/lib/auth-guard";
import { getSettings, money } from "@/lib/settings";
import { membersWithLedgers } from "@/lib/society";
import { whatsappConfigured } from "@/lib/messaging";
import { ActionForm } from "@/components/ActionForm";
import { Card, Empty, PageHeader } from "@/components/ui";
import { remindAll } from "@/app/admin/members/actions";

/** FR-DSH-04: remind one or all unpaid members. */
export default async function RemindPage() {
  const viewer = await requireStaff();
  const settings = await getSettings();
  const owing = (await membersWithLedgers(settings)).filter((m) => m.ledger.due > 0);
  const $ = (n: number) => money(n, settings.currencySymbol);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Remind members who owe" back={{ href: "/admin", label: "Dashboard" }} />
      <Card>
        {owing.length === 0 ? (
          <Empty>Everyone is up to date.</Empty>
        ) : (
          <>
            {viewer.role === "ADMIN" && (
              <ActionForm action={remindAll} submitLabel={`Remind all ${owing.length}`}>
                <p className="text-sm">Sends a reminder in the app and as a push notification (with sound){whatsappConfigured() ? ", and on WhatsApp" : ""}.</p>
              </ActionForm>
            )}
            <ul className="mt-4 flex flex-col">
              {owing.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 border-b border-[#EFEDE6] py-2 last:border-0">
                  <Link href={`/admin/members/${m.id}`} className="text-sm font-semibold text-ink">{m.name}</Link>
                  <strong className="text-sm">{$(m.ledger.due)}</strong>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}
