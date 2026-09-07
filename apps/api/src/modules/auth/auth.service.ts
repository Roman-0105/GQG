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
