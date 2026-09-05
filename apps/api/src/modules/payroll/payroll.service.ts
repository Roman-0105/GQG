import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { KernUser } from '../../common/rbac/rbac.types';
import { PayrollCalcService } from './payroll-calc.service';

export interface EmployeeAdjustment {
  employeeId: string;
  amount: number;
}

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

  async runPayroll(
    user: KernUser,
    periodStart: string,
    periodEnd: string,
    advances: EmployeeAdjustment[] = [],
    deductions: EmployeeAdjustment[] = [],
  ) {
    const start = new Date(periodStart);
    const end = new Date(periodEnd);
    const advanceByEmployee = new Map(advances.map((a) => [a.employeeId, a.amount]));
    const deductionByEmployee = new Map(deductions.map((d) => [d.employeeId, d.amount]));

    // Транзакция: если для какого-то сотрудника не найдётся применимое
    // правило расчёта (RateRule), calculateForEmployee бросит исключение
    // (docs/payroll-formulas.md, раздел 1.3/D11) — весь запуск должен
    // откатиться, а не оставить в БД расчёт наполовину.
    const runId = await this.prisma.$transaction(async (tx) => {
      const employees = await tx.employee.findMany({ where: this.buildEmployeeScopeWhere(user) });

      const run = await tx.payrollRun.create({
        data: { companyId: user.companyId, periodStart: start, periodEnd: end, status: 'draft' },
      });

      for (const employee of employees) {
        const result = await this.calc.calculateForEmployee(
          employee.id,
          start,
          end,
          {
            advanceDeduction: advanceByEmployee.get(employee.id),
            deductions: deductionByEmployee.get(employee.id),
          },
          tx,
        );
        if (result.timesheetIds.length === 0) continue;

        await tx.payrollLine.create({
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

      return run.id;
    });

    return this.findOne(user, runId);
  }

  findAll(user: KernUser) {
    return this.prisma.payrollRun.findMany({
      where: { companyId: user.companyId },
      include: { lines: { select: { id: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(user: KernUser, id: string) {
    return this.prisma.payrollRun.findFirst({
      where: { id, companyId: user.companyId },
      include: {
        lines: {
          include: {
            employee: { select: { id: true, fullName: true, position: { select: { name: true } } } },
          },
        },
      },
    });
  }
}
