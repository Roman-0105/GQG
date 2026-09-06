import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { KernUser } from '../../common/rbac/rbac.types';
import { isSiteAllowedByPermissions } from '../../common/rbac/scope.util';
import { CreateCrewDto } from './dto/create-crew.dto';
import { UpdateCrewDto } from './dto/update-crew.dto';

@Injectable()
export class CrewsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Участок должен входить в scope пользователя для того самого
   * действия, ради которого вызван текущий маршрут (create/read/
   * update/delete над crew) — не для отдельного ресурса "site".
   * user.permissions уже отфильтрован RbacGuard'ом ровно под нужный
   * (resource, action) этого маршрута, поэтому isSiteAllowedByPermissions
   * можно звать без повторного указания resource/action.
   *
   * Раньше здесь звался buildSiteScopeWhere(user, 'site', 'read') —
   * захардкоженный ресурс 'site' никогда не совпадал с реальными
   * правами (resource='crew') в user.permissions, поэтому проверка
   * всегда проваливалась в пустой fallback, а затем этот fallback
   * стирался явным `{ ...where, id: siteId }` (последний одноимённый
   * ключ в объектном литерале побеждает) — в сумме получался запрос
   * вообще без проверки scope (найдено security-review).
   */
  private async assertSiteInScope(user: KernUser, siteId: string, action: string) {
    if (!isSiteAllowedByPermissions(user, siteId)) {
      throw new ForbiddenException(`Участок вне вашей области видимости (${action})`);
    }
    const site = await this.prisma.site.findFirst({ where: { id: siteId, companyId: user.companyId } });
    if (!site) {
      throw new NotFoundException('Участок не найден');
    }
    return site;
  }

  private async assertForemanInCompany(user: KernUser, foremanId: string) {
    // Prisma проверит только существование строки User (FK), не
    // компанию — без этой проверки при появлении второй компании в БД
    // можно было бы назначить бригадиром чужого пользователя (найдено
    // security-review).
    const foreman = await this.prisma.user.findFirst({ where: { id: foremanId, companyId: user.companyId } });
    if (!foreman) {
      throw new BadRequestException('Указанный пользователь не найден в вашей компании');
    }
  }

  async create(user: KernUser, dto: CreateCrewDto) {
    await this.assertSiteInScope(user, dto.siteId, 'create');
    if (dto.foremanId) await this.assertForemanInCompany(user, dto.foremanId);
    return this.prisma.crew.create({ data: dto });
  }

  async findBySite(user: KernUser, siteId: string) {
    await this.assertSiteInScope(user, siteId, 'read');
    // Ставки (baseHourlyRate/baseRateOverride) — та же проблема, что была
    // найдена в EmployeesService.findAll: раньше уходили всем через
    // include без разбора scope. У "Руководителя участка" scope на crew:read
    // — own_sites, а не company, поэтому ставок ему по разделу 2 плана
    // видно быть не должно (найдено security-review).
    const hasCompanyScope = user.permissions.some(
      (p) => p.resource === 'crew' && p.action === 'read' && p.scope === 'company',
    );
    return this.prisma.crew.findMany({
      where: { siteId },
      include: {
        members: { select: this.memberSelect(hasCompanyScope) },
        // Только безопасные поля — полный User здесь содержал бы
        // passwordHash (нашлось при живой проверке Этапа 01).
        foreman: { select: { id: true, fullName: true, email: true } },
      },
    });
  }

  findMine(userId: string) {
    // Этот маршрут не защищён @RequirePermission (бригадир смотрит свою
    // же бригаду в обход общей scope-проверки, см. контроллер) — поэтому
    // здесь нет user.permissions, по которым можно было бы определить
    // company-scope. Бригадир по разделу 2 плана в принципе не должен
    // видеть индивидуальные ставки — hasCompanyScope всегда false.
    return this.prisma.crew.findMany({
      where: { foremanId: userId },
      include: {
        site: { select: { id: true, name: true, code: true } },
        members: { select: this.memberSelect(false) },
      },
    });
  }

  private memberSelect(hasCompanyScope: boolean) {
    return {
      id: true,
      fullName: true,
      employmentType: true,
      isActive: true,
      hiredAt: true,
      crewId: true,
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
    } as const;
  }

  private async getOwnedCrew(user: KernUser, id: string) {
    const crew = await this.prisma.crew.findUnique({ where: { id } });
    if (!crew) throw new NotFoundException('Бригада не найдена');
    await this.assertSiteInScope(user, crew.siteId, 'update');
    return crew;
  }

  async update(user: KernUser, id: string, dto: UpdateCrewDto) {
    await this.getOwnedCrew(user, id);
    if (dto.foremanId) await this.assertForemanInCompany(user, dto.foremanId);

    return this.prisma.crew.update({
      where: { id },
      data: dto,
      include: { foreman: { select: { id: true, fullName: true, email: true } } },
    });
  }

  async remove(user: KernUser, id: string) {
    await this.getOwnedCrew(user, id);

    // Проверяем сами, а не полагаемся на то, как именно Prisma завернёт
    // нарушение внешнего ключа (на практике это оказалась не
    // PrismaClientKnownRequestError с P2003, а "неизвестная" ошибка с
    // сырым кодом Postgres 23001 — ловить конкретный класс ошибки
    // хрупко и уже один раз подвело). Так сообщение пользователю точнее
    // и не зависит от деталей реализации Prisma.
    const [memberCount, timesheetCount] = await Promise.all([
      this.prisma.employee.count({ where: { crewId: id } }),
      this.prisma.timesheet.count({ where: { crewId: id } }),
    ]);

    if (memberCount > 0 || timesheetCount > 0) {
      throw new BadRequestException(
        memberCount > 0
          ? 'Нельзя удалить бригаду: в ней есть сотрудники. Сначала переведите их в другую бригаду.'
          : 'Нельзя удалить бригаду: по ней есть табели. Удаление бригады с историей табелей не предусмотрено.',
      );
    }

    await this.prisma.crew.delete({ where: { id } });
  }
}
