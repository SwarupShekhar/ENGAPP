-- AlterTable
ALTER TABLE "ConversationSession" ADD COLUMN     "egressId" TEXT,
ADD COLUMN     "recordingUrl" TEXT,
ADD COLUMN     "summaryJson" JSONB;

-- AlterTable
ALTER TABLE "Mistake" ADD COLUMN     "example" TEXT;
