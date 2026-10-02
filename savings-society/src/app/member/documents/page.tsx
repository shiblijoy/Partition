import { prisma } from "@/lib/prisma";
import { requireMember } from "@/lib/auth-guard";
import { fmtDate } from "@/lib/format";
import { Icon } from "@/components/icons";
import { Pill, ScreenHeader, ASSET_LABELS, type Tone } from "@/components/ui";

const TONE: Record<string, Tone> = { LAND: "good", BUSINESS: "warn", SHARES: "neutral", SOCIETY: "brand" };

export default async function DocumentsPage() {
  await requireMember();
  const [investments, docs] = await Promise.all([
    prisma.investment.findMany({ where: { status: { in: ["ACTIVE", "CLOSED", "PROPOSED"] } }, orderBy: { createdAt: "asc" } }),
    prisma.document.findMany({ where: { replacedById: null }, orderBy: { createdAt: "desc" } }),
  ]);

  const groups = [
    ...investments.map((i) => ({ key: i.id, name: i.name, type: i.kind as string, docs: docs.filter((d) => d.investmentId === i.id) })),
    { key: "SHARES", name: "Company shares", type: "SHARES", docs: docs.filter((d) => d.assetType === "SHARES" && !d.investmentId) },
    { key: "SOCIETY", name: "Society papers", type: "SOCIETY", docs: docs.filter((d) => d.assetType === "SOCIETY") },
  ].filter((g) => g.docs.length > 0 || g.key === "SHARES" || g.key === "SOCIETY");

  return (
    <div className="flex flex-col gap-3">
      <ScreenHeader title="Asset documents" back="/member/invest" />
      <p className="text-[13px] leading-relaxed text-muted">Every deed, agreement and certificate for what the society owns. Uploaded by the admin; view and download only.</p>
      {groups.map((g, idx) => (
        <details key={g.key} open={idx === 0} className="rounded-2xl border border-line bg-white">
          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-2">
            <Pill tone={TONE[g.type]}>{ASSET_LABELS[g.type]}</Pill>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold">{g.name}</span>
              <span className="block text-xs text-muted">{g.docs.length === 0 ? "No documents yet" : `${g.docs.length} document${g.docs.length > 1 ? "s" : ""}`}</span>
            </span>
            <Icon name="chevron" size={18} />
          </summary>
          <div className="flex flex-col border-t border-[#EFEDE6]">
            {g.docs.length === 0 && (
              <p className="px-4 py-3 text-[13px] text-muted">
                {g.key === "SHARES" ? "No company shares bought yet. Share certificates and BO statements will appear here." : "Nothing uploaded yet."}
              </p>
            )}
            {g.docs.map((d) => (
              <div key={d.id} className="flex items-center gap-3 border-b border-[#EFEDE6] px-4 py-3 last:border-0">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-paper text-[10px] font-extrabold uppercase text-muted">
                  {d.filePath.split(".").pop()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold">{d.title}</div>
                  <div className="text-xs text-muted">{d.docType} · {fmtDate(d.createdAt)}{d.version > 1 && ` · v${d.version}`}</div>
                </div>
                <a href={`/docs/${d.id}`} target="_blank" rel="noopener noreferrer" className="flex h-11 items-center px-1 text-[13px] font-bold">View</a>
              </div>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}
