import { useEffect, useState } from 'react';
import { apiFetch } from './api';
import { getSessionUser, SessionUser } from './session';

/**
 * Профиль + эффективные права текущего пользователя — GET /auth/me
 * (см. auth.service.ts). Раньше роль узнавалась окольным путём через
 * GET /users (эндпоинт, на который у Бригадира и Бухгалтера нет права
 * user:read — роль в шапке у них просто не показывалась), а прав
 * фронтенд вообще не видел: видимость вкладок навигации и кнопок
 * согласования держалась на хардкоженных сравнениях с названием роли
 * (см. историю TimesheetPeriodDetail.tsx) — переименование роли молча
 * ломало эти сравнения. Теперь навигация и экраны спрашивают
 * `hasPermission`/`hasScope` напрямую.
 */

export type Scope = 'own_crew' | 'own_sites' | 'company';

export interface EffectivePermission {
  resource: string;
  action: string;
  scope: Scope;
  siteIds: string[];
}

interface Me {
  id: string;
  email: string;
  fullName: string;
  roles: string[];
  permissions: EffectivePermission[];
}

interface CurrentUser {
  user: SessionUser | null;
  /** Название первой роли — для отображения в шапке/профиле. */
  role: string | null;
  roles: string[];
  permissions: EffectivePermission[];
  loaded: boolean;
  /** Есть ли право (resource, action) хоть в каком-то scope. */
  hasPermission: (resource: string, action: string) => boolean;
  /** Есть ли право (resource, action) именно с этим scope. */
  hasScope: (resource: string, action: string, scope: Scope) => boolean;
}

let cached: { userId: string; me: Me | null } | null = null;

export function useCurrentUser(): CurrentUser {
  const user = getSessionUser();
  const [me, setMe] = useState<Me | null>(() => (user && cached?.userId === user.id ? cached.me : null));
  const [loaded, setLoaded] = useState(() => user != null && cached?.userId === user.id);

  useEffect(() => {
    if (!user) return;
    if (cached?.userId === user.id) {
      setMe(cached.me);
      setLoaded(true);
      return;
    }
    let cancelled = false;
    apiFetch<Me>('/auth/me')
      .then((result) => {
        if (cancelled) return;
        cached = { userId: user.id, me: result };
        setMe(result);
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        cached = { userId: user.id, me: null };
        setMe(null);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const permissions = me?.permissions ?? [];

  return {
    user,
    role: me?.roles[0] ?? null,
    roles: me?.roles ?? [],
    permissions,
    loaded,
    hasPermission: (resource, action) =>
      permissions.some((p) => p.resource === resource && p.action === action),
    hasScope: (resource, action, scope) =>
      permissions.some((p) => p.resource === resource && p.action === action && p.scope === scope),
  };
}
