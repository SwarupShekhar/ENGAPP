-- Create join table to link LearningTask ↔ PronunciationIssue without altering existing TaskMistake.
CREATE TABLE IF NOT EXISTS "TaskPronunciationIssue" (
    "taskId" TEXT NOT NULL,
    "pronunciationIssueId" TEXT NOT NULL,
    CONSTRAINT "TaskPronunciationIssue_pkey" PRIMARY KEY ("taskId","pronunciationIssueId")
);

CREATE INDEX IF NOT EXISTS "TaskPronunciationIssue_taskId_idx" ON "TaskPronunciationIssue"("taskId");
CREATE INDEX IF NOT EXISTS "TaskPronunciationIssue_pronunciationIssueId_idx" ON "TaskPronunciationIssue"("pronunciationIssueId");

ALTER TABLE "TaskPronunciationIssue"
ADD CONSTRAINT "TaskPronunciationIssue_taskId_fkey"
FOREIGN KEY ("taskId") REFERENCES "LearningTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TaskPronunciationIssue"
ADD CONSTRAINT "TaskPronunciationIssue_pronunciationIssueId_fkey"
FOREIGN KEY ("pronunciationIssueId") REFERENCES "PronunciationIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

