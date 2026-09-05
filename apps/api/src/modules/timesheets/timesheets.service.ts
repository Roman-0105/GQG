import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
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

  async create(user: KernUser, dto: CreateTimesheetDto) {
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

  async findAll(user: KernUser, ownCrewIds: string[]) {
    const where = buildCrewScopeWhere(user, 'timesheet', 'read', ownCrewIds);
    return this.prisma.timesheet.findMany({ where, orderBy: { workDate: 'desc' } });
  }

  /**
   * Единая точка смены статуса. Валидирует переход и, для approve,
   * требует другого пользователя, чем автор — согласование самим собой
   * не в счёт (см. docs/project-plan.md, раздел 4).
   */
  async transition(user: KernUser, id: string, nextStatus: string) {
    const timesheet = await this.prisma.timesheet.findUnique({ where: { id } });
    if (!timesheet) throw new NotFoundException('Табель не найден');

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
