-- CreateTable
CREATE TABLE "UserTopicScore" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topicTag" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserTopicScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserTopicScore_userId_idx" ON "UserTopicScore"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserTopicScore_userId_topicTag_key" ON "UserTopicScore"("userId", "topicTag");

-- AddForeignKey
ALTER TABLE "UserTopicScore" ADD CONSTRAINT "UserTopicScore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
