import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { PERMISSIONS_KEY } from './permissions.decorator';
import { KernUser } from './rbac.types';

/**
 * Проверяет право доступа к эндпоинту по паре (ресурс, действие) —
 * без учёта scope. Сужение по scope (own_crew / own_sites / company)
 * делает сам сервис при построении Prisma-запроса, потому что только
 * он знает, как отфильтровать конкретный ресурс по бригаде/участку.
 *
 * Требует, чтобы перед этим guard'ом уже отработал JwtAuthGuard и
 * положил в request.user как минимум { id, companyId }.
 */
@Injectable()
export class RbacGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<{ resource: string; action: string } | undefined>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true; // эндпоинт не требует конкретного права

    const request = context.switchToHttp().getRequest();
    const authUser = request.user as { id: string; companyId: string } | undefined;
    if (!authUser) throw new ForbiddenException('Не авторизован');

    const assignments = await this.prisma.roleAssignment.findMany({
      where: { userId: authUser.id },
      include: { role: { include: { permissions: true } } },
    });

    const effective = assignments.flatMap((assignment) =>
      assignment.role.permissions
        .filter((p) => p.resource === required.resource && p.action === required.action)
        .map((p) => ({
          resource: p.resource,
          action: p.action,
          scope: p.scope as 'own_crew' | 'own_sites' | 'company',
          siteIds: assignment.siteIds,
        })),
    );

    if (effective.length === 0) {
      throw new ForbiddenException(
        `Нет права "${required.action}" на "${required.resource}"`,
      );
    }

    const kernUser: KernUser = {
      id: authUser.id,
      companyId: authUser.companyId,
      email: request.user.email,
      permissions: effective,
    };
    request.kernUser = kernUser;
    return true;
  }
}
