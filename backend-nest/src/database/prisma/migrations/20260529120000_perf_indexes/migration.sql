-- Performance indexes (N+1 / list / cron paths)
CREATE INDEX IF NOT EXISTS "SessionParticipant_userId_idx" ON "SessionParticipant"("userId");
CREATE INDEX IF NOT EXISTS "SessionParticipant_userId_sessionId_idx" ON "SessionParticipant"("userId", "sessionId");
CREATE INDEX IF NOT EXISTS "ConversationSession_createdAt_idx" ON "ConversationSession"("createdAt");
CREATE INDEX IF NOT EXISTS "ConversationSession_status_startedAt_idx" ON "ConversationSession"("status", "startedAt");
CREATE INDEX IF NOT EXISTS "AssessmentSession_completedAt_idx" ON "AssessmentSession"("completedAt");
CREATE INDEX IF NOT EXISTS "AssessmentSession_status_completedAt_idx" ON "AssessmentSession"("status", "completedAt");
CREATE INDEX IF NOT EXISTS "NotificationLog_userId_type_sentAt_idx" ON "NotificationLog"("userId", "type", "sentAt");
CREATE INDEX IF NOT EXISTS "UserAchievement_userId_idx" ON "UserAchievement"("userId");
CREATE INDEX IF NOT EXISTS "FriendRequest_senderId_idx" ON "FriendRequest"("senderId");
CREATE INDEX IF NOT EXISTS "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");
