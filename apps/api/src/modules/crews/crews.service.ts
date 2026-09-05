import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { KernUser } from '../../common/rbac/rbac.types';
import { buildSiteScopeWhere } from '../../common/rbac/scope.util';
import { CreateCrewDto } from './dto/create-crew.dto';

@Injectable()
export class CrewsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Участок должен входить в scope пользователя и для чтения, и для
   * создания — иначе руководитель одного участка мог бы завести бригаду
   * на чужом (см. TODO, закрытый этим методом).
   */
  private async assertSiteInScope(user: KernUser, siteId: string, action: 'read' | 'create') {
    const where = buildSiteScopeWhere(user, 'site', 'read');
    const site = await this.prisma.site.findFirst({ where: { ...where, id: siteId } });
    if (!site) {
      throw new ForbiddenException(`Участок вне вашей области видимости (${action})`);
    }
    return site;
  }

  async create(user: KernUser, dto: CreateCrewDto) {
    await this.assertSiteInScope(user, dto.siteId, 'create');

    if (dto.foremanId) {
      // Prisma проверит только существование строки User (FK), не
      // компанию — без этой проверки при появлении второй компании в
      // БД можно было бы назначить бригадиром чужого пользователя
      // (найдено security-review).
      const foreman = await this.prisma.user.findFirst({
        where: { id: dto.foremanId, companyId: user.companyId },
      });
      if (!foreman) {
        throw new BadRequestException('Указанный пользователь не найден в вашей компании');
      }
    }

    return this.prisma.crew.create({ data: dto });
  }

  async findBySite(user: KernUser, siteId: string) {
    await this.assertSiteInScope(user, siteId, 'read');
    return this.prisma.crew.findMany({
      where: { siteId },
      include: {
        members: { include: { position: true } },
        // Только безопасные поля — полный User здесь содержал бы
        // passwordHash (нашлось при живой проверке Этапа 01).
        foreman: { select: { id: true, fullName: true, email: true } },
      },
    });
  }
}
