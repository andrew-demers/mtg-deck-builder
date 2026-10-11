-- AlterTable
ALTER TABLE "Card" ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "priceUsd" DOUBLE PRECISION,
ADD COLUMN     "priceUsdFoil" DOUBLE PRECISION,
ADD COLUMN     "pricesUpdatedAt" TIMESTAMP(3);
