import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { KernUser } from '../../common/rbac/rbac.types';
import { CreateRateRuleDto } from './dto/create-rate-rule.dto';

@Injectable()
export class RateRulesService {
  constructor(private readonly prisma: PrismaService) {}

  create(user: KernUser, dto: CreateRateRuleDto) {
    return this.prisma.rateRule.create({
      data: {
        companyId: user.companyId,
        name: dto.name,
        siteId: dto.siteId,
        positionId: dto.positionId,
        nightShiftPct: dto.nightShiftPct ?? 0,
        holidayPct: dto.holidayPct ?? 0,
        remoteBonusPct: dto.remoteBonusPct ?? 0,
        perDiemAmount: dto.perDiemAmount ?? 0,
        perMeterBonus: dto.perMeterBonus ?? 0,
        priority: dto.priority ?? 0,
      },
    });
  }

  findAll(user: KernUser) {
    return this.prisma.rateRule.findMany({
      where: { companyId: user.companyId },
      include: { site: { select: { id: true, name: true } }, position: { select: { id: true, name: true } } },
      orderBy: { priority: 'desc' },
    });
  }
}
