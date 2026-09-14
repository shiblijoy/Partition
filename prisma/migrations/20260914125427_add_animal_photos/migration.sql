/*
  Warnings:

  - You are about to drop the column `imageUrl` on the `Animal` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "AnimalPhoto" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "animalId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnimalPhoto_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Animal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tagId" TEXT NOT NULL,
    "species" TEXT NOT NULL,
    "breed" TEXT,
    "sex" TEXT,
    "dob" DATETIME,
    "acquisitionDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acquisitionCost" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "weightKg" REAL,
    "notes" TEXT,
    "marginPercent" REAL,
    "listedPrice" REAL,
    "forSale" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Animal" ("acquisitionCost", "acquisitionDate", "breed", "createdAt", "dob", "forSale", "id", "listedPrice", "marginPercent", "notes", "sex", "species", "status", "tagId", "updatedAt", "weightKg") SELECT "acquisitionCost", "acquisitionDate", "breed", "createdAt", "dob", "forSale", "id", "listedPrice", "marginPercent", "notes", "sex", "species", "status", "tagId", "updatedAt", "weightKg" FROM "Animal";
DROP TABLE "Animal";
ALTER TABLE "new_Animal" RENAME TO "Animal";
CREATE UNIQUE INDEX "Animal_tagId_key" ON "Animal"("tagId");
CREATE INDEX "Animal_species_idx" ON "Animal"("species");
CREATE INDEX "Animal_status_idx" ON "Animal"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "AnimalPhoto_animalId_idx" ON "AnimalPhoto"("animalId");
