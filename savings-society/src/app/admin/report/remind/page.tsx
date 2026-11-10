import Link from "next/link";
import { requireStaff } from "@/lib/auth-guard";
import { getSettings, money } from "@/lib/settings";
import { membersWithLedgers } from "@/lib/society";
import { whatsappLink } from "@/lib/format";
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
                <p className="text-sm">Sends a reminder in the app and by push{whatsappConfigured() ? ", and on WhatsApp" : " (WhatsApp once it's connected)"}.</p>
              </ActionForm>
            )}
            <ul className="mt-4 flex flex-col">
              {owing.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 border-b border-[#EFEDE6] py-2 last:border-0">
                  <Link href={`/admin/members/${m.id}`} className="text-sm font-semibold text-ink">{m.name}</Link>
                  <span className="flex items-center gap-3">
                    <strong className="text-sm">{$(m.ledger.due)}</strong>
                    <a href={whatsappLink(m.phone, `Assalamu alaikum ${m.name.split(" ")[0]}, a reminder from ${settings.societyName}: you owe ${$(m.ledger.due)}. Please pay and upload the proof in the app.`)} target="_blank" rel="noopener noreferrer" className="text-[13px] font-bold">WhatsApp</a>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}
