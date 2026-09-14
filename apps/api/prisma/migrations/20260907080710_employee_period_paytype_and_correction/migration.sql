-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "payType" TEXT NOT NULL DEFAULT 'hourly';

-- AlterTable
ALTER TABLE "Timesheet" ADD COLUMN     "correctionReason" TEXT;

-- AlterTable
ALTER TABLE "TimesheetPeriod" ADD COLUMN     "payType" TEXT NOT NULL DEFAULT 'hourly';
