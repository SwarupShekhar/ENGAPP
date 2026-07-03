-- CreateTable
CREATE TABLE "UserScoreProfile" (
    "userId" TEXT NOT NULL,
    "overallScore" INTEGER NOT NULL DEFAULT 0,
    "cefrLevel" TEXT NOT NULL DEFAULT 'A1',
    "pronunciation" INTEGER NOT NULL DEFAULT 0,
    "fluency" INTEGER NOT NULL DEFAULT 0,
    "grammar" INTEGER NOT NULL DEFAULT 0,
    "vocabulary" INTEGER NOT NULL DEFAULT 0,
    "comprehension" INTEGER NOT NULL DEFAULT 0,
    "vocabularyMeasured" BOOLEAN NOT NULL DEFAULT false,
    "baselineAssessmentId" TEXT,
    "lastEventType" TEXT,
    "lastSessionId" TEXT,
    "pendingCefrLevel" TEXT,
    "cefrStableCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserScoreProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "ScoreChangeLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "assessmentId" TEXT,
    "sessionId" TEXT,
    "before" JSONB,
    "after" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoreChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserScoreProfile_cefrLevel_idx" ON "UserScoreProfile"("cefrLevel");

-- CreateIndex
CREATE INDEX "UserScoreProfile_overallScore_idx" ON "UserScoreProfile"("overallScore");

-- CreateIndex
CREATE INDEX "ScoreChangeLog_userId_createdAt_idx" ON "ScoreChangeLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ScoreChangeLog_eventType_idx" ON "ScoreChangeLog"("eventType");

-- AddForeignKey
ALTER TABLE "UserScoreProfile" ADD CONSTRAINT "UserScoreProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreChangeLog" ADD CONSTRAINT "ScoreChangeLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
