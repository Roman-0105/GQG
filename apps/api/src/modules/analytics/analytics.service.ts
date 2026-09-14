import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, RateRule } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { KernUser } from '../../common/rbac/rbac.types';
import { bucketKey, Grain } from '../../common/payroll/date-bucket.util';
import { buildMeterageShareCounts, computeRowAmounts, pickRateRule, round2, ZERO_RULE_RATES } from '../../common/payroll/rate-rule.util';

// Аналитика строится на подтверждённых часах — approved и locked.
// Черновики/на согласовании/возвращённые не в счёт: цифры на дашборде
// не должны шататься от ещё не проверенных данных бригадира
// (docs/project-plan.md, раздел 5).
const CONFIRMED_STATUSES = ['approved', 'locked'];

type TimesheetForAnalytics = Prisma.TimesheetGetPayload<{
  include: { employee: { include: { position: true } } };
}>;

interface Totals {
  regularHours: Prisma.Decimal;
  overtimeHours: Prisma.Decimal;
  nightHours: Prisma.Decimal;
  metersDrilled: Prisma.Decimal;
  laborCost: Prisma.Decimal;
  timesheetCount: number;
}

function emptyTotals(): Totals {
  return {
    regularHours: new Prisma.Decimal(0),
    overtimeHours: new Prisma.Decimal(0),
    nightHours: new Prisma.Decimal(0),
    metersDrilled: new Prisma.Decimal(0),
    laborCost: new Prisma.Decimal(0),
    timesheetCount: 0,
  };
}

