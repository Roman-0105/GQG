import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacGuard } from '../../common/rbac/rbac.guard';
import { RequirePermission } from '../../common/rbac/permissions.decorator';
import { CurrentKernUser } from '../../common/rbac/current-kern-user.decorator';
import { KernUser } from '../../common/rbac/rbac.types';
import { PayrollService } from './payroll.service';
import { RunPayrollDto } from './dto/run-payroll.dto';

@Controller('payroll')
@UseGuards(JwtAuthGuard, RbacGuard)
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @Post('runs')
  @RequirePermission('payroll', 'create')
  run(@CurrentKernUser() user: KernUser, @Body() dto: RunPayrollDto) {
    return this.payrollService.runPayroll(user, dto.periodStart, dto.periodEnd);
  }
}
