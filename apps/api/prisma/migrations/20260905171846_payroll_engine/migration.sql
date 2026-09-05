-- AlterTable
ALTER TABLE "Timesheet" ADD COLUMN     "isHoliday" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "RateRule" ADD CONSTRAINT "RateRule_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;
