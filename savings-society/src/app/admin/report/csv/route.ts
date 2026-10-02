import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { buildReport } from "../data";

function csvCell(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/** Member accounts + month-by-month status as a spreadsheet-friendly CSV. */
export async function GET() {
  const session = await getSession();
  const user = session && (await prisma.user.findUnique({ where: { id: session.userId } }));
  if (!user || !user.active || user.role !== "ADMIN") return new Response("Forbidden", { status: 403 });

  const { months, members, fund } = await buildReport(120);
  const header = ["Member", "Phone", "Deposited", "Expected", "Due", "Paid ahead", "Cost share", "Net savings", ...months];
  const rows = members.map((m) => [
    m.name,
    m.phone,
    m.ledger.paid,
    m.ledger.expected,
    m.ledger.due,
    m.ledger.advance,
    Math.round(fund.expenseSharePerMember * 100) / 100,
    Math.round((m.ledger.paid - fund.expenseSharePerMember) * 100) / 100,
    ...months.map((month) => m.ledger.statusFor(month)),
  ]);
  const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");

  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="society-report-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
