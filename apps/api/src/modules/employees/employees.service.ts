import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { KernUser } from '../../common/rbac/rbac.types';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: KernUser, dto: CreateEmployeeDto) {
    if (dto.crewId) {
      await this.assertCrewInScope(user, dto.crewId, 'create');
    }
    return this.prisma.employee.create({
      data: {
        companyId: user.companyId,
        fullName: dto.fullName,
        positionId: dto.positionId,
        crewId: dto.crewId,
        employmentType: dto.employmentType ?? 'staff',
        payType: dto.payType ?? 'hourly',
      },
    });
  }

  /**
   * Правка сотрудника внутри бригады — раньше должность можно было
   * задать только при создании, без пути назад (найдено при
   * тестировании владельцем). Смена crewId проверяется по ОБЕИМ
   * бригадам — старой и новой, — иначе руководитель одного участка мог
   * бы перевести сотрудника в бригаду чужого участка, зная только её id.
   */
  async update(user: KernUser, id: string, dto: UpdateEmployeeDto) {
    const employee = await this.prisma.employee.findFirst({ where: { id, companyId: user.companyId } });
    if (!employee) throw new NotFoundException('Сотрудник не найден');

    if (employee.crewId) {
      await this.assertCrewInScope(user, employee.crewId, 'update');
    }
    if (dto.crewId && dto.crewId !== employee.crewId) {
      await this.assertCrewInScope(user, dto.crewId, 'update');
    }

    return this.prisma.employee.update({
      where: { id },
      data: {
        fullName: dto.fullName,
        positionId: dto.positionId,
        crewId: dto.crewId,
        employmentType: dto.employmentType,
        payType: dto.payType,
        isActive: dto.isActive,
      },
    });
  }

  /**
   * Удаление сотрудника из бригады. Если по нему уже есть табели —
   * настоящее удаление стёрло бы историю часов/расчёта ЗП, поэтому
   * вместо этого сотрудник просто деактивируется (isActive=false,
   * пропадает из списков бригады и из выбора при внесении табеля) —
   * тот же принцип, что и у архивации участка. Без единого табеля в
   * истории — удаляется по-настоящему, без файлов-сирот в БД.
   */
  async remove(user: KernUser, id: string) {
    const employee = await this.prisma.employee.findFirst({ where: { id, companyId: user.companyId } });
    if (!employee) throw new NotFoundException('Сотрудник не найден');
    if (employee.crewId) {
      await this.assertCrewInScope(user, employee.crewId, 'delete');
    }

    const timesheetCount = await this.prisma.timesheet.count({ where: { employeeId: id } });
    if (timesheetCount > 0) {
      await this.prisma.employee.update({ where: { id }, data: { isActive: false } });
      return { deactivated: true, message: 'По сотруднику уже есть табели — вместо удаления он деактивирован и скрыт из списков.' };
    }

    await this.prisma.employee.delete({ where: { id } });
    return { deactivated: false };
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
        payType: true,
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

  /** Проверяет, что бригада принадлежит участку из scope пользователя для данного действия. */
  private async assertCrewInScope(user: KernUser, crewId: string, action: string) {
    const perms = user.permissions.filter((p) => p.resource === 'employee' && p.action === action);
    if (perms.some((p) => p.scope === 'company')) return;

    const ownSites = perms.find((p) => p.scope === 'own_sites');
    const crew = await this.prisma.crew.findUnique({ where: { id: crewId } });
    if (crew && ownSites?.siteIds.includes(crew.siteId)) return;

    throw new ForbiddenException('Бригада вне вашей области видимости');
  }
}
