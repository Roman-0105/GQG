import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { KernUser } from '../../common/rbac/rbac.types';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(user: KernUser) {
    return this.prisma.role.findMany({
      where: { companyId: user.companyId },
      select: { id: true, name: true, isSystem: true },
      orderBy: { name: 'asc' },
    });
  }
}
