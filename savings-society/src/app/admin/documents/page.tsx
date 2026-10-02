import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { fundSummary } from "@/lib/society";
import { fmtDay } from "@/lib/format";
import { ActionForm } from "@/components/ActionForm";
import { Card, Empty, PageHeader, Pill, fileClass, inputClass, labelClass, ASSET_LABELS, INVESTMENT_KIND_LABELS, type Tone } from "@/components/ui";
import { uploadDocument } from "./actions";

const FILTERS = ["ALL", "LAND", "BUSINESS", "SHARES", "SOCIETY"] as const;
const TONE: Record<string, Tone> = { LAND: "good", BUSINESS: "warn", SHARES: "neutral", SOCIETY: "brand" };
const DOC_TYPES = [
  "Land tax receipt",
  "Sale deed (dalil)",
  "Khatian",
  "Mutation (namjari)",
  "Survey map",
  "Agreement",
  "Trade licence",
  "Profit statement",
  "Share certificate",
  "BO account statement",
  "Purchase confirmation",
  "Constitution (bylaws)",
  "Bank account document",
  "Meeting minutes",
  "Other",
];

export default async function AdminDocumentsPage({ searchParams }: PageProps<"/admin/documents">) {
  const { filter: raw, investment } = await searchParams;
  const filter = FILTERS.includes(raw as (typeof FILTERS)[number]) ? (raw as string) : "ALL";
  const [investments, docs, fund] = await Promise.all([
    prisma.investment.findMany({ where: { status: { not: "REJECTED" } }, orderBy: { createdAt: "asc" } }),
    prisma.document.findMany({
      where: { replacedById: null },
      include: { investment: { select: { name: true } }, replaces: true, _count: { select: { views: { where: { user: { role: "MEMBER" } } } } } },
      orderBy: { createdAt: "desc" },
    }),
    fundSummary(),
  ]);
  const rows = docs.filter((d) => (filter === "ALL" || d.assetType === filter) && (!investment || d.investmentId === investment));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Asset documents"
        subtitle="Deeds, agreements, share certificates and society papers. Every member can view them in the app; nothing is ever deleted — a new version replaces the old one."
        back={{ href: "/admin", label: "Dashboard" }}
      />
      <div className="flex flex-wrap items-start gap-6">
        <Card title="Upload a document" className="flex-[1_1_340px]">
          <ActionForm action={uploadDocument} submitLabel="Upload document">
            <div>
              <label htmlFor="d-asset" className={labelClass}>Asset</label>
              <select id="d-asset" name="asset" defaultValue={investment ?? investments[0]?.id ?? "SOCIETY"} className={inputClass}>
                {investments.map((i) => <option key={i.id} value={i.id}>{i.name} ({INVESTMENT_KIND_LABELS[i.kind].toLowerCase()})</option>)}
                <option value="SHARES">Company shares (not yet an investment)</option>
                <option value="SOCIETY">Society papers</option>
              </select>
            </div>
            <div>
              <label htmlFor="d-type" className={labelClass}>Document type</label>
              <select id="d-type" name="docType" className={inputClass}>
                {DOC_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="d-title" className={labelClass}>Title</label>
              <input id="d-title" name="title" required placeholder="e.g. Land tax receipt 2027" className={inputClass} />
            </div>
            <div>
              <label htmlFor="d-replaces" className={labelClass}>Replaces</label>
              <select id="d-replaces" name="replaces" className={inputClass}>
                <option value="">Nothing — new document</option>
                {docs.map((d) => <option key={d.id} value={d.id}>{d.title} (v{d.version})</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="d-file" className={labelClass}>File · PDF, JPG or PNG, up to 20 MB</label>
              <input id="d-file" name="file" type="file" required accept="image/jpeg,image/png,image/webp,application/pdf" className={fileClass} />
            </div>
            <label className="flex min-h-11 items-center gap-3 text-sm font-semibold">
              <input type="checkbox" name="whatsapp" className="h-5 w-5 accent-brand" />
              Tell members on WhatsApp
            </label>
          </ActionForm>
        </Card>

        <div className="flex min-w-0 flex-[3_1_560px] flex-col gap-4">
          <nav className="flex flex-wrap gap-2" aria-label="Filter documents">
            {FILTERS.map((f) => (
              <Link
                key={f}
                href={`/admin/documents?filter=${f}`}
                aria-current={f === filter ? "page" : undefined}
                className={`flex h-10 items-center rounded-full px-4 text-[13px] no-underline ${f === filter && !investment ? "bg-ink font-bold text-white" : "border border-field bg-white font-semibold text-muted"}`}
              >
                {f === "ALL" ? "All" : ASSET_LABELS[f]}
              </Link>
            ))}
          </nav>
          <Card>
            {rows.length === 0 ? (
              <Empty>
                {filter === "SHARES" ? "No documents yet. When the society buys company shares, upload the share certificate and BO account statement here." : "No documents yet."}
              </Empty>
            ) : (
              <div className="-mx-4 overflow-x-auto sm:mx-0">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs font-bold text-muted">
                      <th className="px-4 py-2.5 sm:px-2">Asset</th>
                      <th className="px-2 py-2.5">Document</th>
                      <th className="px-2 py-2.5">Ver.</th>
                      <th className="px-2 py-2.5">Uploaded</th>
                      <th className="px-2 py-2.5">Seen by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((d) => (
                      <tr key={d.id} className="border-b border-[#EFEDE6]">
                        <td className="px-4 py-3 sm:px-2">
                          <Pill tone={TONE[d.assetType]}>{ASSET_LABELS[d.assetType]}</Pill>
                          <div className="mt-1 text-xs text-muted">{d.investment?.name ?? (d.assetType === "SOCIETY" ? "Society" : "—")}</div>
                        </td>
                        <td className="px-2 py-3">
                          <a href={`/docs/${d.id}`} target="_blank" rel="noopener noreferrer" className="font-bold">{d.title}</a>
                          <div className="text-xs text-muted">{d.docType}{d.replaces && ` · replaces v${d.replaces.version}`}</div>
                        </td>
                        <td className="px-2 py-3">v{d.version}</td>
                        <td className="px-2 py-3 text-muted">{fmtDay(d.createdAt)}</td>
                        <td className="px-2 py-3">{d._count.views} / {fund.activeMembers}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
