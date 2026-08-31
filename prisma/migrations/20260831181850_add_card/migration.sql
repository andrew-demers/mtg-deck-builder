-- CreateTable
CREATE TABLE "Card" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "manaCost" TEXT,
    "manaValue" DOUBLE PRECISION NOT NULL,
    "colors" TEXT[],
    "colorIdentity" TEXT[],
    "type" TEXT NOT NULL,
    "types" TEXT[],
    "supertypes" TEXT[],
    "subtypes" TEXT[],
    "oracleText" TEXT,
    "legalities" JSONB NOT NULL,
    "scryfallOracleId" TEXT,
    "isCommanderEligible" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Card_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Card_name_key" ON "Card"("name");
