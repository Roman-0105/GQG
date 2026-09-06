import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { KernUser } from '../../common/rbac/rbac.types';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

// "company" видит то же, что "own_sites" и "own_crew", плюс больше —
// это не отдельное непересекающееся право, а более широкая область
// того же права. Раньше сравнение шло по точной строке "resource:
// action:scope", из-за чего владелец (у него везде scope=company) не
// мог назначить роль с более узким scope (own_sites/own_crew) — хотя
// это сужение, а не расширение прав. Баг всплыл при живом
// редактировании роли Бригадира и не был замечен раньше, потому что
// единственная роль, проверенная после введения этой проверки (HR),
// целиком состоит из company-scope прав и не задевала это сравнение.
const SCOPE_RANK: Record<string, number> = { own_crew: 1, own_sites: 2, company: 3 };

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
      where: { companyId: user.companyId },
      include: { roleAssignments: { include: { role: true } } },
      orderBy: { fullName: 'asc' },
    });

    return users.map(({ passwordHash: _omit, ...safe }) => safe);
  }

  async update(user: KernUser, id: string, dto: UpdateUserDto) {
    const target = await this.prisma.user.findFirst({ where: { id, companyId: user.companyId } });
    if (!target) throw new NotFoundException('Пользователь не найден');

    if (dto.roleId) {
      const role = await this.prisma.role.findFirst({
        where: { id: dto.roleId, companyId: user.companyId },
        include: { permissions: true },
      });
      if (!role) throw new BadRequestException('Роль не найдена');

      // Та же проверка, что и при создании — иначе роль можно было бы
      // расширить в обход assertCanGrantRole простым редактированием.
      await this.assertCanGrantRole(user, role.permissions);

      await this.prisma.roleAssignment.deleteMany({ where: { userId: id } });
      await this.prisma.roleAssignment.create({ data: { userId: id, roleId: role.id } });
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        fullName: dto.fullName,
        isActive: dto.isActive,
      },
      include: { roleAssignments: { include: { role: true } } },
    });

    const { passwordHash: _omit, ...safe } = updated;
    return safe;
  }

  /**
   * Целевая роль не должна давать ни по одному (ресурс, действие)
   * более широкую область видимости, чем уже есть у назначающего —
   * но более узкую (own_sites/own_crew там, где у него company)
   * назначать можно: это не эскалация, а ограничение.
   */
  private async assertCanGrantRole(
    user: KernUser,
    targetPermissions: { resource: string; action: string; scope: string }[],
  ) {
    const callerAssignments = await this.prisma.roleAssignment.findMany({
      where: { userId: user.id },
      include: { role: { include: { permissions: true } } },
    });

    // Максимальный ранг scope, который есть у назначающего, отдельно
    // на каждую пару (resource, action).
    const callerMaxScope = new Map<string, number>();
    for (const assignment of callerAssignments) {
      for (const p of assignment.role.permissions) {
        const key = `${p.resource}:${p.action}`;
        const rank = SCOPE_RANK[p.scope] ?? 0;
        callerMaxScope.set(key, Math.max(callerMaxScope.get(key) ?? 0, rank));
      }
    }

    const escalates = targetPermissions.some((p) => {
      const key = `${p.resource}:${p.action}`;
      const targetRank = SCOPE_RANK[p.scope] ?? 0;
      const callerRank = callerMaxScope.get(key) ?? 0;
      return callerRank < targetRank;
    });

    if (escalates) {
      throw new ForbiddenException('Нельзя назначить роль с правами шире собственных');
    }
  }
}
