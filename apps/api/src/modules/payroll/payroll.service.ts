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

    const employees = await this.prisma.employee.findMany({ where: this.buildEmployeeScopeWhere(user) });

    // Само вычисление (calculateForEmployee) — чистое чтение (табели,
    // должности, правила), никак не связанное с записью PayrollRun/Line.
    // Раньше оно шло внутри $transaction по одному сотруднику за раз —
    // при N сотрудниках это N последовательных раундов запросов на
    // соединении, удерживаемом всё это время открытым. Под параллельной
    // нагрузкой (несколько одновременных запусков расчёта) это исчерпывало
    // пул соединений Prisma/Postgres и упиралось в дефолтный таймаут
    // интерактивной транзакции (5с) — часть запросов падала с 500,
    // остальные резко замедлялись (найдено qa-tester: 15 параллельных
    // запусков → 5-11 из 15 падают, время ответа успешных растёт до 4-9с).
    // Здесь чтение вынесено из транзакции и делается вне её — если для
    // кого-то из сотрудников не найдётся правило расчёта, исключение
    // прилетит здесь же, ДО создания PayrollRun, так что инвариант
    // "не оставлять наполовину посчитанный запуск в БД" сохраняется, а
    // сама транзакция теперь — только быстрые записи.
    const results: Awaited<ReturnType<PayrollCalcService['calculateForEmployee']>>[] = [];
    for (const employee of employees) {
      const result = await this.calc.calculateForEmployee(employee.id, start, end, {
        advanceDeduction: advanceByEmployee.get(employee.id),
        deductions: deductionByEmployee.get(employee.id),
      });
      if (result.timesheetIds.length === 0) continue;
      results.push(result);
    }

    const runId = await this.prisma.$transaction(
      async (tx) => {
        // Живьём воспроизведено (D:\Projects\GQS\api-dev.log, Postgres
        // 40P01 "обнаружена взаимоблокировка"): два параллельных запуска
        // расчёта по пересекающемуся периоду создают СВОИ PayrollLine и
        // каждый делает `timesheets: { connect: [...] }` — то есть
        // UPDATE Timesheet.payrollLineId для одних и тех же строк
        // табелей. При разном порядке блокировки строк между двумя
        // транзакциями это классический deadlock (было замаскировано
        // дефолтным 5с таймаутом интерактивной транзакции — Prisma рвала
        // соединение раньше, чем Postgres успевал сообщить настоящую
        // причину). Advisory-лок на companyId сериализует запись
        // расчётов одной компании между собой (сами расчёты — редкое
        // осознанное действие бухгалтера/владельца, не hot path,
        // сериализация здесь не создаёт ощутимой деградации), закрывая
        // deadlock в корне, а не таймаутом/ретраем поверх symptom'а.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.companyId}))`;

        const run = await tx.payrollRun.create({
          data: { companyId: user.companyId, periodStart: start, periodEnd: end, status: 'draft' },
        });

        for (const result of results) {
          await tx.payrollLine.create({
            data: {
              payrollRunId: run.id,
              employeeId: result.employeeId,
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
      },
      // Дефолт Prisma для интерактивной транзакции — timeout 5с, maxWait 2с.
      // Найдено qa-tester + подтверждено живьём (D:\Projects\GQS\api-dev.log):
      // "Transaction already closed... 5000 ms, however 10065 ms passed" —
      // при 15 одновременных запусках расчёта транзакция большую часть
      // времени просто ждёт свободное соединение в пуле Prisma/Postgres
      // (сам пул при этом не исчерпан на уровне Postgres — max_connections
      // 100, использовано ~22), а 5с дефолтного таймлимита на это ожидание
      // не хватает. Здесь запись уже вынесена в отдельную короткую
      // транзакцию (чтение — см. выше), поэтому щедрый timeout безопасен:
      // сама транзакция короткая, просто может подождать своей очереди на
      // соединение под пиковой нагрузкой вместо падения с 500.
      { timeout: 20_000, maxWait: 15_000 },
    );

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