function serializeTotals(t: Totals) {
  return {
    regularHours: round2(t.regularHours).toString(),
    overtimeHours: round2(t.overtimeHours).toString(),
    nightHours: round2(t.nightHours).toString(),
    metersDrilled: round2(t.metersDrilled).toString(),
    laborCost: round2(t.laborCost).toString(),
    costPerMeter: t.metersDrilled.gt(0) ? round2(t.laborCost.div(t.metersDrilled)).toString() : null,
    timesheetCount: t.timesheetCount,
  };
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Область видимости для аналитики: company — все участки компании,
   * own_sites — только перечисленные в RoleAssignment.siteIds, own_crew
   * (Бригадир) — выводится из Crew.foremanId, как и везде в RBAC (см.
   * scope.util.ts), и даёт ещё и crewIds — иначе фильтрация была бы по
   * ВСЕМУ участку бригадира и показывала бы чужие бригады того же
   * участка (найдено при добавлении аналитики бригадиру — раньше этого
   * scope тут не было вовсе, own_crew просто резолвился в пустой список
   * участков). requestedSiteId дополнительно сужает выбор и должен
   * входить в уже разрешённый список — иначе 403.
   */
  private async resolveScope(user: KernUser, requestedSiteId?: string): Promise<{ siteIds: string[]; crewIds?: string[] }> {
    const perms = user.permissions.filter((p) => p.resource === 'analytics' && p.action === 'read');
    const companySites = await this.prisma.site.findMany({
      where: { companyId: user.companyId },
      select: { id: true },
    });
    const companySiteIds = companySites.map((s) => s.id);

    let siteIds: string[];
    let crewIds: string[] | undefined;

    if (perms.some((p) => p.scope === 'company')) {
      siteIds = companySiteIds;
    } else if (perms.some((p) => p.scope === 'own_sites')) {
      const ownSites = perms.find((p) => p.scope === 'own_sites');
      siteIds = ownSites ? companySiteIds.filter((id) => ownSites.siteIds.includes(id)) : [];
    } else if (perms.some((p) => p.scope === 'own_crew')) {
      const crews = await this.prisma.crew.findMany({ where: { foremanId: user.id }, select: { id: true, siteId: true } });
      crewIds = crews.map((c) => c.id);
      siteIds = [...new Set(crews.map((c) => c.siteId))];
    } else {
      siteIds = [];
    }

    if (requestedSiteId) {
      if (!siteIds.includes(requestedSiteId)) {
        throw new ForbiddenException('Участок вне вашей области видимости');
      }
      siteIds = [requestedSiteId];
      if (crewIds) {
        crewIds = (
          await this.prisma.crew.findMany({ where: { foremanId: user.id, siteId: requestedSiteId }, select: { id: true } })
        ).map((c) => c.id);
      }
    }
    return { siteIds, crewIds };
  }

  /**
   * Стоимость и "эффективный" метраж одной строки табеля, с
   * дедупликацией суточных по (сотрудник, дата) — как в
   * PayrollCalcService. shareCounts — см. buildMeterageShareCounts:
   * без деления метраж бригады (одно значение в день на всех
   * буровиков, см. TimesheetPeriodDetail.tsx) умножался бы на её
   * численность и в фонде оплаты, и в статистике "метраж"/"₸ за метр".
   */
  private rowCostAndMeters(
    t: TimesheetForAnalytics,
    rules: RateRule[],
    perDiemSeen: Set<string>,
    shareCounts: Map<string, number>,
  ): { cost: Prisma.Decimal; meters: Prisma.Decimal } {
    const rate = t.employee.baseRateOverride ?? t.employee.position.baseHourlyRate;
    const mult = t.employee.position.overtimeMultiplier;
    const rule = pickRateRule(rules, t.siteId, t.employee.positionId) ?? ZERO_RULE_RATES;
    const row = computeRowAmounts(t, rate, mult, rule, shareCounts.get(t.id) ?? 1);
    let cost = row.base.plus(row.overtime).plus(row.night).plus(row.holiday).plus(row.remote).plus(row.pieceRate);

    const perDiemKey = `${t.employeeId}|${t.workDate.toISOString().slice(0, 10)}`;
    if (!perDiemSeen.has(perDiemKey)) {
      perDiemSeen.add(perDiemKey);
      cost = cost.plus(rule.perDiemAmount);
    }
    return { cost, meters: row.effectiveMeters };
  }

  async timeseries(user: KernUser, from: Date, to: Date, grain: Grain, siteId?: string) {
    const { siteIds, crewIds } = await this.resolveScope(user, siteId);
    const { timesheets, rules } = await this.loadTimesheetsForCompany(user.companyId, siteIds, from, to, crewIds);

    const buckets = new Map<string, Totals>();
    const perDiemSeen = new Set<string>();
    const shareCounts = buildMeterageShareCounts(timesheets);

    for (const t of timesheets) {
      const key = bucketKey(t.workDate, grain);
      const bucket = buckets.get(key) ?? emptyTotals();
      const { cost, meters } = this.rowCostAndMeters(t, rules, perDiemSeen, shareCounts);

      bucket.regularHours = bucket.regularHours.plus(t.regularHours);
      bucket.overtimeHours = bucket.overtimeHours.plus(t.overtimeHours);
      bucket.nightHours = bucket.nightHours.plus(t.nightHours);
      bucket.metersDrilled = bucket.metersDrilled.plus(meters);
      bucket.laborCost = bucket.laborCost.plus(cost);
      bucket.timesheetCount += 1;
      buckets.set(key, bucket);
    }

    return [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([bucket, totals]) => ({ bucket, ...serializeTotals(totals) }));
  }

  async totals(user: KernUser, from: Date, to: Date, siteId?: string) {
    const { siteIds, crewIds } = await this.resolveScope(user, siteId);
    const { timesheets, rules } = await this.loadTimesheetsForCompany(user.companyId, siteIds, from, to, crewIds);

    const totals = emptyTotals();
    const perDiemSeen = new Set<string>();
    const shareCounts = buildMeterageShareCounts(timesheets);
    for (const t of timesheets) {
      const { cost, meters } = this.rowCostAndMeters(t, rules, perDiemSeen, shareCounts);
      totals.regularHours = totals.regularHours.plus(t.regularHours);
      totals.overtimeHours = totals.overtimeHours.plus(t.overtimeHours);
      totals.nightHours = totals.nightHours.plus(t.nightHours);
      totals.metersDrilled = totals.metersDrilled.plus(meters);
      totals.laborCost = totals.laborCost.plus(cost);
      totals.timesheetCount += 1;
    }
    return serializeTotals(totals);
  }

  async budgetVsActual(user: KernUser, from: Date, to: Date, siteId?: string) {
    const { siteIds, crewIds } = await this.resolveScope(user, siteId);
    if (siteIds.length === 0) return [];

    const [sites, { timesheets, rules }] = await Promise.all([
      this.prisma.site.findMany({
        where: { id: { in: siteIds } },
        select: { id: true, name: true, code: true, budget: true },
      }),
      this.loadTimesheetsForCompany(user.companyId, siteIds, from, to, crewIds),
    ]);

    const perSite = new Map<string, { cost: Prisma.Decimal; hours: Prisma.Decimal }>();
    const perDiemSeen = new Set<string>();
    const shareCounts = buildMeterageShareCounts(timesheets);
    for (const t of timesheets) {
      const { cost } = this.rowCostAndMeters(t, rules, perDiemSeen, shareCounts);
      const acc = perSite.get(t.siteId) ?? { cost: new Prisma.Decimal(0), hours: new Prisma.Decimal(0) };
      acc.cost = acc.cost.plus(cost);
      acc.hours = acc.hours.plus(t.regularHours).plus(t.overtimeHours);
      perSite.set(t.siteId, acc);
    }

    return sites.map((s) => {
      const acc = perSite.get(s.id) ?? { cost: new Prisma.Decimal(0), hours: new Prisma.Decimal(0) };
      const budget = s.budget;
      return {
        siteId: s.id,
        siteName: s.name,
        siteCode: s.code,
        budget: budget ? budget.toString() : null,
        actualCost: round2(acc.cost).toString(),
        hoursTotal: round2(acc.hours).toString(),
        budgetUsedPct: budget && budget.gt(0) ? round2(acc.cost.div(budget).mul(100)).toString() : null,
      };
    });
  }

  private async loadTimesheetsForCompany(
    companyId: string,
    siteIds: string[],
    from: Date,
    to: Date,
    crewIds?: string[],
  ) {
    if (siteIds.length === 0) return { timesheets: [] as TimesheetForAnalytics[], rules: [] as RateRule[] };

    const [timesheets, rules] = await Promise.all([
      this.prisma.timesheet.findMany({
        where: {
          siteId: { in: siteIds },
          // Бригадир (own_crew) видит только СВОИ бригады, не весь
          // участок — иначе own_crew ничем не отличался бы от
          // own_sites и утекала бы аналитика по чужим бригадам того же
          // участка.
          ...(crewIds ? { crewId: { in: crewIds } } : {}),
          status: { in: CONFIRMED_STATUSES },
          workDate: { gte: from, lt: to },
        },
        include: { employee: { include: { position: true } } },
      }),
      this.prisma.rateRule.findMany({ where: { companyId } }),
    ]);
    return { timesheets, rules };
  }
}
