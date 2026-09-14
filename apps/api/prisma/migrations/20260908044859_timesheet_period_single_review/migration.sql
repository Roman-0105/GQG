/*
  Warnings:

  - You are about to drop the column `accountantApprovedAt` on the `TimesheetPeriod` table. All the data in the column will be lost.
  - You are about to drop the column `accountantApprovedById` on the `TimesheetPeriod` table. All the data in the column will be lost.
  - You are about to drop the column `ownerApprovedAt` on the `TimesheetPeriod` table. All the data in the column will be lost.
  - You are about to drop the column `ownerApprovedById` on the `TimesheetPeriod` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "TimesheetPeriod" DROP CONSTRAINT "TimesheetPeriod_accountantApprovedById_fkey";

-- DropForeignKey
ALTER TABLE "TimesheetPeriod" DROP CONSTRAINT "TimesheetPeriod_ownerApprovedById_fkey";

-- AlterTable
ALTER TABLE "TimesheetPeriod" DROP COLUMN "accountantApprovedAt",
DROP COLUMN "accountantApprovedById",
DROP COLUMN "ownerApprovedAt",
DROP COLUMN "ownerApprovedById",
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT,
ADD COLUMN     "submittedAt" TIMESTAMP(3),
ADD COLUMN     "submittedById" TEXT;

-- AddForeignKey
ALTER TABLE "TimesheetPeriod" ADD CONSTRAINT "TimesheetPeriod_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimesheetPeriod" ADD CONSTRAINT "TimesheetPeriod_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
