import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, RateRule } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type DB = Prisma.TransactionClient | PrismaService;

function round2(d: Prisma.Decimal): Prisma.Decimal {
  return d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

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
 * Ключевое архитектурное решение из спецификации (раздел 1.3, D1):
 * при пересечении RateRule побеждает ОДНО правило целиком (по priority,
 * затем специфичности, затем дате создания) — не пофилевое наследование.
 * Причина: RateRule хранит проценты как non-nullable Decimal с default
 * 0, поэтому "не задано" и "явно 0" неразличимы на уровне схемы.
 * Пофилевое наследование потребовало бы миграции на nullable-поля —
 * см. docs/adr/0004-payroll-engine.md.
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
      const rule = this.pickRule(allRules, t.siteId, employee.positionId);
      if (!rule) {
        throw new BadRequestException(
          `Нет применимого правила расчёта (RateRule) для табеля ${t.id} ` +
            `(участок ${t.siteId}, должность ${employee.positionId}). ` +
            'Настройте хотя бы одно общее правило компании (Должности → Правила расчёта) перед запуском расчёта.',
        );
      }
      appliedRules.push({ timesheetId: t.id, ruleId: rule.id, ruleName: rule.name });

      const rowBase = t.regularHours.mul(rate);
      const rowOvertime = t.overtimeHours.mul(rate).mul(mult);
      const rowNight = t.nightHours.mul(rate).mul(rule.nightShiftPct.div(100));
      const rowHoliday = t.isHoliday
        ? t.regularHours.plus(t.overtimeHours).mul(rate).mul(rule.holidayPct.div(100))
        : new Prisma.Decimal(0);
      // Вахтовая/удалённая надбавка — от уже заработанного (база + сверхурочные) этой строки.
      const rowRemote = rowBase.plus(rowOvertime).mul(rule.remoteBonusPct.div(100));
      const rowPieceRate = (t.metersDrilled ?? new Prisma.Decimal(0)).mul(rule.perMeterBonus);

      baseAmount = baseAmount.plus(rowBase);
      overtimeAmount = overtimeAmount.plus(rowOvertime);
      nightAmount = nightAmount.plus(rowNight);
      holidayAmount = holidayAmount.plus(rowHoliday);
      remoteBonusAmount = remoteBonusAmount.plus(rowRemote);
      pieceRateAmount = pieceRateAmount.plus(rowPieceRate);
    }

    // Суточные — по уникальным календарным дням, не по строкам табеля,
    // иначе задваиваются при нескольких табелях на одну дату
    // (спецификация, раздел 2.6).
    const perDiemAmount = this.calculatePerDiem(timesheets, allRules, employee.positionId);

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

  private pickRule(rules: RateRule[], siteId: string, positionId: string): RateRule | null {
    const candidates = rules.filter(
      (r) => (r.siteId === null || r.siteId === siteId) && (r.positionId === null || r.positionId === positionId),
    );
    if (candidates.length === 0) return null;

    candidates.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      const specA = (a.siteId ? 1 : 0) + (a.positionId ? 1 : 0);
      const specB = (b.siteId ? 1 : 0) + (b.positionId ? 1 : 0);
      if (specB !== specA) return specB - specA;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    return candidates[0];
  }

  private calculatePerDiem(
    timesheets: { workDate: Date; siteId: string }[],
    rules: RateRule[],
    positionId: string,
  ): Prisma.Decimal {
    const siteByDate = new Map<string, string>();
    for (const t of timesheets) {
      const key = t.workDate.toISOString().slice(0, 10);
      // Если на одну дату есть табели с разных участков — берём первый
      // встреченный; корректная обработка требует бизнес-решения
      // (см. docs/payroll-formulas.md, D7) и здесь намеренно не решается.
      if (!siteByDate.has(key)) siteByDate.set(key, t.siteId);
    }

    let total = new Prisma.Decimal(0);
    for (const siteId of siteByDate.values()) {
      const rule = this.pickRule(rules, siteId, positionId);
      if (rule) total = total.plus(rule.perDiemAmount);
    }
    return total;
  }
}
