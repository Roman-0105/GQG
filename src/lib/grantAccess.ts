import { supabase } from './supabaseClient'
import { createAuxSupabaseClient } from './supabaseAuxClient'
import type { Profile, Worker } from '../types/database'
import type { UserRole } from '../types/roles'

// Общая часть создания логина: signUp через изолированный клиент (не
// трогает текущую сессию гендира/техдира, см. supabaseAuxClient.ts) +
// insert в profiles. Используется и "с нуля" (createUserFromScratch), и
// при "выдаче доступа" существующему работнику (grantAccessToWorker).
async function signUpAndInsertProfile(params: {
  email: string
  password: string
  fullName: string
  role: UserRole
  positionId: string | null
  reportsToProfileId: string | null
  reportsToWorkerId: string | null
  personId: string | null
}): Promise<{ profile: Profile } | { error: string }> {
  const auxClient = createAuxSupabaseClient()
  const { data: signUpData, error: signUpError } = await auxClient.auth.signUp({
    email: params.email,
    password: params.password,
  })
  if (signUpError || !signUpData.user) {
    return { error: signUpError?.message ?? 'Не удалось создать учётную запись' }
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .insert({
      id: signUpData.user.id,
      full_name: params.fullName,
      role: params.role,
      position_id: params.positionId,
      reports_to_profile_id: params.reportsToProfileId,
      reports_to_worker_id: params.reportsToWorkerId,
      person_id: params.personId,
    })
    .select()
    .single()

  if (profileError || !profile) {
    return {
      error: `Учётная запись создана, но не удалось сохранить профиль: ${profileError?.message ?? 'нет данных'}`,
    }
  }
  return { profile }
}

// Создать логин-пользователя с нуля (без привязки к реестру работников) —
// вынесено 25.09.2026 из UsersList.tsx, чтобы тот же путь мог использовать
// и OrgChart.tsx ("+ Добавить человека"). Должность/руководитель здесь
// сознательно не задаются — новый человек появляется в схеме в разделе
// "Без назначенной должности", назначить их можно отдельным шагом.
export async function createUserFromScratch(params: {
  fullName: string
  email: string
  password: string
  role: UserRole
}): Promise<{ profile: Profile } | { error: string }> {
  return signUpAndInsertProfile({
    email: params.email,
    password: params.password,
    fullName: params.fullName,
    role: params.role,
    positionId: null,
    reportsToProfileId: null,
    reportsToWorkerId: null,
    personId: null,
  })
}

// "Выдать доступ" (25.09.2026, миграция 0018) — превращает существующую
// строку workers (без логина) в полноценный логин-аккаунт, вместо того
// чтобы перепечатывать ФИО заново в "Пользователях". Общий хелпер для
// WorkersSettings.tsx ("Выдать доступ" на карточке) и UsersList.tsx
// (режим "существующий работник" в форме создания) — чтобы не дублировать
// signUp/insert/архивирование в двух местах.
//
// Историю НЕ переносим (см. CLAUDE.md, решение 25.09.2026): старая строка
// workers остаётся как есть под своим id — task_worker_assignments.
// worker_id и чужие reports_to_worker_id, указывающие на неё, продолжают
// резолвить имя без изменений. Она просто архивируется и теряет должность
// (те же механизмы, что обычное архивирование работника и "Убрать из
// схемы" в OrgChart.tsx), чтобы не остаться дублирующим узлом.
export async function grantAccessToWorker(params: {
  worker: Worker
  email: string
  password: string
  role: UserRole
  positionId: string | null
  reportsToProfileId: string | null
  reportsToWorkerId: string | null
}): Promise<{ profile: Profile } | { error: string }> {
  const { worker, email, password, role, positionId, reportsToProfileId, reportsToWorkerId } = params

  const result = await signUpAndInsertProfile({
    email,
    password,
    fullName: worker.full_name,
    role,
    positionId,
    reportsToProfileId,
    reportsToWorkerId,
    personId: worker.id,
  })
  if ('error' in result) return result

  const { data: archivedRows, error: archiveError } = await supabase
    .from('workers')
    .update({ archived_at: new Date().toISOString(), position_id: null })
    .eq('id', worker.id)
    .select('id')

  if (archiveError || !archivedRows || archivedRows.length === 0) {
    return {
      error:
        'Профиль создан, но не удалось архивировать исходную запись работника — сделайте это вручную в «Работниках».',
    }
  }

  return result
}
