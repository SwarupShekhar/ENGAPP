-- AlterTable
ALTER TABLE "AssessmentSession" ADD COLUMN     "benchmarking" JSONB,
ADD COLUMN     "confidence_metrics" JSONB,
ADD COLUMN     "readiness" JSONB;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "allowBenchmarking" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "dataDeletedAt" TIMESTAMP(3),
ADD COLUMN     "dataRetentionDays" INTEGER NOT NULL DEFAULT 90,
ADD COLUMN     "learningDurationDays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "shareDataForResearch" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "RecurringErrorPattern" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "errorType" TEXT NOT NULL,
    "errorCategory" TEXT NOT NULL,
    "firstDetectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
    "improvementRate" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "examples" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringErrorPattern_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecurringErrorPattern_userId_status_idx" ON "RecurringErrorPattern"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RecurringErrorPattern_userId_errorType_key" ON "RecurringErrorPattern"("userId", "errorType");

-- AddForeignKey
ALTER TABLE "RecurringErrorPattern" ADD CONSTRAINT "RecurringErrorPattern_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
