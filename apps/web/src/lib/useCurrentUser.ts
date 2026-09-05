import { useEffect, useState } from 'react';
import { apiFetch } from './api';
import { getSessionUser, SessionUser } from './session';

/**
 * Роль текущего пользователя для шапки навигации ("имя и роль" —
 * см. .claude/agents/designer.md). ВАЖНО: /auth/login сейчас не
 * возвращает роль (см. apps/api/src/modules/auth/auth.service.ts) —
 * это лучший доступный клиентский способ её узнать без изменения
 * API-контрактов: переиспользуем уже существующий GET /users (тот же
 * запрос, что и на странице «Команда») и находим себя в списке.
 *
 * У части ролей (например, Бригадир) нет права `user:read`, и запрос
 * вернёт 403 — тогда просто не показываем роль, без падения интерфейса.
 * Это обходной путь, а не архитектурное решение: правильное решение —
 * чтобы бэкенд отдавал роль прямо в /auth/login (см. итоговый отчёт).
 */

interface UsersListEntry {
  id: string;
  roleAssignments: { role: { name: string } }[];
}

let cachedRole: { userId: string; role: string | null } | null = null;

export function useCurrentUser(): { user: SessionUser | null; role: string | null } {
  const user = getSessionUser();
  const [role, setRole] = useState<string | null>(() =>
    user && cachedRole?.userId === user.id ? cachedRole.role : null,
  );

  useEffect(() => {
    if (!user) return;
    if (cachedRole?.userId === user.id) {
      setRole(cachedRole.role);
      return;
    }
    let cancelled = false;
    apiFetch<UsersListEntry[]>('/users')
      .then((list) => {
        if (cancelled) return;
        const self = list.find((u) => u.id === user.id);
        const roleName = self?.roleAssignments[0]?.role.name ?? null;
        cachedRole = { userId: user.id, role: roleName };
        setRole(roleName);
      })
      .catch(() => {
        if (cancelled) return;
        cachedRole = { userId: user.id, role: null };
        setRole(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return { user, role };
}
