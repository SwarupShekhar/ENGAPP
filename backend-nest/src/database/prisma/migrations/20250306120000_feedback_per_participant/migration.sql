-- Feedback: one row per participant, transcript as JSON array of segments
-- Drop old unique so we can have multiple rows per session
DROP INDEX IF EXISTS "Feedback_sessionId_key";

-- Add participantId (nullable first for backfill)
ALTER TABLE "Feedback" ADD COLUMN "participantId" TEXT;

-- Backfill: assign each existing Feedback row to the first participant of that session
UPDATE "Feedback" f
SET "participantId" = (
  SELECT sp.id FROM "SessionParticipant" sp
  WHERE sp."sessionId" = f."sessionId"
  LIMIT 1
)
WHERE f."participantId" IS NULL;

-- Delete any Feedback that has no participant (orphan session)
DELETE FROM "Feedback" WHERE "participantId" IS NULL;

-- Make participantId required
ALTER TABLE "Feedback" ALTER COLUMN "participantId" SET NOT NULL;

-- Convert transcript from TEXT to JSONB (array of { speaker_id, text, timestamp })
ALTER TABLE "Feedback" ADD COLUMN "transcript_json" JSONB;
UPDATE "Feedback"
SET "transcript_json" = CASE
  WHEN "transcript" IS NOT NULL AND trim("transcript") != '' THEN
    jsonb_build_array(jsonb_build_object('speaker_id', 'legacy', 'text', "transcript", 'timestamp', 0))
  ELSE '[]'::jsonb
END;
ALTER TABLE "Feedback" DROP COLUMN "transcript";
ALTER TABLE "Feedback" RENAME COLUMN "transcript_json" TO "transcript";

-- Add FK and unique
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_participantId_fkey"
  FOREIGN KEY ("participantId") REFERENCES "SessionParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Feedback_sessionId_participantId_key" ON "Feedback"("sessionId", "participantId");
