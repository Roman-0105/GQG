import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { buildSiteScopeWhere, isSiteAllowedByPermissions } from '../../common/rbac/scope.util';
import { KernUser } from '../../common/rbac/rbac.types';
import { CreateSiteDto } from './dto/create-site.dto';
import { UpdateSiteDto } from './dto/update-site.dto';

@Injectable()
export class SitesService {
  constructor(private readonly prisma: PrismaService) {}

  create(user: KernUser, dto: CreateSiteDto) {
    return this.prisma.site.create({
      data: { ...dto, companyId: user.companyId, status: 'planned' },
    });
  }

  /**
   * По умолчанию скрывает архивные участки — они не должны засорять
   * повседневный список, но данные (табели, расчёты ЗП) по ним остаются
   * нетронутыми. showArchived=true — обратный список, для отдельной
   * вкладки «Архив».
   */
  findAll(user: KernUser, showArchived: boolean) {
    const where = buildSiteScopeWhere(user, 'site', 'read');
    return this.prisma.site.findMany({
      where: { ...where, archivedAt: showArchived ? { not: null } : null },
      include: { crews: true },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Проверка одной записи — через isSiteAllowedByPermissions, а не
   * buildSiteScopeWhere: комбинирование результата buildSiteScopeWhere
   * с явным `{ ..., id }` молча стирало проверку scope (найдено
   * security-review — тот же класс ошибки, что и передача неверного
   * action ниже в update/setArchived, обе исправлены разом).
   */
  private async assertSiteAllowed(user: KernUser, id: string) {
    if (!isSiteAllowedByPermissions(user, id)) {
      throw new ForbiddenException('Участок вне вашей области видимости');
    }
    const site = await this.prisma.site.findFirst({ where: { id, companyId: user.companyId } });
    if (!site) throw new NotFoundException('Участок не найден');
    return site;
  }

  async findOne(user: KernUser, id: string) {
    const site = await this.assertSiteAllowed(user, id);
    return this.prisma.site.findUnique({ where: { id: site.id }, include: { crews: true } });
  }

  async update(user: KernUser, id: string, dto: UpdateSiteDto) {
    await this.assertSiteAllowed(user, id);
    return this.prisma.site.update({ where: { id }, data: dto });
  }

  async setArchived(user: KernUser, id: string, archived: boolean) {
    await this.assertSiteAllowed(user, id);
    return this.prisma.site.update({
      where: { id },
      data: { archivedAt: archived ? new Date() : null },
    });
  }
}
