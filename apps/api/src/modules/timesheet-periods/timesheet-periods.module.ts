import { Module } from '@nestjs/common';
import { TimesheetPeriodsController } from './timesheet-periods.controller';
import { TimesheetPeriodsService } from './timesheet-periods.service';

@Module({
  controllers: [TimesheetPeriodsController],
  providers: [TimesheetPeriodsService],
})
export class TimesheetPeriodsModule {}
