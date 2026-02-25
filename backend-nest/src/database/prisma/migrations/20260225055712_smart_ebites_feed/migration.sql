-- AlterTable
ALTER TABLE "UserTopicScore" ADD COLUMN     "decayRate" DOUBLE PRECISION NOT NULL DEFAULT 0.95,
ADD COLUMN     "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "occurrences" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'activity',
ALTER COLUMN "score" SET DEFAULT 50.0;

-- CreateTable
CREATE TABLE "UserReelHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "strapiReelId" INTEGER NOT NULL,
    "watchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "UserReelHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserReelHistory_userId_idx" ON "UserReelHistory"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserReelHistory_userId_strapiReelId_key" ON "UserReelHistory"("userId", "strapiReelId");

-- CreateIndex
CREATE INDEX "UserTopicScore_userId_score_idx" ON "UserTopicScore"("userId", "score");

-- AddForeignKey
ALTER TABLE "UserReelHistory" ADD CONSTRAINT "UserReelHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
