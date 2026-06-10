-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'dm',
ADD COLUMN "title" TEXT,
ADD COLUMN "imageUrl" TEXT,
ADD COLUMN "createdById" TEXT;

-- CreateTable
CREATE TABLE "ReelLike" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "strapiReelId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReelLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageReaction" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageReaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReelLike_strapiReelId_idx" ON "ReelLike"("strapiReelId");

-- CreateIndex
CREATE UNIQUE INDEX "ReelLike_userId_strapiReelId_key" ON "ReelLike"("userId", "strapiReelId");

-- CreateIndex
CREATE UNIQUE INDEX "MessageReaction_messageId_userId_key" ON "MessageReaction"("messageId", "userId");

-- AddForeignKey
ALTER TABLE "ReelLike" ADD CONSTRAINT "ReelLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageReaction" ADD CONSTRAINT "MessageReaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageReaction" ADD CONSTRAINT "MessageReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
