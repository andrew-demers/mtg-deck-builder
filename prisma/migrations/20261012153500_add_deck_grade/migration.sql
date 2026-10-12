-- AlterTable
ALTER TABLE "Deck" ADD COLUMN     "gradeBreakdown" JSONB,
ADD COLUMN     "gradeGoal" TEXT,
ADD COLUMN     "gradeScore" INTEGER,
ADD COLUMN     "gradeSignature" TEXT,
ADD COLUMN     "gradeSummary" TEXT;
