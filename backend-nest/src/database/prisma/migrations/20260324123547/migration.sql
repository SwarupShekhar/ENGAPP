-- DropIndex
DROP INDEX "TaskPronunciationIssue_pronunciationIssueId_idx";

-- DropIndex
DROP INDEX "TaskPronunciationIssue_taskId_idx";

-- AlterTable
ALTER TABLE "CallQualityScore" ADD COLUMN     "phase_computed" TEXT;
