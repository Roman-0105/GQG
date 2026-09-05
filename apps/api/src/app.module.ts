import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { SitesModule } from './modules/sites/sites.module';
import { CrewsModule } from './modules/crews/crews.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { TimesheetsModule } from './modules/timesheets/timesheets.module';
import { PayrollModule } from './modules/payroll/payroll.module';
import { PositionsModule } from './modules/positions/positions.module';
import { RolesModule } from './modules/roles/roles.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    SitesModule,
    CrewsModule,
    EmployeesModule,
    TimesheetsModule,
    PayrollModule,
    PositionsModule,
    RolesModule,
    UsersModule,
  ],
})
export class AppModule {}
