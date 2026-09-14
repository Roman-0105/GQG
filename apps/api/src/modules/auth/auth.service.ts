import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';

const BCRYPT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Неверный e-mail или пароль');
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Неверный e-mail или пароль');
    }

    const payload = { sub: user.id, companyId: user.companyId, email: user.email };
    return {
      accessToken: await this.jwt.signAsync(payload),
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        companyId: user.companyId,
      },
    };
  }

  /**
   * Профиль + эффективные права текущего пользователя — единая точка,
   * которой раньше не было вовсе: фронтенд узнавал название роли
   * окольным путём через GET /users (см. useCurrentUser.ts до этой
   * правки), а сами права ему были вообще недоступны, из-за чего
   * видимость вкладок навигации и кнопок согласования держалась на
   * хардкоженных сравнениях с названием роли (ACCOUNTANT_ROLE_NAME и
   * т.п. в TimesheetPeriodDetail.tsx) — переименование роли тихо
   * ломало эти сравнения. Без RbacGuard/@RequirePermission намеренно:
   * запрос своих же прав не должен зависеть от права user:read,
   * которого нет ни у Бригадира, ни у Бухгалтера.
   */
  async getMe(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { roleAssignments: { include: { role: { include: { permissions: true } } } } },
    });

    const permissions = user.roleAssignments.flatMap((assignment) =>
      assignment.role.permissions.map((p) => ({
        resource: p.resource,
        action: p.action,
        scope: p.scope,
        siteIds: assignment.siteIds,
      })),
    );

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      roles: user.roleAssignments.map((a) => a.role.name),
      permissions,
    };
  }

  /**
   * Смена собственного пароля — до сегодняшнего дня в продукте не было
   * НИКАКОГО способа сменить пароль (ни себе, ни чужой), включая
   * демо-пароль `change-me-now` из сида (найдено независимо devops и
   * docs-writer при подготовке Этапа 06 — реальный блокер для пилота
   * с настоящими деньгами). Требует знания текущего пароля — сброс
   * ЧУЖОГО забытого пароля администратором см. UsersService.update
   * (dto.password), это отдельный путь под правом user:update.
   */
  async changeOwnPassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Текущий пароль указан неверно');
    }
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    return { ok: true };
  }
}
