import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { computePerDiem, computeRowAmounts, pickRateRule, round2 } from '../../common/payroll/rate-rule.util';

type DB = Prisma.TransactionClient | PrismaService;

function toDecimal(v: number | Prisma.Decimal | undefined): Prisma.Decimal {
  if (v === undefined) return new Prisma.Decimal(0);
  return v instanceof Prisma.Decimal ? v : new Prisma.Decimal(v);
}

export interface CalcOptions {
  advanceDeduction?: number | Prisma.Decimal;
  deductions?: number | Prisma.Decimal;
}

export interface AppliedRule {
  timesheetId: string;
  ruleId: string;
  ruleName: string;
}

/**
 * Движок расчёта зарплаты. Реализован строго по спецификации агента
 * payroll-rules — docs/payroll-formulas.md. Любое расхождение с этим
 * файлом — баг, заводится через qa-tester, а не тихо правится здесь.
 *
 * Само построчное вычисление сумм и выбор RateRule — в общем модуле
 * common/payroll/rate-rule.util.ts, которым пользуется и AnalyticsService
 * (Этап 04), чтобы цифры "фонд оплаты труда" в аналитике не могли
 * разойтись с реальным расчётом ЗП.
 */
@Injectable()
export class PayrollCalcService {
  constructor(private readonly prisma: PrismaService) {}

  async calculateForEmployee(
    employeeId: string,
    periodStart: Date,
    periodEnd: Date,
    options: CalcOptions = {},
    db: DB = this.prisma,
  ) {
    const timesheets = await db.timesheet.findMany({
      where: { employeeId, status: 'locked', workDate: { gte: periodStart, lte: periodEnd } },
    });

    const employee = await db.employee.findUniqueOrThrow({
      where: { id: employeeId },
      include: { position: true },
    });

    // Правила компании — небольшой, редко меняющийся набор, дешевле
    // выбрать один раз, чем гонять запрос на каждую строку табеля.
    const allRules = await db.rateRule.findMany({ where: { companyId: employee.companyId } });

    const rate = employee.baseRateOverride ?? employee.position.baseHourlyRate;
    const mult = employee.position.overtimeMultiplier;

    let baseAmount = new Prisma.Decimal(0);
    let overtimeAmount = new Prisma.Decimal(0);
    let nightAmount = new Prisma.Decimal(0);
    let holidayAmount = new Prisma.Decimal(0);
    let remoteBonusAmount = new Prisma.Decimal(0);
    let pieceRateAmount = new Prisma.Decimal(0);
    const appliedRules: AppliedRule[] = [];

    // Правило выбирается на каждую строку табеля отдельно, а не один
    // раз на сотрудника за период — Timesheet.siteId своё у каждой
    // строки (спецификация, раздел 1.1).
    for (const t of timesheets) {
      const rule = pickRateRule(allRules, t.siteId, employee.positionId);
      if (!rule) {
        throw new BadRequestException(
          `Нет применимого правила расчёта (RateRule) для табеля ${t.id} ` +
            `(участок ${t.siteId}, должность ${employee.positionId}). ` +
            'Настройте хотя бы одно общее правило компании (Должности → Правила расчёта) перед запуском расчёта.',
        );
      }
      appliedRules.push({ timesheetId: t.id, ruleId: rule.id, ruleName: rule.name });

      const row = computeRowAmounts(t, rate, mult, rule);
      baseAmount = baseAmount.plus(row.base);
      overtimeAmount = overtimeAmount.plus(row.overtime);
      nightAmount = nightAmount.plus(row.night);
      holidayAmount = holidayAmount.plus(row.holiday);
      remoteBonusAmount = remoteBonusAmount.plus(row.remote);
      pieceRateAmount = pieceRateAmount.plus(row.pieceRate);
    }

    const perDiemAmount = computePerDiem(timesheets, allRules, employee.positionId);

    const rounded = {
      baseAmount: round2(baseAmount),
      overtimeAmount: round2(overtimeAmount),
      nightAmount: round2(nightAmount),
      holidayAmount: round2(holidayAmount),
      remoteBonusAmount: round2(remoteBonusAmount),
      perDiemAmount: round2(perDiemAmount),
      pieceRateAmount: round2(pieceRateAmount),
      deductions: round2(toDecimal(options.deductions)),
      advanceDeduction: round2(toDecimal(options.advanceDeduction)),
    };

    const netAmount = round2(
      rounded.baseAmount
        .plus(rounded.overtimeAmount)
        .plus(rounded.nightAmount)
        .plus(rounded.holidayAmount)
        .plus(rounded.remoteBonusAmount)
        .plus(rounded.perDiemAmount)
        .plus(rounded.pieceRateAmount)
        .minus(rounded.deductions)
        .minus(rounded.advanceDeduction),
    );

    return {
      employeeId,
      timesheetIds: timesheets.map((t) => t.id),
      ...rounded,
      netAmount,
      // Не персистится в PayrollLine (схема этого не предусматривает),
      // но возвращается в ответе API — бухгалтер должен видеть, какое
      // правило применилось к какой строке, иначе разбивку нельзя
      // перепроверить вручную (см. docs/payroll-formulas.md, раздел 4).
      appliedRules,
    };
  }
}
