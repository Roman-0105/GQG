import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { KernUser } from '../../common/rbac/rbac.types';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: KernUser, dto: CreateUserDto) {
    const role = await this.prisma.role.findFirst({
      where: { id: dto.roleId, companyId: user.companyId },
    });
    if (!role) {
      // Роль другой компании или несуществующая — не раскрываем разницу.
      throw new BadRequestException('Роль не найдена');
    }

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('Пользователь с таким e-mail уже есть');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const created = await this.prisma.user.create({
      data: {
        companyId: user.companyId,
        email: dto.email,
        fullName: dto.fullName,
        passwordHash,
        roleAssignments: { create: { roleId: role.id } },
      },
      include: { roleAssignments: { include: { role: true } } },
    });

    const { passwordHash: _omit, ...safe } = created;
    return safe;
  }

  async findAll(user: KernUser) {
    const users = await this.prisma.user.findMany({
      where: { companyId: user.companyId, isActive: true },
      include: { roleAssignments: { include: { role: true } } },
      orderBy: { fullName: 'asc' },
    });

    return users.map(({ passwordHash: _omit, ...safe }) => safe);
  }
}
