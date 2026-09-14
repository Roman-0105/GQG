import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { KernUser } from '../../common/rbac/rbac.types';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { SetShiftAssignmentsDto } from './dto/set-shift-assignments.dto';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  /** company/own_sites — как и везде; own_crew для задания не имеет смысла (задание создаёт не бригадир). */
  private async assertSiteInScope(user: KernUser, siteId: string, action: string) {
    const perms = user.permissions.filter((p) => p.resource === 'task' && p.action === action);
    if (perms.some((p) => p.scope === 'company')) return;
    const ownSites = perms.find((p) => p.scope === 'own_sites');
    if (ownSites?.siteIds.includes(siteId)) return;
    throw new ForbiddenException('Участок вне вашей области видимости');
  }

  async create(user: KernUser, dto: CreateTaskDto) {
    await this.assertSiteInScope(user, dto.siteId, 'create');

    // Бригадир выбирается напрямую (не бригада) — бригада ищется как
    // та, где выбранный пользователь назначен foremanId именно на этом
    // участке (см. requirements: "Строка с выбором бригадира").
    const crew = await this.prisma.crew.findFirst({ where: { siteId: dto.siteId, foremanId: dto.foremanId } });
    if (!crew) {
      throw new BadRequestException('Этот бригадир не назначен ни на одну бригаду этого участка');
    }

    return this.prisma.task.create({
      data: {
        siteId: dto.siteId,
        crewId: crew.id,
        foremanId: dto.foremanId,
        wellName: dto.wellName,
        projectedDepth: dto.projectedDepth,
        dailyPlan: dto.dailyPlan,
        mountDismountPlanHours: dto.mountDismountPlanHours,
        hasNightShift: dto.hasNightShift ?? false,
        createdById: user.id,
      },
    });
  }

  async findBySite(user: KernUser, siteId: string) {
    await this.assertSiteInScope(user, siteId, 'read');
    return this.prisma.task.findMany({
      where: { siteId },
      orderBy: { createdAt: 'desc' },
      include: {
        crew: { select: { id: true, name: true } },
        foreman: { select: { id: true, fullName: true } },
      },
    });
  }

  /** Задания, где текущий пользователь назначен бригадиром — без права, как /crews/mine. */
  findMine(userId: string) {
    return this.prisma.task.findMany({
      where: { foremanId: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        site: { select: { id: true, name: true } },
        crew: { select: { id: true, name: true } },
      },
    });
  }

  private async getOwned(id: string) {
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) throw new NotFoundException('Задание не найдено');
    return task;
  }

  /**
   * findOne и setShiftAssignments должны быть доступны и бригадиру-
   * владельцу задания (у которого нет и не должно быть общего
   * task:read/update — см. seed.ts), и начальнику участка/бухгалтеру
   * по обычному scope. Первый случай — просто владение (foremanId),
   * второй требует прав, а этот маршрут намеренно БЕЗ
   * @RequirePermission (иначе бригадира отсекло бы ещё до сервиса) —
   * поэтому права здесь читаются напрямую по userId, а не через
   * request.kernUser (которого без @RequirePermission не будет).
   */
  private async assertTaskInScope(userId: string, taskId: string, action: string) {
    const task = await this.getOwned(taskId);
    if (task.foremanId === userId) return task;

    const assignments = await this.prisma.roleAssignment.findMany({
      where: { userId },
      include: { role: { include: { permissions: { where: { resource: 'task', action } } } } },
    });
    const perms = assignments.flatMap((a) => a.role.permissions.map((p) => ({ scope: p.scope, siteIds: a.siteIds })));
    if (perms.some((p) => p.scope === 'company')) return task;
    if (perms.some((p) => p.scope === 'own_sites' && p.siteIds.includes(task.siteId))) return task;

    throw new ForbiddenException('Задание вне вашей области видимости');
  }

  async findOne(userId: string, id: string) {
    const task = await this.assertTaskInScope(userId, id, 'read');
    const [crew, assignments] = await Promise.all([
      this.prisma.crew.findUnique({
        where: { id: task.crewId },
        select: {
          id: true,
          name: true,
          members: {
            where: { isActive: true },
            select: { id: true, fullName: true, position: { select: { id: true, name: true } } },
          },
        },
      }),
      this.prisma.shiftAssignment.findMany({ where: { taskId: id } }),
    ]);

    return {
      ...task,
      site: await this.prisma.site.findUnique({ where: { id: task.siteId }, select: { id: true, name: true } }),
      crew,
      shiftAssignments: assignments,
    };
  }

  private addUTCDays(iso: string, days: number): string {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  /**
   * Гистограмма план/факт бурения — план строится автоматически от
   * проектной глубины и суточного плана (330 п.м. / 15 м/сутки = 22
   * дня), факт берётся из уже внесённого табеля за метраж (см.
   * TimesheetPeriodDetail.tsx — теперь одно значение в день на всю
   * бригаду, а не на каждого буровика по отдельности, поэтому здесь
   * значение за дату берётся один раз, а не суммируется по
   * сотрудникам — иначе факт умножился бы на число буровиков).
   * Учитываются только периоды с payType='per_meter' — часовые
   * геологи/пом. буровики к прогрессу бурения не относятся.
   */
  async progress(userId: string, taskId: string) {
    const task = await this.assertTaskInScope(userId, taskId, 'read');

    const periods = await this.prisma.timesheetPeriod.findMany({
      where: { taskId, payType: 'per_meter' },
      select: { periodStart: true },
    });

    const rows = await this.prisma.timesheet.findMany({
      where: { timesheetPeriod: { taskId, payType: 'per_meter' }, metersDrilled: { not: null } },
      select: { workDate: true, metersDrilled: true },
      orderBy: { workDate: 'asc' },
    });

    const byDate = new Map<string, number>();
    for (const r of rows) {
      const key = r.workDate.toISOString().slice(0, 10);
      if (!byDate.has(key)) byDate.set(key, Number(r.metersDrilled));
    }

    const projectedDepth = Number(task.projectedDepth);
    const dailyPlan = Number(task.dailyPlan);
    const totalPlanDays = dailyPlan > 0 ? Math.ceil(projectedDepth / dailyPlan) : 0;

    const sortedDates = [...byDate.keys()].sort();
    const earliestPeriodStart = periods.length ? periods.map((p) => p.periodStart.toISOString().slice(0, 10)).sort()[0] : null;
    const startDate = sortedDates[0] ?? earliestPeriodStart;

    if (!startDate || totalPlanDays === 0) {
      return {
        projectedDepth,
        dailyPlan,
        totalPlanDays,
        totalActual: 0,
        elapsedDays: 0,
        planToDate: 0,
        paceVsPlanPercent: null as number | null,
        days: [] as { date: string; plan: number; actual: number | null }[],
      };
    }

    const lastActualIndex = sortedDates.length
      ? Math.round(
          (new Date(`${sortedDates[sortedDates.length - 1]}T00:00:00Z`).getTime() - new Date(`${startDate}T00:00:00Z`).getTime()) / 86400000,
        )
      : 0;
    const dayCount = Math.max(totalPlanDays, lastActualIndex + 1);

    let cumulativePlan = 0;
    let totalActual = 0;
    const days: { date: string; plan: number; actual: number | null }[] = [];
    for (let i = 0; i < dayCount; i++) {
      const date = this.addUTCDays(startDate, i);
      const remaining = Math.max(0, projectedDepth - cumulativePlan);
      const plan = i < totalPlanDays ? Math.min(dailyPlan, remaining) : 0;
      cumulativePlan += plan;
      const actual = byDate.get(date) ?? null;
      if (actual != null) totalActual += actual;
      days.push({ date, plan: Math.round(plan * 100) / 100, actual });
    }

    // Отставание/опережение графика — не по последнему дню, а
    // накопительно: план за уже прошедшие дни (15 м/сутки × 7 дней =
    // 105 м) против фактически пройденного за эти же дни (116.3 м) =
    // 110.76% — хороший показатель, даже если в отдельные дни было
    // суточное отставание (нашёл владелец при обсуждении: важен темп
    // в целом, а не каждый день по отдельности).
    const elapsedDays = sortedDates.length ? lastActualIndex + 1 : 0;
    const planToDate = days.slice(0, elapsedDays).reduce((sum, d) => sum + d.plan, 0);
    const paceVsPlanPercent = elapsedDays > 0 && planToDate > 0 ? Math.round((totalActual / planToDate) * 1000) / 10 : null;

    return {
      projectedDepth,
      dailyPlan,
      totalPlanDays,
      totalActual: Math.round(totalActual * 100) / 100,
      elapsedDays,
      planToDate: Math.round(planToDate * 100) / 100,
      paceVsPlanPercent,
      days,
    };
  }

  async update(user: KernUser, id: string, dto: UpdateTaskDto) {
    const task = await this.getOwned(id);
    await this.assertSiteInScope(user, task.siteId, 'update');
    return this.prisma.task.update({
      where: { id },
      data: {
        wellName: dto.wellName,
        projectedDepth: dto.projectedDepth,
        dailyPlan: dto.dailyPlan,
        mountDismountPlanHours: dto.mountDismountPlanHours,
        hasNightShift: dto.hasNightShift,
      },
    });
  }

  /**
   * Бригадир распределяет свою бригаду по сменам — заменяет
   * распределение целиком (не точечный PATCH одного человека), потому
   * что обычно расставляют всех сразу. Каждый сотрудник должен
   * принадлежать бригаде именно этого задания — иначе можно было бы
   * распределить чужого сотрудника, зная только его id.
   */
  async setShiftAssignments(userId: string, taskId: string, dto: SetShiftAssignmentsDto) {
    const task = await this.assertTaskInScope(userId, taskId, 'update');

    const employeeIds = dto.assignments.map((a) => a.employeeId);
    if (employeeIds.length > 0) {
      const validCount = await this.prisma.employee.count({ where: { id: { in: employeeIds }, crewId: task.crewId } });
      if (validCount !== new Set(employeeIds).size) {
        throw new BadRequestException('Не все сотрудники принадлежат бригаде этого задания');
      }
    }

    await this.prisma.$transaction([
      this.prisma.shiftAssignment.deleteMany({ where: { taskId } }),
      this.prisma.shiftAssignment.createMany({
        data: dto.assignments.map((a) => ({ taskId, employeeId: a.employeeId, shift: a.shift })),
      }),
    ]);

    return this.prisma.shiftAssignment.findMany({ where: { taskId } });
  }
}
