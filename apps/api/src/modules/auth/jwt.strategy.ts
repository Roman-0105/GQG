import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

interface JwtPayload {
  sub: string;
  companyId: string;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? 'change-me-before-any-real-deployment',
    });
  }

  async validate(payload: JwtPayload) {
    // Возвращённый объект попадает в request.user и читается RbacGuard'ом.
    return { id: payload.sub, companyId: payload.companyId, email: payload.email };
  }
}
