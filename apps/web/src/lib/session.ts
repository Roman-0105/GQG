/**
 * Текущий пользователь на устройстве. Нужен не только для отображения
 * имени, но и чтобы разделить офлайн-очередь табелей между разными
 * бригадирами, которые могут по очереди пользоваться одним планшетом
 * в поле (см. lib/offlineQueue.ts и docs/project-plan.md, раздел 6).
 */

export interface SessionUser {
  id: string;
  fullName: string;
  email: string;
  companyId: string;
}

const USER_KEY = 'kern:user';

export function setSessionUser(user: SessionUser) {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    // приватный режим/заблокированное хранилище — сессия просто не запомнится
  }
}

export function getSessionUser(): SessionUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem('kern:token');
  } catch {
    // недоступно — при выходе просто ничего не почистится
  }
}
