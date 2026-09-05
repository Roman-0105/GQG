/**
 * Клиентское зеркало серверной RBAC-модели (см.
 * apps/api/src/common/rbac). Используется ТОЛЬКО чтобы скрыть/показать
 * элементы интерфейса — реальная проверка прав всегда происходит на
 * сервере (RbacGuard). Если этот файл и сервер разойдутся, приоритет
 * у сервера: пользователь может увидеть кнопку, но получит 403.
 */

export type Scope = 'own_crew' | 'own_sites' | 'company';

export interface Permission {
  resource: string;
  action: string;
  scope: Scope;
  siteIds?: string[];
}

export interface SessionUser {
  id: string;
  fullName: string;
  companyId: string;
  permissions: Permission[];
}

export function can(user: SessionUser | null, resource: string, action: string): boolean {
  if (!user) return false;
  return user.permissions.some((p) => p.resource === resource && p.action === action);
}
