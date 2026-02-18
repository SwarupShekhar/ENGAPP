-- AlterTable
ALTER TABLE "UserReliability" ADD COLUMN     "lastDisconnectAt" TIMESTAMP(3),
ADD COLUMN     "lastDisconnectReason" TEXT;
