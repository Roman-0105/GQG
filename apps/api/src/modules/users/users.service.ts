import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { KernUser } from '../../common/rbac/rbac.types';
import { CreateUserDto } from './dto/create-user.dto';

function permKey(p: { resource: string; action: string; scope: string }): string {
  return `${p.resource}:${p.action}:${p.scope}`;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: KernUser, dto: CreateUserDto) {
    const role = await this.prisma.role.findFirst({
      where: { id: dto.roleId, companyId: user.companyId },
      include: { permissions: true },
    });
    if (!role) {
      // Роль другой компании или несуществующая — не раскрываем разницу.
      throw new BadRequestException('Роль не найдена');
    }

    // Нельзя выдать роль с правами шире собственных — иначе HR с правом
    // user:create мог бы найти id роли «Владелец компании» через
    // GET /roles и создать себе (или сообщнику) полный доступ
    // (найдено security-review, эскалация привилегий).
    await this.assertCanGrantRole(user, role.permissions);

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

  /** Целевая роль не должна давать ни одного права, которого нет у создающего. */
  private async assertCanGrantRole(
    user: KernUser,
    targetPermissions: { resource: string; action: string; scope: string }[],
  ) {
    const callerAssignments = await this.prisma.roleAssignment.findMany({
      where: { userId: user.id },
      include: { role: { include: { permissions: true } } },
    });
    const callerPerms = new Set(
      callerAssignments.flatMap((a) => a.role.permissions.map(permKey)),
    );

    const escalates = targetPermissions.some((p) => !callerPerms.has(permKey(p)));
    if (escalates) {
      throw new ForbiddenException('Нельзя назначить роль с правами шире собственных');
    }
  }
}
