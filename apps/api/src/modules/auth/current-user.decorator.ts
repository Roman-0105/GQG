import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthUser {
  id: string;
  companyId: string;
  email: string;
}

/**
 * Достаёт "сырого" пользователя из JWT (request.user), в обход RbacGuard.
 * Для эндпоинтов вида "мои бригады"/"мои табели" — доступ к своим же
 * данным не должен зависеть от того, есть ли у роли общее право
 * "crew:read"/"timesheet:read" (у Бригадира по сиду его нет и не
 * должно быть — но свою бригаду он видеть обязан).
 */
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
