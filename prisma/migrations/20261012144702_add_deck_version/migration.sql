-- CreateTable
CREATE TABLE "DeckVersion" (
    "id" TEXT NOT NULL,
    "deckId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "commanderCardId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeckVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeckVersionCard" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "isCommander" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DeckVersionCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeckVersion_deckId_number_key" ON "DeckVersion"("deckId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "DeckVersionCard_versionId_cardId_key" ON "DeckVersionCard"("versionId", "cardId");

-- AddForeignKey
ALTER TABLE "DeckVersion" ADD CONSTRAINT "DeckVersion_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "Deck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeckVersion" ADD CONSTRAINT "DeckVersion_commanderCardId_fkey" FOREIGN KEY ("commanderCardId") REFERENCES "Card"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeckVersionCard" ADD CONSTRAINT "DeckVersionCard_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "DeckVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeckVersionCard" ADD CONSTRAINT "DeckVersionCard_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
