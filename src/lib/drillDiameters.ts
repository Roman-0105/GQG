import type { SupabaseClient } from '@supabase/supabase-js'

// Размеры буровой штанги (06.10.2026): буквенный код + внешний диаметр, мм.
export const DRILL_DIAMETERS = [
  { code: 'AQ', mm: 46 },
  { code: 'BQ', mm: 56 },
  { code: 'NQ', mm: 70 },
  { code: 'HQ', mm: 89 },
  { code: 'PQ', mm: 114 },
] as const

export type DrillDiameterCode = (typeof DRILL_DIAMETERS)[number]['code']

export function drillDiameterMm(code: string): number | null {
  return DRILL_DIAMETERS.find((d) => d.code === code)?.mm ?? null
}

export function drillDiameterLabel(code: string): string {
  const mm = drillDiameterMm(code)
  return mm ? `${code} · ${mm} мм` : code
}

// Для сообщения в WhatsApp по уже сохранённой сводке: интервалы диаметра
// самой смены и состояние обсадки на её момент (по дате/смене сводок задания).
export async function loadShiftDiameterInfo(
  client: SupabaseClient,
  taskId: string,
  report: { id: string; report_date: string; shift_number: number | null },
) {
  const { data: reps } = await client
    .from('reports')
    .select('id, report_date, shift_number')
    .eq('drilling_task_id', taskId)
  const upTo = (reps ?? [])
    .filter((o) => {
      if (o.id === report.id) return true
      if (o.report_date !== report.report_date) return o.report_date < report.report_date
      return (o.shift_number ?? 0) < (report.shift_number ?? 0)
    })
    .map((o) => o.id as string)
  const [diamRes, casRes] = await Promise.all([
    client
      .from('report_drill_diameters')
      .select('diameter_code, depth_from, depth_to, is_reaming')
      .eq('report_id', report.id)
      .order('depth_from', { ascending: true }),
    upTo.length > 0
      ? client.from('report_casings').select('diameter_code, depth_to').in('report_id', upTo)
      : Promise.resolve({ data: [] as { diameter_code: string; depth_to: number }[] }),
  ])
  const byCode: Record<string, number> = {}
  for (const c of casRes.data ?? []) byCode[c.diameter_code] = Math.max(byCode[c.diameter_code] ?? 0, c.depth_to)
  const rows = diamRes.data ?? []
  return {
    reamings: rows
      .filter((d) => d.is_reaming)
      .map((d) => ({ code: d.diameter_code as string, from: Number(d.depth_from), to: Number(d.depth_to) })),
    drillIntervals: rows
      .filter((d) => !d.is_reaming)
      .map((d) => ({ code: d.diameter_code as string, from: Number(d.depth_from), to: Number(d.depth_to) }))
      .filter((d, i, all) => d.to > d.from || i === all.length - 1),
    casings: Object.entries(byCode).map(([code, depth]) => ({ code, depth })),
  }
}

export interface DiamInterval {
  code: string
  from: number
  to: number
}

// «Закрашивание» интервалов: события идут в хронологическом порядке, каждое
// перекрывает диаметр на своём участке (так расширение ствола перекрывает то,
// чем бурили раньше). Результат — непрерывные интервалы по глубине, подряд
// идущие одного диаметра склеены.
export function paintIntervals(events: DiamInterval[]): DiamInterval[] {
  let list: DiamInterval[] = []
  for (const e of events) {
    if (!(e.to > e.from)) continue
    const next: DiamInterval[] = []
    for (const d of list) {
      if (d.to <= e.from || d.from >= e.to) {
        next.push(d)
        continue
      }
      if (d.from < e.from) next.push({ code: d.code, from: d.from, to: e.from })
      if (d.to > e.to) next.push({ code: d.code, from: e.to, to: d.to })
    }
    next.push({ ...e })
    list = next.sort((a, b) => a.from - b.from)
  }
  const out: DiamInterval[] = []
  for (const d of list) {
    const last = out[out.length - 1]
    if (last && last.code === d.code && last.to >= d.from) last.to = Math.max(last.to, d.to)
    else out.push({ ...d })
  }
  return out
}

// История диаметров бурения по заданию: итоговые интервалы с учётом расширений
// и диаметр последнего бурения (по умолчанию для следующей сводки).
export async function loadDiameterHistory(client: SupabaseClient, taskId: string, excludeReportId?: string | null) {
  const { data: reps } = await client
    .from('reports')
    .select('id, report_date, shift_number, created_at')
    .eq('drilling_task_id', taskId)
  const list = (reps ?? []).filter((r) => r.id !== excludeReportId)
  if (list.length === 0) return { intervals: [] as DiamInterval[], lastCode: '' }
  const order = new Map(list.map((r) => [r.id as string, r]))
  const { data: rows } = await client
    .from('report_drill_diameters')
    .select('report_id, diameter_code, depth_from, depth_to, is_reaming')
    .in('report_id', list.map((r) => r.id as string))
  const events = (rows ?? [])
    .map((d) => ({ d, r: order.get(d.report_id as string)! }))
    .sort((a, b) => {
      if (a.r.report_date !== b.r.report_date) return a.r.report_date < b.r.report_date ? -1 : 1
      const sa = a.r.shift_number ?? 0
      const sb = b.r.shift_number ?? 0
      if (sa !== sb) return sa - sb
      if (a.r.created_at !== b.r.created_at && a.d.report_id !== b.d.report_id) return a.r.created_at < b.r.created_at ? -1 : 1
      if (a.d.is_reaming !== b.d.is_reaming) return a.d.is_reaming ? 1 : -1
      return Number(a.d.depth_from) - Number(b.d.depth_from)
    })
  const normal = events.filter((e) => !e.d.is_reaming)
  return {
    intervals: paintIntervals(
      events.map((e) => ({ code: e.d.diameter_code as string, from: Number(e.d.depth_from), to: Number(e.d.depth_to) })),
    ),
    lastCode: normal.length > 0 ? (normal[normal.length - 1].d.diameter_code as string) : '',
  }
}
