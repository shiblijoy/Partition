import { PrismaClient, PaymentMethod } from "@prisma/client";
import { hashPassword } from "../src/lib/password";
import { addMonths, currentMonth, monthRange } from "../src/lib/months";

const prisma = new PrismaClient();

async function main() {
  const adminPhone = process.env.SEED_ADMIN_PHONE ?? "01700000000";
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@society.local";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";
  const startMonth = addMonths(currentMonth(), -5);

  await prisma.setting.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      societyName: "Our Savings Society",
      monthlyAmount: 10000,
      currencySymbol: "৳",
      startMonth,
      paymentInfo: "bKash (personal): 01700000000\nBank: Sample Bank Ltd, A/C 0000000000",
    },
  });

  await prisma.user.upsert({
    where: { phone: adminPhone },
    update: {},
    create: {
      name: "Society Admin",
      phone: adminPhone,
      email: adminEmail,
      passwordHash: await hashPassword(adminPassword),
      role: "ADMIN",
      joinMonth: startMonth,
    },
  });

  const existing = await prisma.user.count({ where: { role: "MEMBER" } });
  if (existing > 0 || process.env.SEED_DEMO === "0") {
    console.log("Skipping demo members.");
  } else {
    // A few demo members in different situations: fully paid, behind, paid ahead, one pending.
    const demoPassword = await hashPassword("Member123!");
    const months = monthRange(startMonth, currentMonth());
    const demo = [
      { name: "Rahim Uddin", phone: "01711111111", paidMonths: months.length },
      { name: "Karim Ahmed", phone: "01722222222", paidMonths: months.length - 2 },
      { name: "Nasrin Akter", phone: "01733333333", paidMonths: months.length + 1 },
      { name: "Fatema Begum", phone: "01744444444", paidMonths: months.length - 1, pendingLast: true },
    ];
    for (const d of demo) {
      const member = await prisma.user.create({
        data: { name: d.name, phone: d.phone, passwordHash: demoPassword, role: "MEMBER", joinMonth: startMonth },
      });
      for (let i = 0; i < d.paidMonths; i++) {
        const forMonth = addMonths(startMonth, i);
        const [y, m] = forMonth.split("-").map(Number);
        await prisma.payment.create({
          data: {
            memberId: member.id,
            forMonth,
            amount: 10000,
            method: i % 2 ? PaymentMethod.BANK : PaymentMethod.BKASH,
            reference: `DEMO${y}${m}${d.phone.slice(-3)}`,
            paidOn: new Date(y, m - 1, 5),
            status: "APPROVED",
            reviewedAt: new Date(y, m - 1, 6),
          },
        });
      }
      if (d.pendingLast) {
        await prisma.payment.create({
          data: {
            memberId: member.id,
            forMonth: currentMonth(),
            amount: 10000,
            method: PaymentMethod.NAGAD,
            reference: "DEMO-PENDING",
            paidOn: new Date(),
            note: "Sent via Nagad this morning",
          },
        });
      }
    }
    const [y, m] = currentMonth().split("-").map(Number);
    await prisma.expense.createMany({
      data: [
        { date: new Date(y, m - 3, 28), category: "BANK_CHARGE", amount: 575, description: "Bank account maintenance fee" },
        { date: new Date(y, m - 2, 10), category: "MEETING", amount: 1200, description: "Monthly meeting refreshments" },
      ],
    });
    console.log("Demo members created — log in as 01711111111 / Member123!");
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
