import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { KernUser } from '../../common/rbac/rbac.types';
import { PayrollCalcService } from './payroll-calc.service';

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calc: PayrollCalcService,
  ) {}

  /**
   * По сиду payroll:create даётся только со scope "company", поэтому
   * сегодня это не эксплуатируется — но модель прав явно допускает
   * владельцу собрать кастомную роль "расчётчик участка" со scope
   * own_sites (раздел 2 плана), и без этой проверки такая роль могла бы
   * запустить расчёт по всей компании, а не только по своим участкам
   * (найдено security-review).
   */
  private buildEmployeeScopeWhere(user: KernUser): Prisma.EmployeeWhereInput {
    const perms = user.permissions.filter((p) => p.resource === 'payroll' && p.action === 'create');
    const where: Prisma.EmployeeWhereInput = { companyId: user.companyId, isActive: true };

    if (perms.some((p) => p.scope === 'company')) return where;

    const ownSites = perms.find((p) => p.scope === 'own_sites');
    if (ownSites) {
      return { ...where, crew: { siteId: { in: ownSites.siteIds } } };
    }

    return { ...where, id: '__no_access__' };
  }

  async runPayroll(user: KernUser, periodStart: string, periodEnd: string) {
    const start = new Date(periodStart);
    const end = new Date(periodEnd);

    const employees = await this.prisma.employee.findMany({
      where: this.buildEmployeeScopeWhere(user),
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
