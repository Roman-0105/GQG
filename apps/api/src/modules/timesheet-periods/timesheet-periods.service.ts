import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Crew } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { KernUser } from '../../common/rbac/rbac.types';
import { CreateTimesheetPeriodDto } from './dto/create-timesheet-period.dto';
import { UpdateTimesheetPeriodDto } from './dto/update-timesheet-period.dto';

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft: ['submitted'],
  submitted: ['approved', 'rejected'],
  rejected: ['submitted'],
  approved: [],
};

// "Кем согласован/не согласован" требует не только имени, но и
// должности (см. запрос владельца) — берём её из текущих ролей
// пользователя, отдельно на момент решения нигде не храним (роль в
// маленькой компании не меняется каждый день).
const reviewedBySelect = {
  select: {
    id: true,
    fullName: true,
    roleAssignments: { select: { role: { select: { name: true } } }, take: 1 },
  },
} as const;

/**
 * Табель за период: бригадир формирует рабочий календарь, сразу
 * заполняет сетку часов (без предварительного согласования самого
 * факта создания периода) и отправляет ЦЕЛИКОМ на согласование —
 * начальник участка ИЛИ бухгалтер (кто первый посмотрит) согласовывает
 * или отклоняет весь табель одним решением, а не по каждому дню/
 * сотруднику отдельно (см. Approvals.tsx). Само решение — одна подпись,
 * не две: в маленькой компании начальник участка и бухгалтер равно
 * компетентны подтвердить табель, дублировать шаг незачем.
 *
 * Строки Timesheet внутри периода каскадно следуют статусу периода
 * (submit -> все draft/rejected строки становятся submitted; approve ->
 * все становятся locked, готовы к расчёту ЗП; reject -> откатываются в
 * draft для правки) — отдельного согласования по строкам для табеля за
 * период больше нет, это и вызывало путаницу ("по каждому сотруднику
 * отдельно", найдено при тестировании).
 */
@Injectable()
export class TimesheetPeriodsService {
  constructor(private readonly prisma: PrismaService) {}

  private getOwnCrewIds(userId: string): Promise<string[]> {
    return this.prisma.crew
      .findMany({ where: { foremanId: userId }, select: { id: true } })
      .then((rows) => rows.map((r) => r.id));
  }

  /**
   * Проверка scope по паре (timesheet_period, action) — тот же паттерн,
   * что и в TimesheetsService.assertInScope, только на уровне бригады,
   * а не отдельного табеля (own_crew выводится из Crew.foremanId, а не
   * хранится в RoleAssignment — см. комментарий там же).
   */
  private async assertCrewInScope(user: KernUser, crewId: string, action: string): Promise<Crew> {
    const crew = await this.prisma.crew.findUnique({ where: { id: crewId } });
    if (!crew) throw new NotFoundException('Бригада не найдена');

    const perms = user.permissions.filter((p) => p.resource === 'timesheet_period' && p.action === action);
    if (perms.some((p) => p.scope === 'company')) return crew;

    const ownSites = perms.find((p) => p.scope === 'own_sites');
    if (ownSites?.siteIds.includes(crew.siteId)) return crew;

    if (perms.some((p) => p.scope === 'own_crew')) {
      const ownCrewIds = await this.getOwnCrewIds(user.id);
      if (ownCrewIds.includes(crewId)) return crew;
    }

    throw new ForbiddenException('Бригада вне вашей области видимости');
  }

  private async getOwned(user: KernUser, id: string, action: string) {
    const period = await this.prisma.timesheetPeriod.findUnique({ where: { id } });
    if (!period) throw new NotFoundException('Табель за период не найден');
    await this.assertCrewInScope(user, period.crewId, action);
    return period;
  }

