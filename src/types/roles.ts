// Роли пользователей платформы — см. ТЗ, раздел 2.
export type UserRole = 'general_director' | 'technical_director' | 'party_chief'

export const ROLE_LABELS: Record<UserRole, string> = {
  general_director: 'Генеральный директор',
  technical_director: 'Технический директор',
  party_chief: 'Начальник буровой партии (бригадир)',
}

// Гендир и техдир имеют идентичные права (см. ТЗ, раздел 2) —
// удобно проверять доступ одной функцией, а не дублировать условия.
export const isManagement = (role: UserRole | null | undefined): boolean =>
  role === 'general_director' || role === 'technical_director'
