import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { buildSiteScopeWhere } from '../../common/rbac/scope.util';
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

  findOne(user: KernUser, id: string) {
    const where = buildSiteScopeWhere(user, 'site', 'read');
    return this.prisma.site.findFirst({ where: { ...where, id }, include: { crews: true } });
  }

  async update(user: KernUser, id: string, dto: UpdateSiteDto) {
    const where = buildSiteScopeWhere(user, 'site', 'read');
    const existing = await this.prisma.site.findFirst({ where: { ...where, id } });
    if (!existing) throw new NotFoundException('Участок не найден');

    return this.prisma.site.update({ where: { id }, data: dto });
  }

  async setArchived(user: KernUser, id: string, archived: boolean) {
    const where = buildSiteScopeWhere(user, 'site', 'read');
    const existing = await this.prisma.site.findFirst({ where: { ...where, id } });
    if (!existing) throw new NotFoundException('Участок не найден');

    return this.prisma.site.update({
      where: { id },
      data: { archivedAt: archived ? new Date() : null },
    });
  }
}
