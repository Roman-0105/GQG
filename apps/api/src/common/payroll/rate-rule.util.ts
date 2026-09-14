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
  /** metersDrilled, поделённый на meterageShareCount — реально пройденный этим сотрудником метраж (см. computeRowAmounts). */
  effectiveMeters: Prisma.Decimal;
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

/**
 * Суммы по одной строке табеля — docs/payroll-formulas.md, раздел 2.
 *
 * meterageShareCount — на сколько человек делится metersDrilled этой
 * строки. Табель за метраж теперь ведётся ОДНИМ значением в день на
 * всю бригаду буровиков (см. TimesheetPeriodDetail.tsx —
 * handleTeamMeterageChange), а не по каждому отдельно, и это значение
 * дублируется в строку КАЖДОГО буровика на эту дату — иначе строка
 * потеряла бы привязку к сотруднику. Без деления метраж бригады
 * умножался бы на её численность (найдено владельцем: "расчёт должен
 * делиться на количество людей, а не один и тот же метраж
 * перемножаться на ставку"). Вызывающий обязан посчитать реальное
 * число буровиков, деливших эту проходку в этот день (см.
 * PayrollCalcService/AnalyticsService — там же и effectiveMeters для
 * агрегатов метража, чтобы не задваивать и его).
 */
export function computeRowAmounts(
  row: RateRuleRowInput,
  rate: Prisma.Decimal,
  overtimeMultiplier: Prisma.Decimal,
  rule: RuleRates,
  meterageShareCount = 1,
): RowAmounts {
  const base = row.regularHours.mul(rate);
  const overtime = row.overtimeHours.mul(rate).mul(overtimeMultiplier);
  const night = row.nightHours.mul(rate).mul(rule.nightShiftPct.div(100));
  const holiday = row.isHoliday
    ? row.regularHours.plus(row.overtimeHours).mul(rate).mul(rule.holidayPct.div(100))
    : new Prisma.Decimal(0);
  // Вахтовая/удалённая надбавка — от уже заработанного (база + сверхурочные) этой строки.
  const remote = base.plus(overtime).mul(rule.remoteBonusPct.div(100));
  const share = meterageShareCount > 0 ? meterageShareCount : 1;
  const effectiveMeters = (row.metersDrilled ?? new Prisma.Decimal(0)).div(share);
  const pieceRate = effectiveMeters.mul(rule.perMeterBonus);
  return { base, overtime, night, holiday, remote, pieceRate, effectiveMeters };
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

/**
 * Считает meterageShareCount для computeRowAmounts по уже загруженному
 * набору строк табеля — группирует по (табель за период, дата) и берёт
 * число РАЗНЫХ сотрудников в группе. `rows` должен содержать строки
 * ВСЕХ буровиков, деливших метраж в эти дни, не только одного —
 * PayrollCalcService (считает одного сотрудника за раз) обязан
 * доукомплектовать список отдельным запросом по бригаде; AnalyticsService
 * уже загружает всю бригаду разом, ему передавать нечего доукомплектовывать.
 */
export function buildMeterageShareCounts<T extends { id: string; timesheetPeriodId: string | null; workDate: Date; employeeId: string; metersDrilled: Prisma.Decimal | null }>(
  rows: T[],
): Map<string, number> {
  const groups = new Map<string, Set<string>>();
  for (const r of rows) {
    if (r.metersDrilled == null || !r.timesheetPeriodId) continue;
    const key = `${r.timesheetPeriodId}|${r.workDate.toISOString().slice(0, 10)}`;
    if (!groups.has(key)) groups.set(key, new Set());
    groups.get(key)!.add(r.employeeId);
  }
  const shareByRowId = new Map<string, number>();
  for (const r of rows) {
    if (r.metersDrilled == null || !r.timesheetPeriodId) continue;
    const key = `${r.timesheetPeriodId}|${r.workDate.toISOString().slice(0, 10)}`;
    shareByRowId.set(r.id, groups.get(key)?.size ?? 1);
  }
  return shareByRowId;
}

export function round2(d: Prisma.Decimal): Prisma.Decimal {
  return d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}
