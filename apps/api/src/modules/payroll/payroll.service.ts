import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { KernUser } from '../../common/rbac/rbac.types';
import { PayrollCalcService } from './payroll-calc.service';

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calc: PayrollCalcService,
  ) {}

  async runPayroll(user: KernUser, periodStart: string, periodEnd: string) {
    const start = new Date(periodStart);
    const end = new Date(periodEnd);

    const employees = await this.prisma.employee.findMany({
      where: { companyId: user.companyId, isActive: true },
    });

    const run = await this.prisma.payrollRun.create({
      data: { companyId: user.companyId, periodStart: start, periodEnd: end, status: 'draft' },
    });

    for (const employee of employees) {
      const result = await this.calc.calculateForEmployee(employee.id, start, end);
      if (result.timesheetIds.length === 0) continue;

      await this.prisma.payrollLine.create({
        data: {
          payrollRunId: run.id,
          employeeId: employee.id,
          baseAmount: result.baseAmount,
          overtimeAmount: result.overtimeAmount,
          nightAmount: result.nightAmount,
          holidayAmount: result.holidayAmount,
          remoteBonusAmount: result.remoteBonusAmount,
          perDiemAmount: result.perDiemAmount,
          pieceRateAmount: result.pieceRateAmount,
          deductions: result.deductions,
          advanceDeduction: result.advanceDeduction,
          netAmount: result.netAmount,
          timesheets: { connect: result.timesheetIds.map((id) => ({ id })) },
        },
      });
    }

    return this.prisma.payrollRun.findUnique({
      where: { id: run.id },
      include: { lines: { include: { employee: true } } },
    });
  }
}
