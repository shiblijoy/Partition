import { PrismaClient, Species, CostCategory, AnimalStatus } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

const prisma = new PrismaClient();

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@farm.local";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      name: "Farm Admin",
      email: adminEmail,
      passwordHash: await hashPassword(adminPassword),
      role: "ADMIN",
    },
  });

  const defaultMargins: Array<{ species: Species; marginPercent: number }> = [
    { species: Species.COW, marginPercent: 20 },
    { species: Species.GOAT, marginPercent: 25 },
    { species: Species.LAMB, marginPercent: 25 },
    { species: Species.CHICKEN, marginPercent: 30 },
    { species: Species.OTHER, marginPercent: 25 },
  ];
  for (const setting of defaultMargins) {
    await prisma.priceSetting.upsert({
      where: { species: setting.species },
      update: {},
      create: setting,
    });
  }

  const existing = await prisma.animal.count();
  if (existing > 0) {
    console.log(`Skipping animal seed, ${existing} animal(s) already present.`);
    await prisma.$disconnect();
    return;
  }

  const cow = await prisma.animal.create({
    data: {
      tagId: "COW-001",
      species: Species.COW,
      breed: "Holstein",
      sex: "FEMALE",
      dob: daysAgo(400),
      acquisitionDate: daysAgo(180),
      acquisitionCost: 800,
      status: AnimalStatus.FOR_SALE,
      forSale: true,
      weightKg: 420,
      notes: "Healthy, vaccinated. Good milker.",
    },
  });

  const goat = await prisma.animal.create({
    data: {
      tagId: "GOAT-001",
      species: Species.GOAT,
      breed: "Boer",
      sex: "MALE",
      dob: daysAgo(200),
      acquisitionDate: daysAgo(150),
      acquisitionCost: 120,
      status: AnimalStatus.FOR_SALE,
      forSale: true,
      weightKg: 35,
    },
  });

  const lamb = await prisma.animal.create({
    data: {
      tagId: "LAMB-001",
      species: Species.LAMB,
      breed: "Dorper",
      sex: "FEMALE",
      dob: daysAgo(90),
      acquisitionDate: daysAgo(90),
      acquisitionCost: 90,
      status: AnimalStatus.ACTIVE,
      weightKg: 22,
    },
  });

  const chicken = await prisma.animal.create({
    data: {
      tagId: "CHK-001",
      species: Species.CHICKEN,
      breed: "Broiler",
      sex: "FEMALE",
      dob: daysAgo(40),
      acquisitionDate: daysAgo(40),
      acquisitionCost: 5,
      status: AnimalStatus.FOR_SALE,
      forSale: true,
      weightKg: 2.1,
    },
  });

  const feedEntries = [
    { animal: cow, days: 180, dailyFeed: 3.5 },
    { animal: goat, days: 150, dailyFeed: 0.8 },
    { animal: lamb, days: 90, dailyFeed: 0.6 },
    { animal: chicken, days: 40, dailyFeed: 0.15 },
  ];

  for (const { animal, days, dailyFeed } of feedEntries) {
    const sampleDays = Math.min(days, 14); // seed a couple of weeks of entries, not one per day for all history
    for (let i = 0; i < sampleDays; i++) {
      await prisma.costEntry.create({
        data: {
          animalId: animal.id,
          date: daysAgo(i),
          category: CostCategory.FEED,
          amount: dailyFeed,
          note: "Daily feed",
        },
      });
    }
  }

  await prisma.costEntry.create({
    data: {
      animalId: cow.id,
      date: daysAgo(60),
      category: CostCategory.MEDICAL,
      amount: 45,
      note: "Deworming + vaccination",
    },
  });

  await prisma.costEntry.create({
    data: {
      animalId: goat.id,
      date: daysAgo(30),
      category: CostCategory.MEDICAL,
      amount: 15,
      note: "Hoof trim",
    },
  });

  console.log("Seed complete.");
  console.log(`Admin login: ${adminEmail} / ${adminPassword}`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
