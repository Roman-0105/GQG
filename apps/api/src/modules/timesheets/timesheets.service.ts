import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { KernUser } from '../../common/rbac/rbac.types';
import { buildCrewScopeWhere } from '../../common/rbac/scope.util';
import { CreateTimesheetDto } from './dto/create-timesheet.dto';

/**
 * Явные переходы статусов вместо "любой статус в любой момент" —
 * см. docs/project-plan.md, раздел 4 (поток согласования).
 */
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft: ['submitted'],
  submitted: ['approved', 'rejected'],
  rejected: ['submitted'],
  approved: ['locked'],
  locked: [], // период закрыт — правки только через отдельную процедуру переоткрытия
};

@Injectable()
export class TimesheetsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Бригады, где пользователь назначен бригадиром — на них опирается
   * scope own_crew. RoleAssignment хранит own_sites-ограничение
   * (siteIds), а own_crew выводится из факта Crew.foremanId, поэтому
   * ownCrewIds нужно каждый раз считать через Prisma, а не пытаться
   * достать из user.permissions.
   */
  private getOwnCrewIds(userId: string): Promise<string[]> {
    return this.prisma.crew
      .findMany({ where: { foremanId: userId }, select: { id: true } })
      .then((rows) => rows.map((r) => r.id));
  }

  /**
   * Проверяет, что конкретный табель (по его реальной бригаде/участку)
   * входит в область видимости пользователя для действия над
   * timesheet — раньше эта проверка отсутствовала вовсе: RbacGuard
   * подтверждал только факт права "timesheet:approve" и т.п., без
   * привязки к записи, поэтому руководитель одного участка мог
   * согласовать/заблокировать табель чужого участка, просто зная его id
   * (IDOR, найдено security-review).
   */
  private async assertInScope(user: KernUser, target: { crewId: string; siteId: string }) {
    const perms = user.permissions.filter((p) => p.resource === 'timesheet');
    if (perms.some((p) => p.scope === 'company')) return;

    const ownSites = perms.find((p) => p.scope === 'own_sites');
    if (ownSites?.siteIds.includes(target.siteId)) return;

    if (perms.some((p) => p.scope === 'own_crew')) {
      const ownCrewIds = await this.getOwnCrewIds(user.id);
      if (ownCrewIds.includes(target.crewId)) return;
    }

    throw new ForbiddenException('Табель вне вашей области видимости');
  }

  async create(user: KernUser, dto: CreateTimesheetDto) {
    // Бригада и участок из тела запроса раньше принимались как есть —
    // источник правды для siteId должна быть сама бригада, иначе можно
    // было отправить чужие crewId/siteId вперемешку.
    const crew = await this.prisma.crew.findUnique({ where: { id: dto.crewId } });
    if (!crew) throw new BadRequestException('Бригада не найдена');
    if (crew.siteId !== dto.siteId) {
      throw new BadRequestException('Бригада не принадлежит указанному участку');
    }

    const employee = await this.prisma.employee.findUnique({ where: { id: dto.employeeId } });
    if (!employee || employee.crewId !== dto.crewId) {
      throw new BadRequestException('Сотрудник не найден в этой бригаде');
    }

    await this.assertInScope(user, { crewId: crew.id, siteId: crew.siteId });

    return this.prisma.timesheet.create({
      data: {
        employeeId: dto.employeeId,
        siteId: dto.siteId,
        crewId: dto.crewId,
        workDate: new Date(dto.workDate),
        workType: dto.workType,
        regularHours: dto.regularHours,
        overtimeHours: dto.overtimeHours ?? 0,
        nightHours: dto.nightHours ?? 0,
        metersDrilled: dto.metersDrilled,
        notes: dto.notes,
        clientCreatedAt: dto.clientCreatedAt ? new Date(dto.clientCreatedAt) : undefined,
        status: 'draft',
        submittedById: user.id,
      },
    });
  }

  async findAll(user: KernUser, status?: string) {
    const ownCrewIds = await this.getOwnCrewIds(user.id);
    const where = buildCrewScopeWhere(user, 'timesheet', 'read', ownCrewIds);
    return this.prisma.timesheet.findMany({
      where: status ? { ...where, status } : where,
      orderBy: { workDate: 'desc' },
      include: {
        employee: { select: { id: true, fullName: true, position: { select: { name: true } } } },
        crew: { select: { id: true, name: true } },
        site: { select: { id: true, name: true, code: true } },
        // Только безопасные поля — см. урок с passwordHash в crews (Этап 01).
        submittedBy: { select: { id: true, fullName: true } },
        approvedBy: { select: { id: true, fullName: true } },
      },
    });
  }

  /**
   * Единая точка смены статуса. Валидирует переход, область видимости
   * и, для approve, требует другого пользователя, чем автор —
   * согласование самим собой не в счёт (см. docs/project-plan.md, раздел 4).
   */
  async transition(user: KernUser, id: string, nextStatus: string) {
    const timesheet = await this.prisma.timesheet.findUnique({ where: { id } });
    if (!timesheet) throw new NotFoundException('Табель не найден');

    await this.assertInScope(user, { crewId: timesheet.crewId, siteId: timesheet.siteId });

    const allowed = ALLOWED_TRANSITIONS[timesheet.status] ?? [];
    if (!allowed.includes(nextStatus)) {
      throw new BadRequestException(
        `Нельзя перевести табель из "${timesheet.status}" в "${nextStatus}"`,
      );
    }

    if (nextStatus === 'approved' && timesheet.submittedById === user.id) {
      throw new BadRequestException('Нельзя согласовать собственный табель');
    }

    return this.prisma.timesheet.update({
      where: { id },
      data: {
        status: nextStatus,
        approvedById: nextStatus === 'approved' ? user.id : timesheet.approvedById,
      },
    });
  }
}
