-- AlterTable
ALTER TABLE "TimesheetPeriod" ADD COLUMN     "taskId" TEXT;

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "crewId" TEXT NOT NULL,
    "foremanId" TEXT NOT NULL,
    "wellName" TEXT NOT NULL,
    "projectedDepth" DECIMAL(8,2) NOT NULL,
    "dailyPlan" DECIMAL(8,2) NOT NULL,
    "mountDismountPlanHours" DECIMAL(6,2) NOT NULL,
    "hasNightShift" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftAssignment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "shift" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimesheetPeriodReview" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "comment" TEXT,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimesheetPeriodReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Task_siteId_idx" ON "Task"("siteId");

-- CreateIndex
CREATE INDEX "Task_crewId_idx" ON "Task"("crewId");

-- CreateIndex
CREATE INDEX "Task_foremanId_idx" ON "Task"("foremanId");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftAssignment_taskId_employeeId_key" ON "ShiftAssignment"("taskId", "employeeId");

-- CreateIndex
CREATE INDEX "TimesheetPeriodReview_periodId_idx" ON "TimesheetPeriodReview"("periodId");

-- CreateIndex
CREATE INDEX "TimesheetPeriod_taskId_idx" ON "TimesheetPeriod"("taskId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_crewId_fkey" FOREIGN KEY ("crewId") REFERENCES "Crew"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_foremanId_fkey" FOREIGN KEY ("foremanId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimesheetPeriod" ADD CONSTRAINT "TimesheetPeriod_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimesheetPeriodReview" ADD CONSTRAINT "TimesheetPeriodReview_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "TimesheetPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimesheetPeriodReview" ADD CONSTRAINT "TimesheetPeriodReview_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