  async create(user: KernUser, dto: CreateTimesheetPeriodDto) {
    await this.assertCrewInScope(user, dto.crewId, 'create');

    const start = new Date(dto.periodStart);
    const end = new Date(dto.periodEnd);
    if (end < start) {
      throw new BadRequestException('Дата окончания периода раньше даты начала');
    }

    if (dto.taskId) {
      const task = await this.prisma.task.findUnique({ where: { id: dto.taskId } });
      if (!task || task.crewId !== dto.crewId) {
        throw new BadRequestException('Задание не найдено для этой бригады');
      }
    }

    await this.assertNoOverlap(dto.crewId, start, end);

    // Смешанная по оплате бригада (часть на почасовой, часть на
    // метраже — см. Employee.payType) формирует ДВА раздельных табеля
    // на один и тот же период, а не один со всеми полями сразу: иначе
    // либо метраж лез бы в чисто почасовой табель (найдено при
    // тестировании владельцем — реальный баг), либо пришлось бы
    // выбирать один payType и терять часть бригады из сетки.
    const members = await this.prisma.employee.findMany({
      where: { crewId: dto.crewId, isActive: true },
      select: { payType: true },
    });
    const payTypesPresent = [...new Set(members.map((m) => m.payType))];
    // Пустая бригада (сотрудников ещё не завели) — один почасовой
    // табель по умолчанию, донабрать людей любого типа оплаты можно
    // и после.
    const payTypes = payTypesPresent.length > 0 ? payTypesPresent : ['hourly'];

    return Promise.all(
      payTypes.map((payType) =>
        this.prisma.timesheetPeriod.create({
          data: {
            crewId: dto.crewId,
            taskId: dto.taskId,
            periodStart: start,
            periodEnd: end,
            workType: dto.workType ?? 'drilling',
            payType,
            createdById: user.id,
          },
        }),
      ),
    );
  }

  /**
   * Пересекающиеся календари одной бригады — почти наверняка ошибка
   * (например, забыли, что уже создали табель на эти даты), а не
   * осознанный сценарий: один человек не может одновременно числиться
   * на смене по двум разным периодам. Отклонённые периоды не в счёт —
   * они не подтверждены и не должны блокировать новую попытку.
   */
  private async assertNoOverlap(crewId: string, start: Date, end: Date, excludeId?: string) {
    const overlapping = await this.prisma.timesheetPeriod.findFirst({
      where: {
        crewId,
        status: { not: 'rejected' },
        id: excludeId ? { not: excludeId } : undefined,
        periodStart: { lte: end },
        periodEnd: { gte: start },
      },
    });
    if (overlapping) {
      throw new BadRequestException(
        'На эти даты у бригады уже есть другой табель за период — измените даты или отклоните старый.',
      );
    }
  }

  async findByCrew(user: KernUser, crewId: string) {
    await this.assertCrewInScope(user, crewId, 'read');
    const periods = await this.prisma.timesheetPeriod.findMany({
      where: { crewId },
      orderBy: { periodStart: 'desc' },
      include: {
        createdBy: { select: { id: true, fullName: true } },
        submittedBy: { select: { id: true, fullName: true } },
        reviewedBy: reviewedBySelect,
        task: { select: { id: true, wellName: true } },
        _count: { select: { timesheets: true } },
      },
    });

    // "Закрытый" табель (вкладка «Табеля», фильтр Открытые/Закрытые) —
    // согласованный (готов к расчёту ЗП); отклонённый или ещё не
    // рассмотренный — открытый, требует действия.
    return periods.map((period) => ({ ...period, isClosed: period.status === 'approved' }));
  }

