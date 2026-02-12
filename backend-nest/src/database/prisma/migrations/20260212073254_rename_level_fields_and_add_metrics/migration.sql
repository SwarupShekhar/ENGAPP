/*
  Warnings:

  - You are about to drop the column `provisionalLevel` on the `AssessmentSession` table. All the data in the column will be lost.
  - You are about to drop the column `provisionalLevel` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "AssessmentSession" DROP COLUMN "provisionalLevel",
ADD COLUMN     "improvementDelta" JSONB,
ADD COLUMN     "overallLevel" TEXT,
ADD COLUMN     "overallScore" DOUBLE PRECISION,
ADD COLUMN     "personalizedPlan" JSONB,
ADD COLUMN     "skillBreakdown" JSONB,
ADD COLUMN     "weaknessMap" JSONB;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "provisionalLevel",
ADD COLUMN     "overallLevel" TEXT;
