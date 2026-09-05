import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';

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
}
