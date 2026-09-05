import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { SitesModule } from './modules/sites/sites.module';
import { CrewsModule } from './modules/crews/crews.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { TimesheetsModule } from './modules/timesheets/timesheets.module';
import { PayrollModule } from './modules/payroll/payroll.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    SitesModule,
    CrewsModule,
    EmployeesModule,
    TimesheetsModule,
    PayrollModule,
  ],
})
export class AppModule {}
