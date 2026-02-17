-- AlterTable
ALTER TABLE "Analysis" ADD COLUMN     "confidenceTimeline" JSONB,
ADD COLUMN     "hesitationMarkers" JSONB,
ADD COLUMN     "topicVocabulary" JSONB;

-- AlterTable
ALTER TABLE "ConversationSession" ADD COLUMN     "interactionMetrics" JSONB,
ADD COLUMN     "peerComparison" JSONB;
