-- AlterTable
ALTER TABLE "Deck" ADD COLUMN     "goal" TEXT;

-- AlterTable
ALTER TABLE "DeckVersion" ADD COLUMN     "gradeBreakdown" JSONB,
ADD COLUMN     "gradeGoal" TEXT,
ADD COLUMN     "gradeScore" INTEGER,
ADD COLUMN     "gradeSummary" TEXT;
