-- CreateEnum
CREATE TYPE "SrState" AS ENUM ('LEARNING', 'GRADUATED');

-- CreateEnum
CREATE TYPE "SrAttemptResult" AS ENUM ('PASS', 'FAIL');

-- AlterTable
ALTER TABLE "LearningTask" ADD COLUMN     "srState" "SrState" NOT NULL DEFAULT 'LEARNING',
ADD COLUMN     "srStep" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "correctStreak" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "dueAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "lastAttemptAt" TIMESTAMP(3),
ADD COLUMN     "lastResult" "SrAttemptResult",
ADD COLUMN     "mistakeKey" TEXT,
ADD COLUMN     "attemptCount" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "LearningTask_userId_srState_dueAt_idx" ON "LearningTask"("userId", "srState", "dueAt");

-- CreateIndex
CREATE INDEX "LearningTask_mistakeKey_idx" ON "LearningTask"("mistakeKey");

-- Backfill mistakeKey for legacy rows (matches TasksService.computeMistakeKey)
UPDATE "LearningTask"
SET "mistakeKey" = CASE
  WHEN "type" = 'pronunciation' THEN
    'pron:' || COALESCE("content"->>'rule_category', 'general') || ':' ||
    lower(trim(COALESCE("content"->>'correct', "content"->>'target', '')))
  WHEN "type" IN ('grammar', 'vocabulary') THEN
    "type" || ':' ||
    lower(regexp_replace(trim(COALESCE("content"->>'userSaid', '')), '\s+', ' ', 'g')) ||
    '→' ||
    lower(regexp_replace(trim(COALESCE("content"->>'correct', "content"->>'target', '')), '\s+', ' ', 'g'))
  ELSE "type" || ':' || "id"::text
END
WHERE "mistakeKey" IS NULL;
