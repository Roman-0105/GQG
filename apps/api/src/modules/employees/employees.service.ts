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
    const where: Prisma.EmployeeWhereInput = { companyId: user.companyId, isActive: true };

    if (!perms.some((p) => p.scope === 'company')) {
      const ownSites = perms.find((p) => p.scope === 'own_sites');
      if (ownSites) {
        where.crew = { siteId: { in: ownSites.siteIds } };
      } else {
        // Ни company, ни own_sites — сотрудников роль не должна видеть вовсе
        // (own_crew для employee пока не назначается ни одной роли из сида).
        where.id = '__no_access__';
      }
    }

    return this.prisma.employee.findMany({ where, include: { position: true, crew: true } });
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
