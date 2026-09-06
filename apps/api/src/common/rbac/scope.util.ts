import { KernUser } from './rbac.types';

/**
 * Есть ли у пользователя доступ к конкретному участку — по уже
 * отфильтрованным RbacGuard'ом правам (user.permissions содержит
 * ТОЛЬКО права, совпадающие с (resource, action) текущего маршрута —
 * см. rbac.guard.ts). Поэтому здесь не нужно (и НЕЛЬЗЯ) указывать
 * какой-то отдельный resource/action — они уже правильные для той
 * ручки, из которой вызывается эта проверка.
 *
 * Использовать для проверки ОДНОЙ записи (findOne/update/delete).
 * Для списков — buildSiteScopeWhere ниже.
 *
 * Найдено security-review: раньше сервисы дёргали buildSiteScopeWhere
 * с захардкоженными ('site','read') независимо от реального действия
 * маршрута (например, внутри PATCH /sites/:id, где реальное право —
 * 'site','update') — user.permissions там таких прав не содержит, и
 * функция уходила в fallback "нет доступа", после чего этот fallback
 * ({id:{in:[]}}) сразу перезаписывался явным `id` при объединении вида
 * `{...where, id}` (в объектном литерале одинаковый ключ, указанный
 * позже, побеждает) — в итоге получался запрос без единой проверки
 * scope. Эта функция не подвержена такой ошибке, потому что не строит
 * условие для последующего спреда, а сразу отвечает true/false.
 */
export function isSiteAllowedByPermissions(user: KernUser, siteId: string): boolean {
  return user.permissions.some(
    (p) => p.scope === 'company' || (p.scope === 'own_sites' && p.siteIds.includes(siteId)),
  );
}

/**
 * Строит условие Prisma "where" для СПИСКА участков, на основе
 * наивысшей области видимости, доступной пользователю для пары
 * (resource, action). Используется только там, где resource/action
 * гарантированно совпадают с тем, что проверил RbacGuard для текущего
 * маршрута (иначе см. предупреждение у isSiteAllowedByPermissions выше).
 *
 * ВАЖНО: результат содержит ключ `id` — комбинировать через
 * `{ ...buildSiteScopeWhere(...), id: конкретныйId }` НЕЛЬЗЯ, явный
 * `id` в объектном литерале молча перезапишет `id` из спреда и уберёт
 * всю проверку scope. Для проверки одной записи по id используйте
 * isSiteAllowedByPermissions, а не эту функцию.
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
