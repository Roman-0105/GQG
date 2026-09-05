import { Prisma, RateRule } from '@prisma/client';

/**
 * Общая логика выбора применимого RateRule и построчного расчёта сумм —
 * используется и PayrollCalcService (расчёт зарплаты), и AnalyticsService
 * (фонд оплаты труда, стоимость метра в аналитике). Вынесено в общий
 * модуль намеренно: если бы у каждого была своя копия формулы, цифры
 * аналитики и реального расчёта ЗП рано или поздно разошлись бы молча.
 *
 * Формулы — по спецификации docs/payroll-formulas.md; архитектурное
 * решение о выборе правила целиком (не пофилево) — docs/adr/0004.
 */

export function pickRateRule(rules: RateRule[], siteId: string, positionId: string): RateRule | null {
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

export interface RateRuleRowInput {
  regularHours: Prisma.Decimal;
  overtimeHours: Prisma.Decimal;
  nightHours: Prisma.Decimal;
  isHoliday: boolean;
  metersDrilled: Prisma.Decimal | null;
}

export interface RowAmounts {
  base: Prisma.Decimal;
  overtime: Prisma.Decimal;
  night: Prisma.Decimal;
  holiday: Prisma.Decimal;
  remote: Prisma.Decimal;
  pieceRate: Prisma.Decimal;
}

/** Только те поля RateRule, что нужны для расчёта суммы одной строки. */
export type RuleRates = Pick<RateRule, 'nightShiftPct' | 'holidayPct' | 'remoteBonusPct' | 'perMeterBonus'>;

/**
 * Правило "по умолчанию — без надбавок", когда для строки не нашлось
 * ни одного применимого RateRule. Payroll в этом случае осознанно
 * падает ошибкой (D11) — это блокирующий финансовый расчёт. Аналитика
 * (Этап 04) не должна падать из-за неполной настройки правил на момент
 * просмотра дашборда — просто показывает часы без надбавок за такие строки.
 */
export const ZERO_RULE_RATES: RuleRates & { perDiemAmount: Prisma.Decimal } = {
  nightShiftPct: new Prisma.Decimal(0),
  holidayPct: new Prisma.Decimal(0),
  remoteBonusPct: new Prisma.Decimal(0),
  perMeterBonus: new Prisma.Decimal(0),
  perDiemAmount: new Prisma.Decimal(0),
};

/** Суммы по одной строке табеля — docs/payroll-formulas.md, раздел 2. */
export function computeRowAmounts(
  row: RateRuleRowInput,
  rate: Prisma.Decimal,
  overtimeMultiplier: Prisma.Decimal,
  rule: RuleRates,
): RowAmounts {
  const base = row.regularHours.mul(rate);
  const overtime = row.overtimeHours.mul(rate).mul(overtimeMultiplier);
  const night = row.nightHours.mul(rate).mul(rule.nightShiftPct.div(100));
  const holiday = row.isHoliday
    ? row.regularHours.plus(row.overtimeHours).mul(rate).mul(rule.holidayPct.div(100))
    : new Prisma.Decimal(0);
  // Вахтовая/удалённая надбавка — от уже заработанного (база + сверхурочные) этой строки.
  const remote = base.plus(overtime).mul(rule.remoteBonusPct.div(100));
  const pieceRate = (row.metersDrilled ?? new Prisma.Decimal(0)).mul(rule.perMeterBonus);
  return { base, overtime, night, holiday, remote, pieceRate };
}

/**
 * Суточные — по уникальным календарным дням, не по строкам табеля,
 * иначе задваиваются при нескольких табелях на одну дату (спецификация,
 * раздел 2.6). Если на одну дату есть табели с разных участков — берётся
 * первый встреченный (см. D7, открытый вопрос — не решается здесь).
 */
export function computePerDiem(
  timesheets: { workDate: Date; siteId: string }[],
  rules: RateRule[],
  positionId: string,
): Prisma.Decimal {
  const siteByDate = new Map<string, string>();
  for (const t of timesheets) {
    const key = t.workDate.toISOString().slice(0, 10);
    if (!siteByDate.has(key)) siteByDate.set(key, t.siteId);
  }

  let total = new Prisma.Decimal(0);
  for (const siteId of siteByDate.values()) {
    const rule = pickRateRule(rules, siteId, positionId);
    if (rule) total = total.plus(rule.perDiemAmount);
  }
  return total;
}

export function round2(d: Prisma.Decimal): Prisma.Decimal {
  return d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}