  async findOne(user: KernUser, id: string) {
    const period = await this.prisma.timesheetPeriod.findUnique({
      where: { id },
      include: {
        // Состав бригады — прямо здесь, а не через отдельный
        // GET /employees: у Бригадира нет и не должно быть общего
        // employee:read (см. seed.ts), а без списка сотрудников сетку
        // часов нечем наполнить. Доступ к самому периоду уже проверен
        // (assertCrewInScope ниже) — значит, видеть состав ЭТОЙ бригады
        // безопасно. Отфильтровано по payType самого табеля — у
        // смешанной бригады это ровно тот список, для кого этот
        // конкретный табель (см. create) и был сформирован.
        crew: {
          select: {
            id: true,
            name: true,
            siteId: true,
            site: { select: { id: true, name: true } },
            members: {
              where: { isActive: true },
              select: { id: true, fullName: true, payType: true, position: { select: { id: true, name: true } } },
            },
          },
        },
        createdBy: { select: { id: true, fullName: true } },
        submittedBy: { select: { id: true, fullName: true } },
        reviewedBy: reviewedBySelect,
        task: { select: { id: true, wellName: true } },
        // История решений — вся цепочка отправок/согласований/отклонений
        // с датой, автором и комментарием (найдено при тестировании:
        // одного последнего решения недостаточно, если табель отправляли
        // не один раз).
        reviews: {
          orderBy: { createdAt: 'desc' },
          include: { actor: reviewedBySelect },
        },
      },
    });
    if (!period) throw new NotFoundException('Табель за период не найден');
    await this.assertCrewInScope(user, period.crewId, 'read');

    return {
      ...period,
      crew: { ...period.crew, members: period.crew.members.filter((m) => m.payType === period.payType) },
    };
  }

  async update(user: KernUser, id: string, dto: UpdateTimesheetPeriodDto) {
    const period = await this.getOwned(user, id, 'update');

    const start = dto.periodStart ? new Date(dto.periodStart) : period.periodStart;
    const end = dto.periodEnd ? new Date(dto.periodEnd) : period.periodEnd;
    if (end < start) {
      throw new BadRequestException('Дата окончания периода раньше даты начала');
    }
    await this.assertNoOverlap(period.crewId, start, end, period.id);

    return this.prisma.timesheetPeriod.update({
      where: { id },
      data: { periodStart: start, periodEnd: end, workType: dto.workType ?? period.workType },
    });
  }

  private assertTransition(current: string, next: string) {
    const allowed = ALLOWED_TRANSITIONS[current] ?? [];
    if (!allowed.includes(next)) {
      throw new BadRequestException(`Нельзя перевести табель за период из "${current}" в "${next}"`);
    }
  }

  /**
   * Бригадир отправляет весь табель на согласование целиком. Комментарий
   * необязателен при первой отправке, но обязателен при повторной
   * (после отклонения) — по требованию бригадир должен написать, что
   * исправил согласно замечаниям, либо объяснить, почему не согласен с
   * причиной отклонения.
   */
  async submit(user: KernUser, id: string, comment?: string) {
    const period = await this.getOwned(user, id, 'update');
    this.assertTransition(period.status, 'submitted');

    if (period.status === 'rejected' && !comment?.trim()) {
      throw new BadRequestException(
        'Табель был не согласован — укажите в комментарии, что исправлено, либо почему вы не согласны с причиной',
      );
    }

    await this.prisma.timesheet.updateMany({
      where: { timesheetPeriodId: id, status: { in: ['draft', 'rejected'] } },
      data: { status: 'submitted' },
    });

    const [updated] = await this.prisma.$transaction([
      this.prisma.timesheetPeriod.update({
        where: { id },
        data: {
          status: 'submitted',
          submittedAt: new Date(),
          submittedById: user.id,
          reviewedAt: null,
          reviewedById: null,
          rejectionReason: null,
        },
      }),
      this.prisma.timesheetPeriodReview.create({
        data: { periodId: id, action: 'submitted', comment: comment?.trim() || null, actorId: user.id },
      }),
    ]);
    return updated;
  }

  /**
   * Согласовать весь табель — одна подпись (начальник участка ИЛИ
   * бухгалтер, кто первый посмотрел), не две. Строки каскадно уходят в
   * locked — сразу готовы к расчёту ЗП, отдельного шага "заблокировать"
   * для табеля за период больше нет.
   */
  async approve(user: KernUser, id: string, comment?: string) {
    const period = await this.getOwned(user, id, 'approve');
    if (period.status !== 'submitted') {
      throw new BadRequestException(`Нельзя согласовать табель за период в статусе "${period.status}"`);
    }

    await this.prisma.timesheet.updateMany({
      where: { timesheetPeriodId: id, status: 'submitted' },
      data: { status: 'locked' },
    });

    const [updated] = await this.prisma.$transaction([
      this.prisma.timesheetPeriod.update({
        where: { id },
        data: { status: 'approved', reviewedAt: new Date(), reviewedById: user.id, rejectionReason: null },
      }),
      this.prisma.timesheetPeriodReview.create({
        data: { periodId: id, action: 'approved', comment: comment?.trim() || null, actorId: user.id },
      }),
    ]);
    return updated;
  }

