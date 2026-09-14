-- AlterTable
ALTER TABLE "Timesheet" ADD COLUMN     "timesheetPeriodId" TEXT;

-- CreateTable
CREATE TABLE "TimesheetPeriod" (
    "id" TEXT NOT NULL,
    "crewId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "workType" TEXT NOT NULL DEFAULT 'drilling',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdById" TEXT NOT NULL,
    "accountantApprovedAt" TIMESTAMP(3),
    "accountantApprovedById" TEXT,
    "ownerApprovedAt" TIMESTAMP(3),
    "ownerApprovedById" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimesheetPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimesheetPeriod_crewId_idx" ON "TimesheetPeriod"("crewId");

-- AddForeignKey
ALTER TABLE "TimesheetPeriod" ADD CONSTRAINT "TimesheetPeriod_crewId_fkey" FOREIGN KEY ("crewId") REFERENCES "Crew"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimesheetPeriod" ADD CONSTRAINT "TimesheetPeriod_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimesheetPeriod" ADD CONSTRAINT "TimesheetPeriod_accountantApprovedById_fkey" FOREIGN KEY ("accountantApprovedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimesheetPeriod" ADD CONSTRAINT "TimesheetPeriod_ownerApprovedById_fkey" FOREIGN KEY ("ownerApprovedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Timesheet" ADD CONSTRAINT "Timesheet_timesheetPeriodId_fkey" FOREIGN KEY ("timesheetPeriodId") REFERENCES "TimesheetPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;
