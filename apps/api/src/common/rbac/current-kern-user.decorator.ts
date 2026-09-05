import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { KernUser } from './rbac.types';

/**
 * Достаёт KernUser, положенный RbacGuard'ом в request.
 * Использование: findAll(@CurrentKernUser() user: KernUser)
 */
export const CurrentKernUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): KernUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.kernUser;
  },
);
