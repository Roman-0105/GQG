import { supabase } from './supabaseClient'
import type { Report } from '../types/database'

// Название участка + скважины/задания для ОДНОЙ сводки — используется и в
// просмотре сводки автором (ReportDetail.tsx), и в согласовании
// (ReportReview.tsx): в обоих местах это отсутствовало, из сводки нельзя
// было понять, к какой скважине/участку она относится (отзыв 20.09.2026).
// Без пакетной оптимизации — для списка сразу нескольких сводок такая же
// логика уже есть отдельно в PendingApprovals.tsx.
export async function loadReportSiteAndWellLabel(
  report: Report,
): Promise<{ siteName: string; wellLabel: string }> {
  const { data: site } = await supabase.from('sites').select('name').eq('id', report.site_id).single()
  const siteName = site?.name ?? '—'

  if (report.drilling_task_id) {
    const { data: dt } = await supabase
      .from('drilling_tasks')
      .select('well_number')
      .eq('id', report.drilling_task_id)
      .single()
    return { siteName, wellLabel: `Бурение, скв. №${dt?.well_number ?? '?'}` }
  }
  if (report.core_description_task_id) {
    const { data: cdt } = await supabase
      .from('core_description_tasks')
      .select('external_well_number, drilling_task_id, documentation_type')
      .eq('id', report.core_description_task_id)
      .single()
    const docLabel = cdt?.documentation_type === 'geological' ? 'геологическая документация' : 'геотехническая документация'
    if (cdt?.drilling_task_id) {
      const { data: dt } = await supabase
        .from('drilling_tasks')
        .select('well_number')
        .eq('id', cdt.drilling_task_id)
        .single()
      return { siteName, wellLabel: `Керн (${docLabel}), своя скв. №${dt?.well_number ?? '?'}` }
    }
    return { siteName, wellLabel: `Керн (${docLabel}), скв. подрядчика №${cdt?.external_well_number ?? '?'}` }
  }
  if (report.core_sawing_task_id) {
    const { data: cst } = await supabase
      .from('core_sawing_tasks')
      .select('drilling_task_id')
      .eq('id', report.core_sawing_task_id)
      .single()
    const { data: dt } = cst?.drilling_task_id
      ? await supabase.from('drilling_tasks').select('well_number').eq('id', cst.drilling_task_id).single()
      : { data: null }
    return { siteName, wellLabel: `Распиловка керна, скв. №${dt?.well_number ?? '?'}` }
  }
  if (report.sampling_task_id) {
    const { data: st } = await supabase
      .from('sampling_tasks')
      .select('external_well_number, drilling_task_id')
      .eq('id', report.sampling_task_id)
      .single()
    if (st?.drilling_task_id) {
      const { data: dt } = await supabase
        .from('drilling_tasks')
        .select('well_number')
        .eq('id', st.drilling_task_id)
        .single()
      return { siteName, wellLabel: `Опробование, своя скв. №${dt?.well_number ?? '?'}` }
    }
    return { siteName, wellLabel: `Опробование, скв. подрядчика №${st?.external_well_number ?? '?'}` }
  }
  return { siteName, wellLabel: '—' }
}
