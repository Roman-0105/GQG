import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { SitesModule } from './modules/sites/sites.module';
import { CrewsModule } from './modules/crews/crews.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { TimesheetsModule } from './modules/timesheets/timesheets.module';
import { TimesheetPeriodsModule } from './modules/timesheet-periods/timesheet-periods.module';
import { PayrollModule } from './modules/payroll/payroll.module';
import { PositionsModule } from './modules/positions/positions.module';
import { RolesModule } from './modules/roles/roles.module';
import { UsersModule } from './modules/users/users.module';
import { RateRulesModule } from './modules/rate-rules/rate-rules.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { TasksModule } from './modules/tasks/tasks.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    SitesModule,
    CrewsModule,
    EmployeesModule,
    TimesheetsModule,
    TimesheetPeriodsModule,
    PayrollModule,
    PositionsModule,
    RolesModule,
    UsersModule,
    RateRulesModule,
    AnalyticsModule,
    TasksModule,
  ],
})
export class AppModule {}
