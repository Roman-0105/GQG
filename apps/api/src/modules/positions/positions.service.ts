import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { KernUser } from '../../common/rbac/rbac.types';
import { CreatePositionDto } from './dto/create-position.dto';

@Injectable()
export class PositionsService {
  constructor(private readonly prisma: PrismaService) {}

  create(user: KernUser, dto: CreatePositionDto) {
    return this.prisma.position.create({
      data: {
        companyId: user.companyId,
        name: dto.name,
        baseHourlyRate: dto.baseHourlyRate,
        overtimeMultiplier: dto.overtimeMultiplier ?? 1.5,
        hazardPay: dto.hazardPay ?? false,
      },
    });
  }

  findAll(user: KernUser) {
    return this.prisma.position.findMany({
      where: { companyId: user.companyId },
      orderBy: { name: 'asc' },
    });
  }
}
