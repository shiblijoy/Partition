-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'STAFF');

-- CreateEnum
CREATE TYPE "Species" AS ENUM ('COW', 'GOAT', 'LAMB', 'CHICKEN', 'OTHER');

-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "AnimalStatus" AS ENUM ('ACTIVE', 'FOR_SALE', 'SOLD', 'DECEASED');

-- CreateEnum
CREATE TYPE "CostCategory" AS ENUM ('FEED', 'MEDICAL', 'LABOR', 'HOUSING', 'TRANSPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'STAFF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Animal" (
    "id" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "species" "Species" NOT NULL,
    "breed" TEXT,
    "sex" "Sex",
    "dob" TIMESTAMP(3),
    "acquisitionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acquisitionCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "AnimalStatus" NOT NULL DEFAULT 'ACTIVE',
    "weightKg" DOUBLE PRECISION,
    "notes" TEXT,
    "marginPercent" DOUBLE PRECISION,
    "listedPrice" DOUBLE PRECISION,
    "forSale" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Animal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostEntry" (
    "id" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "category" "CostCategory" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "batchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "buyerName" TEXT NOT NULL,
    "buyerPhone" TEXT NOT NULL,
    "buyerEmail" TEXT,
    "note" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleRecord" (
    "id" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "buyerName" TEXT NOT NULL,
    "buyerPhone" TEXT,
    "buyerEmail" TEXT,
    "salePrice" DOUBLE PRECISION NOT NULL,
    "costToDate" DOUBLE PRECISION NOT NULL,
    "profit" DOUBLE PRECISION NOT NULL,
    "saleDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnimalPhoto" (
    "id" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnimalPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceSetting" (
    "id" TEXT NOT NULL,
    "species" "Species" NOT NULL,
    "marginPercent" DOUBLE PRECISION NOT NULL DEFAULT 25,

    CONSTRAINT "PriceSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Animal_tagId_key" ON "Animal"("tagId");

-- CreateIndex
CREATE INDEX "Animal_species_idx" ON "Animal"("species");

-- CreateIndex
CREATE INDEX "Animal_status_idx" ON "Animal"("status");

-- CreateIndex
CREATE INDEX "CostEntry_animalId_idx" ON "CostEntry"("animalId");

-- CreateIndex
CREATE INDEX "CostEntry_date_idx" ON "CostEntry"("date");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SaleRecord_animalId_key" ON "SaleRecord"("animalId");

-- CreateIndex
CREATE INDEX "AnimalPhoto_animalId_idx" ON "AnimalPhoto"("animalId");

-- CreateIndex
CREATE UNIQUE INDEX "PriceSetting_species_key" ON "PriceSetting"("species");

-- AddForeignKey
ALTER TABLE "CostEntry" ADD CONSTRAINT "CostEntry_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleRecord" ADD CONSTRAINT "SaleRecord_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalPhoto" ADD CONSTRAINT "AnimalPhoto_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
