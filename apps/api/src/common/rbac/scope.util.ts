import { KernUser } from './rbac.types';

/**
 * Строит условие Prisma "where" для сущностей, у которых есть siteId,
 * на основе наивысшей области видимости, доступной пользователю для
 * пары (resource, action). Используется в сервисах после RbacGuard,
 * чтобы бригадир не мог получить чужой участок даже прямым запросом.
 */
export function buildSiteScopeWhere(user: KernUser, resource: string, action: string) {
  const perms = user.permissions.filter((p) => p.resource === resource && p.action === action);
  if (perms.some((p) => p.scope === 'company')) {
    return { companyId: user.companyId };
  }
  const ownSites = perms.find((p) => p.scope === 'own_sites');
  if (ownSites) {
    return { id: { in: ownSites.siteIds } };
  }
  // own_crew на уровне участка не имеет смысла — вызывающий сервис
  // должен фильтровать по crewId через buildCrewScopeWhere.
  return { id: { in: [] as string[] } };
}

/**
 * То же самое для сущностей с crewId (например Timesheet, Employee).
 * own_crew ограничивает бригадами, где пользователь назначен бригадиром;
 * вызывающий сервис обязан передать список id бригад пользователя.
 */
export function buildCrewScopeWhere(
  user: KernUser,
  resource: string,
  action: string,
  ownCrewIds: string[],
) {
  const perms = user.permissions.filter((p) => p.resource === resource && p.action === action);
  if (perms.some((p) => p.scope === 'company')) {
    return {};
  }
  if (perms.some((p) => p.scope === 'own_sites')) {
    const ownSites = perms.find((p) => p.scope === 'own_sites');
    return { site: { id: { in: ownSites?.siteIds ?? [] } } };
  }
  if (perms.some((p) => p.scope === 'own_crew')) {
    return { crewId: { in: ownCrewIds } };
  }
  return { id: { in: [] as string[] } };
}