  /** Отклонить весь табель с обязательной причиной — строки возвращаются в draft на правку. */
  async reject(user: KernUser, id: string, reason: string) {
    const period = await this.getOwned(user, id, 'approve');
    if (period.status !== 'submitted') {
      throw new BadRequestException(`Нельзя отклонить табель за период в статусе "${period.status}"`);
    }

    await this.prisma.timesheet.updateMany({
      where: { timesheetPeriodId: id, status: 'submitted' },
      data: { status: 'draft' },
    });

    const [updated] = await this.prisma.$transaction([
      this.prisma.timesheetPeriod.update({
        where: { id },
        data: { status: 'rejected', reviewedAt: new Date(), reviewedById: user.id, rejectionReason: reason },
      }),
      this.prisma.timesheetPeriodReview.create({
        data: { periodId: id, action: 'rejected', comment: reason, actorId: user.id },
      }),
    ]);
    return updated;
  }

  /**
   * Счётчик отправленных на согласование табелей по каждой бригаде в
   * области видимости пользователя — индикатор на карточках
   * участка/бригады во вкладке «Согласование» (найдено при
   * тестировании: без него начальнику участка/бухгалтеру приходилось
   * открывать каждую бригаду по очереди, чтобы узнать, есть ли что
   * рассматривать).
   */
  async pendingCounts(user: KernUser): Promise<Record<string, number>> {
    const perms = user.permissions.filter((p) => p.resource === 'timesheet_period' && p.action === 'read');
    const where: {
      status: string;
      crewId?: { in: string[] };
      crew?: { siteId?: { in: string[] }; site?: { companyId: string } };
    } = { status: 'submitted' };

    if (perms.some((p) => p.scope === 'company')) {
      where.crew = { site: { companyId: user.companyId } };
    } else if (perms.some((p) => p.scope === 'own_sites')) {
      const ownSites = perms.find((p) => p.scope === 'own_sites');
      where.crew = { siteId: { in: ownSites?.siteIds ?? [] } };
    } else if (perms.some((p) => p.scope === 'own_crew')) {
      where.crewId = { in: await this.getOwnCrewIds(user.id) };
    } else {
      return {};
    }

    const rows = await this.prisma.timesheetPeriod.groupBy({ by: ['crewId'], where, _count: { _all: true } });
    return Object.fromEntries(rows.map((r) => [r.crewId, r._count._all]));
  }

  /**
   * "Редактировать график" — точечно возвращает уже отправленные
   * (submitted) записи за выбранные дни обратно в draft, не трогая
   * статус самого периода. Нужно, пока период ещё не рассмотрен
   * (submitted) и бригадир сам заметил ошибку в паре дней — не ждать
   * решения проверяющего, чтобы поправить. Как только период
   * рассмотрен, записи либо locked (согласован — правка через
   * начальника участка/бухгалтера отдельно), либо уже снова draft
   * (отклонён — редактируются в сетке напрямую, без этой ручки).
   */
  async reopenDays(user: KernUser, periodId: string, dto: { fromDate: string; toDate: string; reason: string; employeeId?: string }) {
    const period = await this.getOwned(user, periodId, 'update');

    const from = new Date(dto.fromDate);
    const to = new Date(dto.toDate);
    if (to < from) {
      throw new BadRequestException('Дата окончания раньше даты начала');
    }

    const result = await this.prisma.timesheet.updateMany({
      where: {
        timesheetPeriodId: period.id,
        workDate: { gte: from, lte: to },
        status: 'submitted',
        ...(dto.employeeId ? { employeeId: dto.employeeId } : {}),
      },
      data: { status: 'draft', correctionReason: dto.reason },
    });

    return { reopened: result.count };
  }
}
