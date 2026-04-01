-- AlterTable
ALTER TABLE "User" ADD COLUMN "email" TEXT;

-- Backfill existing rows (best-effort default based on clerkId)
UPDATE "User"
SET "email" = "clerkId" || '@engr.local'
WHERE "email" IS NULL;

-- Enforce NOT NULL after backfill
ALTER TABLE "User" ALTER COLUMN "email" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");

