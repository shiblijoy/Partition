import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { PrismaClient, PaymentMethod } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import { addMonths, currentMonth, monthRange } from "../src/lib/months";
import { newVerifyCode } from "../src/lib/receipts";

const prisma = new PrismaClient();
const STORAGE = path.join(process.cwd(), "storage");

/** A one-page placeholder PDF, so demo documents open. */
async function placeholderPdf(title: string, folder = "documents"): Promise<string> {
  const text = `${title} (demo placeholder)`.replace(/[()\\]/g, "");
  const stream = `BT /F1 18 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  await mkdir(path.join(STORAGE, folder), { recursive: true });
  const rel = `${folder}/${randomUUID()}.pdf`;
  await writeFile(path.join(STORAGE, rel), pdf);
  return rel;
}

const day = (month: string, d: number, h = 10) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, d, h);
};

async function main() {
  const adminPhone = process.env.SEED_ADMIN_PHONE ?? "01700000000";
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@society.local";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";
  const now = currentMonth();
  const startMonth = addMonths(now, -9);

  await prisma.setting.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      societyName: "Dreamhive",
      monthlyAmount: 10000,
      currencySymbol: "৳",
      startMonth,
      paymentInfo: "bKash (society): 01XXXXXXXXX\nBank: [Bank], A/C [number]",
      cashAccounts: "[Bank] savings ••XXXX\nbKash (society number)\nCash with treasurer",
    },
  });

  const admin = await prisma.user.upsert({
    where: { phone: adminPhone },
    update: {},
    create: { name: "[Admin name]", phone: adminPhone, email: adminEmail, passwordHash: await hashPassword(adminPassword), role: "ADMIN", joinMonth: startMonth },
  });

  if ((await prisma.user.count({ where: { role: "MEMBER" } })) > 0 || process.env.SEED_DEMO === "0") {
    console.log("Skipping demo data.");
  } else {
    const password = await hashPassword("Member123!");
    const names = [
      "Sabbir Rahman", "Nusrat Jahan", "Kamal Hossain", "Mitu Chowdhury", "Farhana Akter", "Tanvir Islam", "Rahim Ahmed", "Shirin Sultana",
      "Jahid Karim", "Rumana Begum", "Faisal Mahmud", "Arif Hasan", "Sadia Islam", "Imran Kabir", "Nasima Khatun", "Rafiq Uddin",
      "Tahmina Akter", "Mahbub Alam", "Shapla Rani", "Hasan Ali", "Lipi Das", "Monir Hossain", "Ruma Akter", "Zahid Hasan",
    ];
    const months = monthRange(startMonth, addMonths(now, -1)); // everyone paid up to last month…
    const behind: Record<string, number> = { "Mitu Chowdhury": 1 }; // …except Mitu, one month short
    const pendingNow = ["Rahim Ahmed", "Nusrat Jahan", "Kamal Hossain", "Farhana Akter", "Tanvir Islam"];
    const unpaidNow = ["Sabbir Rahman", "Mitu Chowdhury", "Arif Hasan", "Shirin Sultana", "Jahid Karim"];
    const methods: PaymentMethod[] = ["BKASH", "BANK", "BKASH", "NAGAD"];
    let receipt = 0;
    const receiptNo = (month: string) => `DH-${month.slice(2, 4)}${month.slice(5)}-${String(++receipt).padStart(3, "0")}`;

    for (const [i, name] of names.entries()) {
      const phone = `01${String(711 + i * 101).slice(-3)}${String(100000 + i * 7919).slice(-6)}`;
      const member = await prisma.user.create({
        data: {
          name,
          phone: name === "Rahim Ahmed" ? "01711111111" : phone,
          memberNo: i + 1,
          passwordHash: password,
          role: "MEMBER",
          joinMonth: startMonth,
          nid: `19${String(8800000000000 + i * 1234567).slice(0, 11)}`,
          dateOfBirth: "[DD Mon YYYY]",
          address: "[House, Road, Area, City]",
          nomineeName: "[Nominee name]",
          nomineeRelation: i % 2 ? "Wife" : "Husband",
          nomineePhone: "01XXX-XXXXXX",
          nomineeNid: `19${String(7700000000000 + i * 7654321).slice(0, 11)}`,
        },
      });
      const paidMonths = months.slice(0, months.length - (behind[name] ?? 0));
      for (const [k, month] of paidMonths.entries()) {
        const rejectedFirst = name === "Rahim Ahmed" && k === 5;
        if (rejectedFirst) {
          await prisma.payment.create({
            data: {
              memberId: member.id, forMonth: month, amount: 10000, method: "BANK", reference: "SLIP-2291", paidOn: day(month, 5),
              status: "REJECTED", reviewedById: admin.id, reviewedAt: day(month, 6),
              reviewNote: "Amount not found in society account. Please resubmit with the bank slip.", createdAt: day(month, 5),
            },
          });
        }
        await prisma.payment.create({
          data: {
            memberId: member.id, forMonth: month, amount: 10000, method: methods[(i + k) % methods.length],
            reference: `${(i * 31 + k * 7).toString(36).toUpperCase()}${month.replace("-", "")}X`, paidOn: day(month, rejectedFirst ? 8 : 3 + (i % 5)),
            status: "APPROVED", reviewedById: admin.id, reviewedAt: day(month, rejectedFirst ? 9 : 4 + (i % 5)),
            receiptNo: receiptNo(month), verifyCode: newVerifyCode(), createdAt: day(month, 3 + (i % 5)),
          },
        });
      }
      if (pendingNow.includes(name)) {
        await prisma.payment.create({
          data: {
            memberId: member.id, forMonth: now, amount: 10000, method: name === "Rahim Ahmed" ? "BKASH" : methods[i % 4],
            reference: name === "Rahim Ahmed" ? "8KJ2M4XQ7P" : `PND${i}${now.replace("-", "")}`, paidOn: new Date(),
            proofPath: await placeholderPdf(`Payment screenshot from ${name}`, `proofs/${member.id}`), note: name === "Farhana Akter" ? "Cash given to treasurer, receipt #112" : null,
          },
        });
      } else if (!unpaidNow.includes(name)) {
        await prisma.payment.create({
          data: {
            memberId: member.id, forMonth: now, amount: 10000, method: methods[i % 4], reference: `NOW${i}${now.replace("-", "")}`, paidOn: day(now, 1),
            status: "APPROVED", reviewedById: admin.id, reviewedAt: day(now, 1, 18), receiptNo: receiptNo(now), verifyCode: newVerifyCode(),
          },
        });
      }
      if (name === "Arif Hasan") {
        await prisma.withdrawal.create({ data: { memberId: member.id, kind: "FULL", payTo: `bKash ${member.phone}`, reason: "Moving abroad", createdAt: day(now, 1) } });
      }
    }

    // Expenses
    await prisma.expense.createMany({
      data: [
        { date: day(startMonth, 10), category: "LEGAL", amount: 2500, description: "Account opening & stamps", createdById: admin.id },
        { date: day(addMonths(startMonth, 2), 15), category: "BANK_CHARGE", amount: 575, description: "Account maintenance fee", createdById: admin.id },
        { date: day(addMonths(startMonth, 6), 12), category: "STATIONERY", amount: 3600, description: "Member passbooks (24)", createdById: admin.id },
        ...monthRange(startMonth, addMonths(now, -1)).map((m) => ({ date: day(m, 27), category: "MEETING" as const, amount: 1100, description: "Monthly meeting refreshments", createdById: admin.id })),
        { date: day(addMonths(now, -1), 15), category: "BANK_CHARGE", amount: 575, description: "Account maintenance fee", createdById: admin.id },
      ],
    });

    // Investments
    const land = await prisma.investment.create({
      data: {
        kind: "LAND", name: "5 katha plot, [Location]", details: "Registered in society name · deed no. [____]", plan: "Hold, sell or build",
        amount: 1200000, status: "ACTIVE", voteRule: "TWO_THIRDS", startedAt: day(addMonths(startMonth, 3), 15), currentValue: 1350000,
      },
    });
    const farm = await prisma.investment.create({
      data: { kind: "BUSINESS", name: "[Partner] poultry farm", details: "Monthly payout", plan: "30% of monthly profit", amount: 500000, status: "ACTIVE", startedAt: day(addMonths(startMonth, 5), 1) },
    });
    const shop = await prisma.investment.create({
      data: {
        kind: "BUSINESS", name: "[Shop name] stock financing", details: "3-month term", plan: "12% fixed profit",
        amount: 200000, status: "CLOSED", startedAt: day(addMonths(startMonth, 2), 1), closedAt: day(addMonths(startMonth, 5), 1), returnedAmount: 224000,
      },
    });
    const proposal = await prisma.investment.create({
      data: { kind: "LAND", name: "Buy 3 katha land, [Location]", plan: "Hold 3 years", amount: 600000, voteRule: "MAJORITY", voteEndsAt: day(now, 9, 23) },
    });
    const members = await prisma.user.findMany({ where: { role: "MEMBER" }, orderBy: { memberNo: "asc" } });
    for (const [i, m] of members.slice(0, 11).entries()) {
      if (m.name === "Rahim Ahmed") continue;
      await prisma.vote.create({ data: { investmentId: proposal.id, memberId: m.id, choice: i % 5 === 4 ? "NO" : "YES" } });
    }

    // Income
    for (const m of monthRange(addMonths(startMonth, 6), addMonths(now, -1))) {
      await prisma.income.create({ data: { kind: "INVESTMENT_PROFIT", amount: 15000, date: day(m, 28), investmentId: farm.id, description: `Profit from ${farm.name}`, account: "[Bank] savings ••XXXX" } });
    }
    await prisma.income.create({ data: { kind: "BANK_INTEREST", amount: 2400, date: day(addMonths(now, -1), 28), account: "[Bank] savings ••XXXX", description: "Bank interest, last quarter" } });
    await prisma.fdr.create({ data: { bank: "[Bank] FDR · 6 months", amount: 300000, openedOn: day(addMonths(now, -3), 15), maturesOn: day(addMonths(now, 3), 15) } });

    // Documents
    const docs: Array<[string, string, string | null, "LAND" | "BUSINESS" | "SOCIETY"]> = [
      ["Sale deed (dalil)", "Sale deed (dalil)", land.id, "LAND"],
      ["Khatian", "Khatian (record of rights)", land.id, "LAND"],
      ["Mutation (namjari)", "Mutation (namjari) certificate", land.id, "LAND"],
      ["Land tax receipt", "Land tax receipt", land.id, "LAND"],
      ["Agreement", "Partnership agreement", farm.id, "BUSINESS"],
      ["Profit statement", "Profit statements", farm.id, "BUSINESS"],
      ["Agreement", "Stock financing agreement", shop.id, "BUSINESS"],
      ["Constitution (bylaws)", "Constitution (bylaws)", null, "SOCIETY"],
    ];
    for (const [docType, title, investmentId, assetType] of docs) {
      await prisma.document.create({ data: { docType, title, investmentId, assetType, filePath: await placeholderPdf(title) } });
    }

    // Notices
    await prisma.notice.createMany({
      data: [
        { kind: "DECISION", title: "Last meeting decisions", body: "Bank interest will be shared with members. Minutes attached.", createdAt: day(addMonths(now, -1), 12) },
        { kind: "REMINDER", title: "Deposit due by the 10th", body: "Upload your proof after paying. Cash can be handed to the treasurer.", createdAt: day(now, 1, 9) },
        { kind: "VOTE", title: "Vote open: 3 katha land", body: "Please vote in the Invest tab before the 9th.", createdAt: day(now, 1, 10) },
        { kind: "MEETING", title: "Monthly meeting", body: "Agenda: land proposal vote result, last month's accounts, new member requests.", eventAt: day(now, 9, 20), place: "[Meeting place]", createdAt: new Date() },
      ],
    });

    await prisma.auditLog.create({ data: { actorId: admin.id, action: "seed", detail: "Demo data created" } });
    console.log("Demo members created — log in as 01711111111 (Rahim Ahmed) / Member123!");
  }

  console.log("Seed complete.");
  console.log(`Admin login: ${adminPhone} (or ${adminEmail}) / ${adminPassword}`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
