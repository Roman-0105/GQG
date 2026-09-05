export type Scope = 'own_crew' | 'own_sites' | 'company';

export interface EffectivePermission {
  resource: string;
  action: string;
  scope: Scope;
  /** Заполнено только когда scope === 'own_sites' и назначение ограничено конкретными участками. */
  siteIds: string[];
}

/**
 * Пользователь + вычисленный на момент запроса набор эффективных прав.
 * RbacGuard кладёт это в request.kernUser; сервисы читают req.kernUser
 * чтобы понять, какую область данных отдавать (own_crew / own_sites / company),
 * а не просто "доступ разрешён/запрещён".
 */
export interface KernUser {
  id: string;
  companyId: string;
  email: string;
  permissions: EffectivePermission[];
}
