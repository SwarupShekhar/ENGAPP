-- CreateTable
CREATE TABLE "ReelComment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "strapiReelId" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "parentId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReelComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReelComment_strapiReelId_createdAt_idx" ON "ReelComment"("strapiReelId", "createdAt");

-- CreateIndex
CREATE INDEX "ReelComment_userId_idx" ON "ReelComment"("userId");

-- CreateIndex
CREATE INDEX "ReelComment_parentId_idx" ON "ReelComment"("parentId");

-- AddForeignKey
ALTER TABLE "ReelComment" ADD CONSTRAINT "ReelComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReelComment" ADD CONSTRAINT "ReelComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ReelComment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
