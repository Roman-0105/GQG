import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { KernUser } from '../../common/rbac/rbac.types';
import { CreateEmployeeDto } from './dto/create-employee.dto';

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: KernUser, dto: CreateEmployeeDto) {
    if (dto.crewId) {
      await this.assertCrewInScope(user, dto.crewId);
    }
    return this.prisma.employee.create({
      data: {
        companyId: user.companyId,
        fullName: dto.fullName,
        positionId: dto.positionId,
        crewId: dto.crewId,
        employmentType: dto.employmentType ?? 'staff',
      },
    });
  }

  async findAll(user: KernUser) {
    const perms = user.permissions.filter((p) => p.resource === 'employee' && p.action === 'read');
    const hasCompanyScope = perms.some((p) => p.scope === 'company');
    const where: Prisma.EmployeeWhereInput = { companyId: user.companyId, isActive: true };

    if (!hasCompanyScope) {
      const ownSites = perms.find((p) => p.scope === 'own_sites');
      if (ownSites) {
        where.crew = { siteId: { in: ownSites.siteIds } };
      } else {
        // Ни company, ни own_sites — сотрудников роль не должна видеть вовсе
        // (own_crew для employee пока не назначается ни одной роли из сида).
        where.id = '__no_access__';
      }
    }

    // Ставки (baseHourlyRate/baseRateOverride) — финансовые данные вне
    // зоны видимости не-company scope (docs/project-plan.md, раздел 2:
    // ставки — зона HR/Расчётчика, у руководителя участка — только
    // "бригады и табели своих объектов"). Раньше уходили всем через
    // include без разбора (найдено security-review, тот же класс
    // проблемы, что passwordHash в бригадах на Этапе 01).
    return this.prisma.employee.findMany({
      where,
      select: {
        id: true,
        fullName: true,
        employmentType: true,
        isActive: true,
        hiredAt: true,
        crewId: true,
        crew: { select: { id: true, name: true, siteId: true } },
        positionId: true,
        position: {
          select: {
            id: true,
            name: true,
            hazardPay: true,
            ...(hasCompanyScope ? { baseHourlyRate: true, overtimeMultiplier: true } : {}),
          },
        },
        ...(hasCompanyScope ? { baseRateOverride: true } : {}),
      },
    });
  }

  /** Проверяет, что бригада принадлежит участку из scope пользователя. */
  private async assertCrewInScope(user: KernUser, crewId: string) {
    const perms = user.permissions.filter((p) => p.resource === 'employee' && p.action === 'create');
    if (perms.some((p) => p.scope === 'company')) return;

    const ownSites = perms.find((p) => p.scope === 'own_sites');
    const crew = await this.prisma.crew.findUnique({ where: { id: crewId } });
    if (crew && ownSites?.siteIds.includes(crew.siteId)) return;

    throw new ForbiddenException('Бригада вне вашей области видимости');
  }
}
