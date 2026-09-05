import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { buildSiteScopeWhere } from '../../common/rbac/scope.util';
import { KernUser } from '../../common/rbac/rbac.types';
import { CreateSiteDto } from './dto/create-site.dto';

@Injectable()
export class SitesService {
  constructor(private readonly prisma: PrismaService) {}

  create(user: KernUser, dto: CreateSiteDto) {
    // Право "create" на "site" в этом каркасе выдаётся только со scope
    // "company" (см. seed ролей) — создание участка не бывает "своим".
    return this.prisma.site.create({
      data: { ...dto, companyId: user.companyId, status: 'planned' },
    });
  }

  findAll(user: KernUser) {
    const where = buildSiteScopeWhere(user, 'site', 'read');
    return this.prisma.site.findMany({ where, include: { crews: true } });
  }

  findOne(user: KernUser, id: string) {
    const where = buildSiteScopeWhere(user, 'site', 'read');
    return this.prisma.site.findFirst({ where: { ...where, id }, include: { crews: true } });
  }
}
