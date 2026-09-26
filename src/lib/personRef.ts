import type { Profile, Worker } from '../types/database'

// Единый способ ссылаться на "любого человека" — profile (логин-
// пользователь) ИЛИ worker (без логина) — в select'ах "Должность"/
// "Руководитель" по всему проекту (Пользователи/Работники/Оргструктура).
// UUID из разных таблиц сами по себе неразличимы, отсюда префикс.
// Вынесено из OrgChart.tsx 25.09.2026 при переходе оргструктуры на
// person-centric модель (см. CLAUDE.md) — тот же приём использовался там
// с 24.09.2026, теперь нужен в 3 местах сразу.
export const NONE_VALUE = ''
export const profileValue = (id: string) => `profile:${id}`
export const workerValue = (id: string) => `worker:${id}`

export type PersonKind = 'profile' | 'worker'

export function parsePersonValue(value: string): { kind: PersonKind; id: string } | null {
  if (!value) return null
  const [kind, id] = value.split(':')
  if (kind !== 'profile' && kind !== 'worker') return null
  return { kind, id }
}

// Значение select'а для текущего "руководителя" человека — ровно одно из
// двух полей заполнено или ни одного (см. constraint *_one_report_target
// в миграции 0016).
export function reportsToValue(reportsToProfileId: string | null, reportsToWorkerId: string | null): string {
  if (reportsToProfileId) return profileValue(reportsToProfileId)
  if (reportsToWorkerId) return workerValue(reportsToWorkerId)
  return NONE_VALUE
}

export interface PersonNode {
  key: string
  kind: PersonKind
  id: string
  fullName: string
  reportsToKey: string | null
}

// Объединённый список людей для построения дерева/защиты от циклов —
// один и тот же формат используют и Оргструктура (дерево целиком), и
// select'ы "Руководитель" в Пользователях/Работниках (нужен только для
// исключения себя+потомков из списка выбора).
export function buildPersonNodes(profiles: Profile[], workers: Worker[]): PersonNode[] {
  const fromProfiles: PersonNode[] = profiles.map((p) => ({
    key: profileValue(p.id),
    kind: 'profile',
    id: p.id,
    fullName: p.full_name,
    reportsToKey: p.reports_to_profile_id
      ? profileValue(p.reports_to_profile_id)
      : p.reports_to_worker_id
        ? workerValue(p.reports_to_worker_id)
        : null,
  }))
  const fromWorkers: PersonNode[] = workers.map((w) => ({
    key: workerValue(w.id),
    kind: 'worker',
    id: w.id,
    fullName: w.full_name,
    reportsToKey: w.reports_to_profile_id
      ? profileValue(w.reports_to_profile_id)
      : w.reports_to_worker_id
        ? workerValue(w.reports_to_worker_id)
        : null,
  }))
  return [...fromProfiles, ...fromWorkers]
}

// Собирает ключ узла и ВСЕХ его потомков — нужно, чтобы при выборе
// "Руководителя" нельзя было выбрать самого себя или своего же подчинённого
// (иначе иерархия зациклится). Обобщение прежнего collectDescendantIds из
// OrgChart.tsx (там работал по одной таблице org_positions.parent_id) —
// теперь работает по объединённому списку people через reportsToKey.
export function collectDescendantKeys(startKey: string, people: PersonNode[]): Set<string> {
  const keys = new Set<string>([startKey])
  let changed = true
  while (changed) {
    changed = false
    for (const person of people) {
      if (person.reportsToKey && keys.has(person.reportsToKey) && !keys.has(person.key)) {
        keys.add(person.key)
        changed = true
      }
    }
  }
  return keys
}
