import type { UserRole } from '../types/roles'

// Уровни доступа сотрудников (09.10.2026). Уровень задаёт должность;
// должность без уровня считается уровнем 5.
export const LEVEL_LABELS: Record<number, string> = {
  1: 'Начальство',
  2: 'Старший ИТР',
  3: 'Средний ИТР',
  4: 'Младший ИТР',
  5: 'Рабочие',
}

export const LEVEL_HINTS: Record<number, string> = {
  1: 'Полный доступ: правка, согласование, оргструктура, права',
  2: 'Полный доступ, как у начальства',
  3: 'Распределяют людей по заданиям; без правки БД, участков и заданий',
  4: 'Сводки своего профиля, свои задания, запуск запланированных',
  5: 'Без входа: числятся в реестре, бригаде и на вахте',
}

// Входят в платформу сотрудники уровней 1–4.
export const levelHasLogin = (level: number): boolean => level >= 1 && level <= 4

// Роль учётной записи по уровню и названию должности.
export function roleForLevel(level: number, positionName: string): UserRole | null {
  if (level === 1) return positionName.toLowerCase().includes('технич') ? 'technical_director' : 'general_director'
  if (level === 2) return 'senior_itr'
  if (level === 3 || level === 4) return 'party_chief'
  return null
}

export const levelOfPosition = (positions: { id: string; level: number }[], positionId: string | null | undefined): number =>
  positions.find((p) => p.id === positionId)?.level ?? 5

// Кому может подчиняться сотрудник (уровень → допустимые уровни руководителя).
export const SUPERVISOR_LEVELS: Record<number, number[]> = {
  1: [1],
  2: [1],
  3: [2],
  4: [3],
  5: [4, 3],
}
