import { Module } from '@nestjs/common';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';
import { PayrollCalcService } from './payroll-calc.service';

@Module({
  controllers: [PayrollController],
  providers: [PayrollService, PayrollCalcService],
})
export class PayrollModule {}
