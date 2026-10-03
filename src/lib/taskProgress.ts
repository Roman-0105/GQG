import { supabase } from './supabaseClient'
import type { Report } from '../types/database'

// Округление до сотых (25.09.2026, по жалобе владельца на "7.149999999999977
// м" в таблице "По дням") — вычитание/сложение чисел с плавающей точкой
// в JS регулярно даёт такой мусор в 15-м знаке (520 - 512.85 и т.п.).
// Применяется и здесь (суммы прогресса), и в местах, где считается разница
// "до минус от" (DailyReportForm.tsx — метраж бурения).
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

// Общие формулы прогресса по видам работ — раньше жили только внутри
// SiteDetail.tsx как локальные функции; вынесены сюда 25.09.2026, чтобы
// Dashboard.tsx (сводный прогресс по участку по ВСЕМ видам работ, не
// только бурению — фаза 3 редизайна) считал их той же логикой, а не
// копией. Прогресс по бурению/распиловке = сумма подтверждённых метров;
// по керну/фото — максимум "до" среди подтверждённых сводок (интервалы
// кумулятивные, не складываются).
export function drillingProgress(taskId: string, reports: Report[]) {
  return round2(
    reports
      .filter((r) => r.drilling_task_id === taskId && r.approval_status === 'approved')
      .reduce((s, r) => s + (r.drilling_meters ?? 0), 0),
  )
}

export function coreProgress(taskId: string, reports: Report[]) {
  const rows = reports.filter(
    (r) => r.core_description_task_id === taskId && r.approval_status === 'approved',
  )
  return {
    core: round2(rows.reduce((m, r) => Math.max(m, r.core_description_interval_to ?? 0), 0)),
    photo: round2(rows.reduce((m, r) => Math.max(m, r.photofixation_interval_to ?? 0), 0)),
  }
}

export function sawingProgress(taskId: string, reports: Report[]) {
  return round2(
    reports
      .filter((r) => r.core_sawing_task_id === taskId && r.approval_status === 'approved')
      .reduce((s, r) => s + (r.sawn_meters ?? 0), 0),
  )
}

export function samplingProgress(taskId: string, reports: Report[]) {
  const rows = reports.filter((r) => r.sampling_task_id === taskId && r.approval_status === 'approved')
  return {
    taken: rows.reduce((s, r) => s + (r.samples_taken ?? 0), 0),
    submitted: rows.reduce((s, r) => s + (r.samples_submitted ?? 0), 0),
  }
}

// Прогресс бурения скважин, сводки которых текущий пользователь видеть не
// может (геолог на чужой скважине): RPC drilling_task_progress (миграция
// 0021) отдаёт только итоговую сумму подтверждённых метров, без самих сводок
// (там комментарии и затраты). Возвращает {id скважины: подтверждено, м}.
export async function fetchForeignDrillingProgress(wellIds: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  await Promise.all(
    wellIds.map(async (id) => {
      const { data } = await supabase.rpc('drilling_task_progress', { p_drilling_task_id: id })
      const row = Array.isArray(data) ? data[0] : data
      if (row && row.approved != null) out[id] = round2(Number(row.approved))
    }),
  )
  return out
}
