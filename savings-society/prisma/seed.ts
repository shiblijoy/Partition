import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { PrismaClient, type PaymentMethod } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import { addMonths, currentMonth, isMonthKey, monthRange } from "../src/lib/months";
import { encryptPii } from "../src/lib/crypto";
import { getSettings } from "../src/lib/settings";
import { approvePayment, rejectPayment, submitPayments } from "../src/lib/services/payments";
import { addExpense, addIncome, openFdr, transfer } from "../src/lib/services/books";
import { cashAt } from "../src/lib/books";
import { closeInvestment, proposeInvestment, recordProfit, recordValuation, startInvestment } from "../src/lib/services/investments";

const prisma = new PrismaClient();
const STORAGE = path.resolve(process.env.STORAGE_DIR || path.join(process.cwd(), "storage"));

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
  const demo = process.env.SEED_DEMO !== "0";
  const now = currentMonth();
  // A real install starts from SEED_START_MONTH (or this month); the demo starts 9 months back.
  const startMonth = isMonthKey(process.env.SEED_START_MONTH ?? "") ? process.env.SEED_START_MONTH! : demo ? addMonths(now, -9) : now;

  await prisma.setting.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      societyName: "Dreamhive",
      currencySymbol: "৳",
      startMonth,
      ...(demo ? { paymentInfo: "bKash (society): 01XXXXXXXXX\nBank: [Bank], A/C ending 4821" } : {}),
    },
  });
  await prisma.monthlyRate.upsert({ where: { fromMonth: startMonth }, update: {}, create: { fromMonth: startMonth, amount: Number(process.env.SEED_MONTHLY_AMOUNT ?? 10000), createdBy: "setup" } });
  if ((await prisma.account.count()) === 0) {
    await prisma.account.createMany({
      data: demo
        ? [
            { name: "[Bank] savings", type: "BANK", last4: "4821" },
            { name: "bKash (society number)", type: "MOBILE_WALLET", last4: "7702" },
            { name: "Cash with treasurer", type: "CASH" },
          ]
        : [{ name: "Society bank account", type: "BANK" }],
    });
  }

  const admin = await prisma.user.upsert({
    where: { phone: adminPhone },
    update: {},
    create: {
      name: process.env.SEED_ADMIN_NAME ?? (demo ? "[Admin name]" : "Admin"),
      phone: adminPhone,
      email: adminEmail,
      contactPhone: process.env.SEED_ADMIN_WHATSAPP || null,
      passwordHash: await hashPassword(adminPassword),
      role: "ADMIN",
      joinMonth: startMonth,
      mustChangePassword: !demo, // a real install's first admin sets their own password at first login
    },
  });

  if ((await prisma.user.count({ where: { role: "MEMBER" } })) > 0 || !demo) {
    console.log("Skipping demo data.");
  } else {
    const settings = await getSettings();
    const actor = { id: admin.id, name: admin.name };
    const accounts = await prisma.account.findMany();
    const acc = (method: PaymentMethod) => accounts.find((a) => a.type === (method === "BANK" ? "BANK" : method === "CASH" ? "CASH" : "MOBILE_WALLET"))!.id;
    const bank = accounts.find((a) => a.type === "BANK")!.id;
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
    const pay = async (memberId: string, month: string, method: PaymentMethod, reference: string, paidOn: Date, reviewed: Date) => {
      const [p] = await submitPayments(settings, { memberId, months: [month], method, reference, paidOn, proofPath: null, note: null });
      await approvePayment(settings, p.id, { receivedOn: paidOn, accountId: acc(method), actor, at: reviewed });
    };

    // Expenses and investments are dated through the months, so they're recorded in date order with the deposits.
    const members: Array<{ id: string; name: string; i: number; phone: string }> = [];
    for (const [i, name] of names.entries()) {
      const phone = name === "Rahim Ahmed" ? "01711111111" : `01${String(711 + i * 101).slice(-3)}${String(100000 + i * 7919).slice(-6)}`;
      const member = await prisma.user.create({
        data: {
          name,
          phone,
          memberNo: i + 1,
          passwordHash: password,
          role: "MEMBER",
          joinMonth: startMonth,
          createdAt: day(startMonth, 1),
          ...encryptPii({
            nid: `19${String(8800000000000 + i * 1234567).slice(0, 11)}`,
            dateOfBirth: "[DD Mon YYYY]",
            address: "[House, Road, Area, City]",
            nomineeName: "[Nominee name]",
            nomineeRelation: i % 2 ? "Wife" : "Husband",
            nomineePhone: "01700000000",
            nomineeNid: `19${String(7700000000000 + i * 7654321).slice(0, 11)}`,
          }),
        },
      });
      members.push({ id: member.id, name, i, phone });
    }

    for (const [k, month] of months.entries()) {
      for (const m of members) {
        if (k >= months.length - (behind[m.name] ?? 0)) continue;
        if (m.name === "Rahim Ahmed" && k === 5) {
          const [bad] = await submitPayments(settings, { memberId: m.id, months: [month], method: "BANK", reference: "SLIP-2291", paidOn: day(month, 5), proofPath: null, note: null });
          await rejectPayment(settings, bad.id, "Amount not found in society account. Please resubmit with the bank slip", actor);
          await pay(m.id, month, "BANK", "SLIP-2291B", day(month, 8), day(month, 9));
          continue;
        }
        await pay(m.id, month, methods[(m.i + k) % methods.length], `${(m.i * 31 + k * 7).toString(36).toUpperCase()}${month.replace("-", "")}X`, day(month, 3 + (m.i % 5)), day(month, 4 + (m.i % 5)));
      }
      if (k === 0) await addExpense(settings, { date: day(month, 10), category: "LEGAL", amount: 2500, description: "Account opening & stamps", receiptPath: null, accountId: bank, actor });
      if (k === 2) await addExpense(settings, { date: day(month, 15), category: "BANK_CHARGE", amount: 575, description: "Account maintenance fee", receiptPath: null, accountId: bank, actor });
      if (k === 6) await addExpense(settings, { date: day(month, 12), category: "STATIONERY", amount: 3600, description: "Member passbooks (24)", receiptPath: null, accountId: bank, actor });
      await addExpense(settings, { date: day(month, 27), category: "MEETING", amount: 1100, description: "Monthly meeting refreshments", receiptPath: null, accountId: bank, actor });
      // The treasurer moves the month's bKash/Nagad and cash collections into the bank.
      for (const a of accounts.filter((x) => x.type !== "BANK")) {
        const held = await cashAt(prisma, undefined, a.id);
        if (held > 0) await transfer({ fromId: a.id, toId: bank, amount: held, date: day(month, 28), note: `${a.name} collections deposited at the bank`, actor });
      }
    }
    await addExpense(settings, { date: day(addMonths(now, -1), 15), category: "BANK_CHARGE", amount: 575, description: "Account maintenance fee", receiptPath: null, accountId: bank, actor });

    // Investments: approved by vote earlier, paid out from the bank.
    const passed = async (data: { kind: "LAND" | "BUSINESS"; name: string; details: string; plan: string; amount: number; voteRule: "MAJORITY" | "TWO_THIRDS" }, started: Date) => {
      const inv = await prisma.investment.create({ data: { ...data, status: "PASSED", voteClosedAt: started } });
      await startInvestment(settings, inv.id, { accountId: bank, date: started, actor });
      return inv;
    };
    const shop = await passed({ kind: "BUSINESS", name: "[Shop name] stock financing", details: "3-month term", plan: "12% fixed profit", amount: 200000, voteRule: "MAJORITY" }, day(addMonths(startMonth, 2), 1));
    const land = await passed({ kind: "LAND", name: "5 katha plot, [Location]", details: "Registered in society name · deed no. [____]", plan: "Hold, sell or build", amount: 1200000, voteRule: "TWO_THIRDS" }, day(addMonths(startMonth, 3), 15));
    await closeInvestment(settings, shop.id, { returned: 224000, date: day(addMonths(startMonth, 5), 1), accountId: bank, actor });
    const farm = await passed({ kind: "BUSINESS", name: "[Partner] poultry farm", details: "Monthly payout", plan: "30% of monthly profit", amount: 500000, voteRule: "MAJORITY" }, day(addMonths(startMonth, 5), 1));
    await recordValuation(land.id, 1350000, actor);
    for (const m of monthRange(addMonths(startMonth, 6), addMonths(now, -1))) {
      await recordProfit(settings, farm.id, { amount: 15000, date: day(m, 28), accountId: bank, actor });
    }
    await addIncome(settings, { kind: "BANK_INTEREST", amount: 2400, date: day(addMonths(now, -1), 28), accountId: bank, description: "Bank interest, last quarter", filePath: null, actor });
    await openFdr({ fromId: bank, name: "[Bank] FDR · 6 months", amount: 300000, rate: 9.5, openedOn: day(addMonths(now, -3), 15), maturesOn: day(addMonths(now, 3), 15), actor });

    // This month: a few paid, five waiting for approval, five not yet.
    for (const m of members) {
      if (pendingNow.includes(m.name)) {
        await submitPayments(settings, {
          memberId: m.id,
          months: [now],
          method: m.name === "Rahim Ahmed" ? "BKASH" : methods[m.i % 4],
          reference: m.name === "Rahim Ahmed" ? "8KJ2M4XQ7P" : `PND${m.i}${now.replace("-", "")}`,
          paidOn: new Date(),
          proofPath: await placeholderPdf(`Payment screenshot from ${m.name}`, `proofs/${m.id}`),
          note: m.name === "Farhana Akter" ? "Cash given to treasurer, receipt #112" : null,
        });
      } else if (!unpaidNow.includes(m.name)) {
        await pay(m.id, now, methods[m.i % 4], `NOW${m.i}${now.replace("-", "")}`, day(now, 1), day(now, 1, 18));
      }
      if (m.name === "Arif Hasan") await prisma.withdrawal.create({ data: { memberId: m.id, kind: "FULL", payTo: `bKash ${m.phone}`, reason: "Moving abroad", createdAt: day(now, 1) } });
    }

    // A vote in progress.
    const ends = new Date(Date.now() + 6 * 86_400_000);
    const proposal = await proposeInvestment(settings, { kind: "LAND", name: "Buy 3 katha land, [Location]", plan: "Hold 3 years", details: null, amount: 600000, voteRule: "MAJORITY", voteEndsAt: ends, actor });
    for (const m of members.slice(0, 11)) {
      if (m.name === "Rahim Ahmed") continue;
      await prisma.vote.create({ data: { investmentId: proposal.id, memberId: m.id, choice: m.i % 5 === 4 ? "NO" : "YES" } });
    }

    // Documents
    const docs: Array<[string, string, string | null, "LAND" | "BUSINESS" | "SOCIETY", boolean]> = [
      ["Sale deed (dalil)", "Sale deed (dalil)", land.id, "LAND", false],
      ["Khatian", "Khatian (record of rights)", land.id, "LAND", false],
      ["Mutation (namjari)", "Mutation (namjari) certificate", land.id, "LAND", false],
      ["Land tax receipt", "Land tax receipt", land.id, "LAND", false],
      ["Agreement", "Partnership agreement", farm.id, "BUSINESS", false],
      ["Profit statement", "Profit statements", farm.id, "BUSINESS", false],
      ["Agreement", "Stock financing agreement", shop.id, "BUSINESS", false],
      ["Constitution (bylaws)", "Constitution (bylaws)", null, "SOCIETY", false],
      ["Bank account document", "Bank signatory mandate", null, "SOCIETY", true],
      ["Survey map", "Survey map (proposal)", proposal.id, "LAND", false],
    ];
    for (const [docType, title, investmentId, assetType, adminOnly] of docs) {
      await prisma.document.create({ data: { docType, title, investmentId, assetType, adminOnly, filePath: await placeholderPdf(title) } });
    }

    // Notices
    await prisma.notice.createMany({
      data: [
        { kind: "DECISION", title: "Last meeting decisions", body: "Bank interest will be shared with members.", minutes: "Present: 21 of 24.\n1. Bank interest is shared with members (unanimous).\n2. Next land proposal to be voted in the app.", createdAt: day(addMonths(now, -1), 12) },
        { kind: "REMINDER", title: `Deposit due by the ${settings.reminderDay}th`, body: "Upload your proof after paying. Cash can be handed to the treasurer.", createdAt: day(now, 1, 9) },
        { kind: "MEETING", title: "Monthly meeting", body: "Agenda: land proposal vote result, last month's accounts, new member requests.", eventAt: day(now, 9, 20), place: "[Meeting place]", investmentId: proposal.id, createdAt: new Date() },
      ],
    });

    // Payouts and investments above 5 lakh need a second admin from now on (NFR-SEC-07).
    await prisma.setting.update({ where: { id: 1 }, data: { dualApprovalLimit: 500000 } });
    // Demo notifications count as already delivered and read.
    await prisma.notification.updateMany({ data: { pushedAt: new Date(), readAt: new Date() } });
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
