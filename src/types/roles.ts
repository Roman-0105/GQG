// Роли пользователей платформы — см. ТЗ, раздел 2.
// 'developer' добавлена 22.09.2026 — владелец платформы, "серый кардинал":
// полная власть (везде, где раньше проверялся isManagement — теперь
// проверяет и её), но НЕ должен фигурировать в списке пользователей и
// нигде, где gendir/techdir могли бы его увидеть — это обеспечивает RLS
// (см. миграцию 0012_developer_role.sql), а не сокрытие в UI. Поэтому
// 'developer' сознательно НЕ добавлена в ROLE_OPTIONS формы создания
// пользователя (UsersList.tsx) — через интерфейс её никто не заведёт.
export type UserRole = 'general_director' | 'technical_director' | 'party_chief' | 'developer'

export const ROLE_LABELS: Record<UserRole, string> = {
  general_director: 'Генеральный директор',
  technical_director: 'Технический директор',
  party_chief: 'Начальник буровой партии (бригадир)',
  developer: 'Разработчик',
}

// Гендир, техдир и разработчик имеют идентичные права везде, где
// проверяется isManagement (см. ТЗ, раздел 2 + решение 22.09.2026) —
// удобно проверять доступ одной функцией, а не дублировать условия.
export const isManagement = (role: UserRole | null | undefined): boolean =>
  role === 'general_director' || role === 'technical_director' || role === 'developer'
