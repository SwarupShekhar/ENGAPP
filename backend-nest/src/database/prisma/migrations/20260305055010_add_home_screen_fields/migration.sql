-- AlterTable
ALTER TABLE "User" ADD COLUMN     "assessmentLevel" TEXT,
ADD COLUMN     "assessmentScore" INTEGER DEFAULT 0,
ADD COLUMN     "currentStreak" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "initialAssessmentScore" INTEGER DEFAULT 0,
ADD COLUMN     "lastAssessmentAt" TIMESTAMP(3),
ADD COLUMN     "lastResolvedStage" INTEGER,
ADD COLUMN     "lastSessionAt" TIMESTAMP(3),
ADD COLUMN     "totalSessions" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "UserAchievement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "badgeType" TEXT NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "displayed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "UserAchievement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StreakHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "streakDays" INTEGER NOT NULL,
    "endedAt" TIMESTAMP(3),
    "reason" TEXT NOT NULL,

    CONSTRAINT "StreakHistory_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "UserAchievement" ADD CONSTRAINT "UserAchievement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StreakHistory" ADD CONSTRAINT "StreakHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
