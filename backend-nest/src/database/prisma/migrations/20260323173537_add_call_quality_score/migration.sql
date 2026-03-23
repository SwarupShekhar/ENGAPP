-- CreateTable
CREATE TABLE "CallQualityScore" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cqs" DOUBLE PRECISION NOT NULL,
    "pqs" DOUBLE PRECISION NOT NULL,
    "depthScore" DOUBLE PRECISION NOT NULL,
    "complexityScore" DOUBLE PRECISION NOT NULL,
    "engagementScore" DOUBLE PRECISION NOT NULL,
    "pronunciationDelta" DOUBLE PRECISION NOT NULL,
    "fluencyDelta" DOUBLE PRECISION NOT NULL,
    "grammarDelta" DOUBLE PRECISION NOT NULL,
    "vocabularyDelta" DOUBLE PRECISION NOT NULL,
    "comprehensionDelta" DOUBLE PRECISION NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallQualityScore_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "ConversationSession" ADD COLUMN "callDurationSeconds" DOUBLE PRECISION;
ALTER TABLE "ConversationSession" ADD COLUMN "userSpokeSeconds" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "CallQualityScore_sessionId_idx" ON "CallQualityScore"("sessionId");

-- CreateIndex
CREATE INDEX "CallQualityScore_userId_idx" ON "CallQualityScore"("userId");

-- AddForeignKey
ALTER TABLE "CallQualityScore" ADD CONSTRAINT "CallQualityScore_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ConversationSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallQualityScore" ADD CONSTRAINT "CallQualityScore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
