import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Движок расчёта зарплаты. Реализация здесь — заглушка, реальные
 * формулы (сверхурочные, ночные/праздничные, вахта, суточные, сдельная
 * премия за метраж) утверждает агент payroll-rules спецификацией с
 * тестовыми сценариями (docs/project-plan.md, раздел 4) — backend-dev
 * реализует calculateForEmployee() строго по этой спецификации, а не
 * по собственным допущениям.
 *
 * Требование: каждая сумма возвращается отдельной строкой разбивки —
 * "чёрный ящик" без объяснения не принимается (см. план).
 */
@Injectable()
export class PayrollCalcService {
  constructor(private readonly prisma: PrismaService) {}

  async calculateForEmployee(employeeId: string, periodStart: Date, periodEnd: Date) {
    const timesheets = await this.prisma.timesheet.findMany({
      where: {
        employeeId,
        status: 'locked',
        workDate: { gte: periodStart, lte: periodEnd },
      },
    });

    const employee = await this.prisma.employee.findUniqueOrThrow({
      where: { id: employeeId },
      include: { position: true },
    });

    const baseRate = Number(employee.baseRateOverride ?? employee.position.baseHourlyRate);
    const totalRegular = timesheets.reduce((sum, t) => sum + Number(t.regularHours), 0);
    const totalOvertime = timesheets.reduce((sum, t) => sum + Number(t.overtimeHours), 0);

    // ЗАГЛУШКА: только база + сверхурочные по множителю должности.
    // Ночные/праздничные/вахтовые/суточные/сдельные — ждут спецификации
    // payroll-rules, см. TODO ниже.
    const baseAmount = totalRegular * baseRate;
    const overtimeAmount = totalOvertime * baseRate * Number(employee.position.overtimeMultiplier);

    return {
      employeeId,
      timesheetIds: timesheets.map((t) => t.id),
      baseAmount,
      overtimeAmount,
      nightAmount: 0, // TODO(payroll-rules): формула ночной надбавки
      holidayAmount: 0, // TODO(payroll-rules): формула праздничной надбавки
      remoteBonusAmount: 0, // TODO(payroll-rules): формула вахтовой/удалённой надбавки + суточные
      perDiemAmount: 0,
      pieceRateAmount: 0, // TODO(payroll-rules): сдельная премия за метраж
      deductions: 0,
      advanceDeduction: 0,
      netAmount: baseAmount + overtimeAmount,
    };
  }
}
