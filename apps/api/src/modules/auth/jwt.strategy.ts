import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { getJwtSecret } from '../../config/jwt-secret';

interface JwtPayload {
  sub: string;
  companyId: string;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: getJwtSecret(),
    });
  }

  /**
   * Подгружаем пользователя из БД на каждый запрос, а не доверяем
   * payload'у слепо — иначе токен уволенного/деактивированного
   * сотрудника продолжал бы работать до истечения TTL (до 8 часов),
   * что прямо нарушает требование раздела 6 плана про офлайн-токены
   * бригадира после увольнения (найдено security-review).
   */
  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Учётная запись недоступна');
    }
    return { id: user.id, companyId: user.companyId, email: user.email };
  }
}
