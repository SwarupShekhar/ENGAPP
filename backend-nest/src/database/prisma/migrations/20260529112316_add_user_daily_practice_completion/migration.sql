-- CreateTable
CREATE TABLE "UserDailyPracticeCompletion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "practiceDate" DATE NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bestScore" DOUBLE PRECISION,

    CONSTRAINT "UserDailyPracticeCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserDailyPracticeCompletion_userId_practiceDate_idx" ON "UserDailyPracticeCompletion"("userId", "practiceDate");

-- CreateIndex
CREATE UNIQUE INDEX "UserDailyPracticeCompletion_userId_kind_practiceDate_key" ON "UserDailyPracticeCompletion"("userId", "kind", "practiceDate");

-- AddForeignKey
ALTER TABLE "UserDailyPracticeCompletion" ADD CONSTRAINT "UserDailyPracticeCompletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
