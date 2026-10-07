import { supabase } from './supabaseClient'
import { paintIntervals, type DiamInterval } from './drillDiameters'
import { round2 } from './taskProgress'
import type { DrillingTask, Report } from '../types/database'

// Данные для промежуточного отчёта по скважине (PDF) и мини-дашборда вкладки
// «Отчёты». Учитываются только СОГЛАСОВАННЫЕ сводки (решение 06.10.2026).

export interface DayRow {
  date: string
  s1: number | null
  s2: number | null
  total: number
  cum: number
  plan: number | null
  hours: number
}

export interface MasterStat {
  id: string
  name: string
  firstDate: string
  lastDate: string
  shifts: number
  meters: number
  hours: number
  pace: number
}

export interface StructureInterval {
  code: string
  from: number
  to: number
  meters: number
  dateFrom: string | null
  dateTo: string | null
  masters: { id: string; name: string; meters: number }[]
}

export interface CasingInfo {
  code: string
  depth: number
  date: string | null
}

export interface ReamingInfo {
  code: string
  from: number
  to: number
  date: string | null
}

export interface TimelineEvent {
  date: string
  text: string
  kind: 'start' | 'diameter' | 'casing' | 'reaming' | 'handover' | 'closure'
}

export interface CostTotal {
  name: string
  unit: string | null
  quantity: number
}

export interface WellReportData {
  task: DrillingTask
  siteName: string
  siteBoundary: [number, number][] | null
  // Скважины участка с координатами (для карты-врезки)
  siteWells: { id: string; number: string; lat: number; lon: number }[]
  rigLabel: string | null
  orgName: string | null
  foremanName: string | null
  reports: Report[]
  days: DayRow[]
  masters: MasterStat[]
  intervals: StructureInterval[]
  // Кто какой участок глубины пробурил (подряд идущие смены одного мастера склеены)
  masterSegments: { id: string; name: string; from: number; to: number }[]
  casings: CasingInfo[]
  reamings: ReamingInfo[]
  events: TimelineEvent[]
  costs: CostTotal[]
  samples: { name: string; quantity: number }[]
  geology: { core: number; photo: number; sawn: number; taken: number; submitted: number; any: boolean }
  crew: { role: string; shift: number | null; name: string; from: string; to: string | null }[]
  totals: {
    meters: number
    hours: number
    shifts: number
    activeDays: number
    daysElapsed: number
    pace: number
    bestShift: { meters: number; date: string; shift: number | null } | null
    shift1: number
    shift2: number
    forecast: string | null
    planDeviation: number | null
    percent: number | null
  }
  generatedAt: string
}

const todayIso = () => new Date().toISOString().slice(0, 10)

function addDays(iso: string, n: number) {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function dayIndex(from: string, to: string) {
  return Math.round((new Date(to + 'T00:00:00').getTime() - new Date(from + 'T00:00:00').getTime()) / 86400000)
}

export function formatDateRu(iso: string | null | undefined) {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}.${m}.${y}`
}

export async function loadWellReportData(taskId: string): Promise<WellReportData | null> {
  const { data: task } = await supabase.from('drilling_tasks').select('*').eq('id', taskId).single()
  if (!task) return null
  const t = task as DrillingTask

  const [siteRes, rigRes, orgRes, foremanRes, repRes] = await Promise.all([
    supabase.from('sites').select('name, boundary').eq('id', t.site_id).single(),
    t.drilling_rig_id
      ? supabase.from('drilling_rigs').select('rig_number, model').eq('id', t.drilling_rig_id).single()
      : Promise.resolve({ data: null }),
    t.drilling_org_id
      ? supabase.from('drilling_organizations').select('name').eq('id', t.drilling_org_id).single()
      : Promise.resolve({ data: null }),
    t.foreman_id
      ? supabase.from('profiles').select('full_name').eq('id', t.foreman_id).single()
      : Promise.resolve({ data: null }),
    supabase
      .from('reports')
      .select('*')
      .eq('drilling_task_id', taskId)
      .eq('approval_status', 'approved')
      .order('report_date')
      .order('shift_number'),
  ])

  const { data: wellRows } = await supabase
    .from('drilling_tasks')
    .select('id, well_number, coord_wgs84_lat, coord_wgs84_lon')
    .eq('site_id', t.site_id)
    .not('coord_wgs84_lat', 'is', null)
    .not('coord_wgs84_lon', 'is', null)
  const siteWells = (wellRows ?? []).map((w) => ({ id: w.id as string, number: w.well_number as string, lat: Number(w.coord_wgs84_lat), lon: Number(w.coord_wgs84_lon) }))

  const reports = (repRes.data ?? []) as Report[]
  const reportIds = reports.map((r) => r.id)
  const repById = new Map(reports.map((r) => [r.id, r]))

  const authorIds = [...new Set(reports.map((r) => r.author_id))]
  const names = new Map<string, string>()
  if (authorIds.length > 0) {
    const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', authorIds)
    for (const p of profs ?? []) names.set(p.id as string, p.full_name as string)
  }

  // ---- дни и накопленная проходка
  const metersOf = (r: Report) => r.drilling_meters ?? 0
  const startDate = t.start_date ?? reports[0]?.report_date ?? todayIso()
  const lastReportDate = reports.length > 0 ? reports[reports.length - 1].report_date : null
  const closedDate = t.closed_at ? t.closed_at.slice(0, 10) : null
  const active = t.status === 'in_progress' || t.status === 'suspended'
  const endDate = closedDate ?? (active ? todayIso() : (lastReportDate ?? startDate))
  const lastDate = lastReportDate && lastReportDate > endDate ? lastReportDate : endDate
  const nDays = Math.max(0, dayIndex(startDate, lastDate)) + 1
  const byDate = new Map<string, { s1: number | null; s2: number | null; hours: number }>()
  for (const r of reports) {
    const cell = byDate.get(r.report_date) ?? { s1: null, s2: null, hours: 0 }
    if (r.shift_number === 2) cell.s2 = (cell.s2 ?? 0) + metersOf(r)
    else cell.s1 = (cell.s1 ?? 0) + metersOf(r)
    cell.hours += r.hours_worked ?? 0
    byDate.set(r.report_date, cell)
  }
  const days: DayRow[] = []
  let cum = 0
  const planned = t.planned_daily_meters
  for (let i = 0; i < nDays; i++) {
    const date = addDays(startDate, i)
    const cell = byDate.get(date)
    const total = round2((cell?.s1 ?? 0) + (cell?.s2 ?? 0))
    cum = round2(cum + total)
    days.push({
      date,
      s1: cell?.s1 != null ? round2(cell.s1) : null,
      s2: cell?.s2 != null ? round2(cell.s2) : null,
      total,
      cum,
      plan: planned != null ? round2(Math.min(planned * (i + 1), t.projected_depth ?? Infinity)) : null,
      hours: round2(cell?.hours ?? 0),
    })
  }

  // ---- мастера
  const masterMap = new Map<string, MasterStat>()
  for (const r of reports) {
    const m = masterMap.get(r.author_id) ?? {
      id: r.author_id,
      name: names.get(r.author_id) ?? '—',
      firstDate: r.report_date,
      lastDate: r.report_date,
      shifts: 0,
      meters: 0,
      hours: 0,
      pace: 0,
    }
    m.shifts += 1
    m.meters = round2(m.meters + metersOf(r))
    m.hours = round2(m.hours + (r.hours_worked ?? 0))
    if (r.report_date < m.firstDate) m.firstDate = r.report_date
    if (r.report_date > m.lastDate) m.lastDate = r.report_date
    masterMap.set(r.author_id, m)
  }
  const masters = [...masterMap.values()].map((m) => ({
    ...m,
    pace: round2(m.meters / (Math.max(1, dayIndex(m.firstDate, m.lastDate) + 1))),
  }))
  masters.sort((a, b) => a.firstDate.localeCompare(b.firstDate))

  // ---- диаметры, обсадка, расширения
  let diamRows: { report_id: string; diameter_code: string; depth_from: number; depth_to: number; is_reaming: boolean }[] = []
  let casRows: { report_id: string; diameter_code: string; depth_to: number }[] = []
  if (reportIds.length > 0) {
    const [dRes, cRes] = await Promise.all([
      supabase.from('report_drill_diameters').select('report_id, diameter_code, depth_from, depth_to, is_reaming').in('report_id', reportIds),
      supabase.from('report_casings').select('report_id, diameter_code, depth_to').in('report_id', reportIds),
    ])
    diamRows = (dRes.data ?? []) as typeof diamRows
    casRows = (cRes.data ?? []) as typeof casRows
  }
  const order = (id: string) => {
    const r = repById.get(id)
    return (r?.report_date ?? '') + String(r?.shift_number ?? 0)
  }
  diamRows.sort((a, b) => order(a.report_id).localeCompare(order(b.report_id)) || (a.is_reaming === b.is_reaming ? 0 : a.is_reaming ? 1 : -1) || a.depth_from - b.depth_from)
  const paintEvents: DiamInterval[] = diamRows.map((d) => ({ code: d.diameter_code, from: Number(d.depth_from), to: Number(d.depth_to) }))
  const painted = paintIntervals(paintEvents)

  // глубины, пробуренные каждой сводкой (накопление по порядку)
  const depthRanges: { id: string; author: string; date: string; from: number; to: number }[] = []
  let run = 0
  for (const r of reports) {
    const m = metersOf(r)
    if (m <= 0) continue
    depthRanges.push({ id: r.id, author: r.author_id, date: r.report_date, from: run, to: run + m })
    run += m
  }
  const totalDepth = round2(run)
  const masterSegments: WellReportData['masterSegments'] = []
  for (const dr of depthRanges) {
    const last = masterSegments[masterSegments.length - 1]
    if (last && last.id === dr.author) last.to = round2(dr.to)
    else masterSegments.push({ id: dr.author, name: names.get(dr.author) ?? '—', from: round2(dr.from), to: round2(dr.to) })
  }

  let intervals: StructureInterval[] = painted.map((p) => ({
    code: p.code,
    from: round2(p.from),
    to: round2(p.to),
    meters: round2(p.to - p.from),
    dateFrom: null,
    dateTo: null,
    masters: [],
  }))
  if (intervals.length === 0 && totalDepth > 0) {
    intervals = [{ code: '', from: 0, to: totalDepth, meters: totalDepth, dateFrom: null, dateTo: null, masters: [] }]
  }
  for (const iv of intervals) {
    const per = new Map<string, number>()
    for (const dr of depthRanges) {
      const ov = Math.min(iv.to, dr.to) - Math.max(iv.from, dr.from)
      if (ov <= 0) continue
      per.set(dr.author, (per.get(dr.author) ?? 0) + ov)
      if (!iv.dateFrom || dr.date < iv.dateFrom) iv.dateFrom = dr.date
      if (!iv.dateTo || dr.date > iv.dateTo) iv.dateTo = dr.date
    }
    iv.masters = [...per.entries()].map(([id, m]) => ({ id, name: names.get(id) ?? '—', meters: round2(m) }))
  }

  const casMap = new Map<string, CasingInfo>()
  for (const c of casRows) {
    const date = repById.get(c.report_id)?.report_date ?? null
    const prev = casMap.get(c.diameter_code)
    if (!prev || Number(c.depth_to) > prev.depth) casMap.set(c.diameter_code, { code: c.diameter_code, depth: round2(Number(c.depth_to)), date })
  }
  const casings = [...casMap.values()]
  const reamings: ReamingInfo[] = diamRows
    .filter((d) => d.is_reaming)
    .map((d) => ({ code: d.diameter_code, from: round2(Number(d.depth_from)), to: round2(Number(d.depth_to)), date: repById.get(d.report_id)?.report_date ?? null }))

  // ---- вахты
  const { data: hand } = await supabase.from('shift_handovers').select('from_name, to_name, created_at').contains('task_ids', [taskId]).order('created_at')

  // ---- события
  const events: TimelineEvent[] = []
  events.push({ date: startDate, text: 'Начало бурения', kind: 'start' })
  let lastCode = ''
  for (const d of diamRows) {
    if (d.is_reaming) continue
    if (d.diameter_code !== lastCode) {
      events.push({
        date: repById.get(d.report_id)?.report_date ?? startDate,
        text: lastCode ? `Смена диаметра бурения: ${lastCode} → ${d.diameter_code} с ${round2(Number(d.depth_from))} м` : `Бурение диаметром ${d.diameter_code}`,
        kind: 'diameter',
      })
      lastCode = d.diameter_code
    }
  }
  for (const c of casRows) {
    events.push({ date: repById.get(c.report_id)?.report_date ?? startDate, text: `Обсадка ${c.diameter_code} до ${round2(Number(c.depth_to))} м`, kind: 'casing' })
  }
  for (const rm of reamings) events.push({ date: rm.date ?? startDate, text: `Расширение ствола ${rm.code}: ${rm.from}–${rm.to} м`, kind: 'reaming' })
  for (const h of hand ?? []) events.push({ date: String(h.created_at).slice(0, 10), text: `Передача вахты: ${h.from_name} → ${h.to_name}`, kind: 'handover' })
  if (t.closed_reason && closedDate) events.push({ date: closedDate, text: 'Скважина закрыта' + (t.closed_note ? `: ${t.closed_note}` : ''), kind: 'closure' })
  events.sort((a, b) => a.date.localeCompare(b.date))

  // ---- затраты
  const costs: CostTotal[] = []
  if (reportIds.length > 0) {
    const { data: costRows } = await supabase.from('report_costs').select('quantity, cost_items(name, unit, cost_categories(name))').in('report_id', reportIds)
    const agg = new Map<string, CostTotal>()
    for (const c of (costRows ?? []) as unknown as { quantity: number | null; cost_items: { name: string; unit: string | null; cost_categories: { name: string } | null } | null }[]) {
      const name = `${c.cost_items?.cost_categories?.name ?? '—'} — ${c.cost_items?.name ?? '—'}`
      const prev = agg.get(name) ?? { name, unit: c.cost_items?.unit ?? null, quantity: 0 }
      prev.quantity = round2(prev.quantity + (c.quantity ?? 0))
      agg.set(name, prev)
    }
    costs.push(...agg.values())
  }

  // ---- геология (прицепленные работы)
  const [coreT, sawT, samT] = await Promise.all([
    supabase.from('core_description_tasks').select('id').eq('drilling_task_id', taskId),
    supabase.from('core_sawing_tasks').select('id').eq('drilling_task_id', taskId),
    supabase.from('sampling_tasks').select('id').eq('drilling_task_id', taskId),
  ])
  const geoReports: Report[] = []
  const loadAttached = async (column: string, ids: string[]) => {
    if (ids.length === 0) return
    const { data } = await supabase.from('reports').select('*').in(column, ids).eq('approval_status', 'approved')
    geoReports.push(...((data ?? []) as Report[]))
  }
  await Promise.all([
    loadAttached('core_description_task_id', (coreT.data ?? []).map((x) => x.id as string)),
    loadAttached('core_sawing_task_id', (sawT.data ?? []).map((x) => x.id as string)),
    loadAttached('sampling_task_id', (samT.data ?? []).map((x) => x.id as string)),
  ])
  const geology = {
    core: round2(geoReports.reduce((s, r) => s + (r.core_description_interval_to != null ? r.core_description_interval_to - (r.core_description_interval_from ?? 0) : 0), 0)),
    photo: round2(geoReports.reduce((s, r) => s + (r.photofixation_interval_to != null ? r.photofixation_interval_to - (r.photofixation_interval_from ?? 0) : 0), 0)),
    sawn: round2(geoReports.reduce((s, r) => s + (r.sawn_meters ?? 0), 0)),
    taken: geoReports.reduce((s, r) => s + (r.samples_taken ?? 0), 0),
    submitted: geoReports.reduce((s, r) => s + (r.samples_submitted ?? 0), 0),
    any: geoReports.length > 0,
  }
  const samples: { name: string; quantity: number }[] = []
  if (geoReports.length > 0) {
    const { data: sRows } = await supabase.from('report_samples').select('quantity, sample_types(name)').in('report_id', geoReports.map((r) => r.id))
    const byType = new Map<string, number>()
    for (const row of (sRows ?? []) as unknown as { quantity: number; sample_types: { name: string } | null }[]) {
      byType.set(row.sample_types?.name ?? '—', (byType.get(row.sample_types?.name ?? '—') ?? 0) + row.quantity)
    }
    samples.push(...[...byType.entries()].map(([name, quantity]) => ({ name, quantity })))
  }

  // ---- бригада (история назначений)
  const crew: WellReportData['crew'] = []
  const { data: asg } = await supabase.from('task_worker_assignments').select('role, shift_number, worker_id, valid_from, valid_to').eq('drilling_task_id', taskId).in('role', ['driller', 'assistant_driller']).order('valid_from')
  const wIds = [...new Set((asg ?? []).map((a) => a.worker_id as string))]
  if (wIds.length > 0) {
    const { data: ws } = await supabase.from('workers').select('id, full_name').in('id', wIds)
    const wn = new Map((ws ?? []).map((w) => [w.id as string, w.full_name as string]))
    for (const a of asg ?? []) {
      crew.push({
        role: a.role === 'driller' ? 'Буровик' : 'Помощник бурильщика',
        shift: a.shift_number as number | null,
        name: wn.get(a.worker_id as string) ?? '—',
        from: String(a.valid_from).slice(0, 10),
        to: a.valid_to ? String(a.valid_to).slice(0, 10) : null,
      })
    }
  }

  // ---- итоги
  const meters = totalDepth
  const hours = round2(reports.reduce((s, r) => s + (r.hours_worked ?? 0), 0))
  const daysElapsed = nDays
  const pace = daysElapsed > 0 ? round2(meters / daysElapsed) : 0
  let bestShift: WellReportData['totals']['bestShift'] = null
  for (const r of reports) {
    const m = metersOf(r)
    if (m > 0 && (!bestShift || m > bestShift.meters)) bestShift = { meters: round2(m), date: r.report_date, shift: r.shift_number }
  }
  const shift1 = round2(reports.filter((r) => r.shift_number !== 2).reduce((s, r) => s + metersOf(r), 0))
  const shift2 = round2(reports.filter((r) => r.shift_number === 2).reduce((s, r) => s + metersOf(r), 0))
  let forecast: string | null = null
  if (t.projected_depth && !t.closed_reason) {
    const left = t.projected_depth - meters
    if (left <= 0) forecast = 'проектная глубина достигнута'
    else if (pace > 0) forecast = formatDateRu(addDays(todayIso(), Math.ceil(left / pace)))
  }
  const lastDay = days[days.length - 1]
  const planDeviation = lastDay?.plan != null ? round2(meters - lastDay.plan) : null

  return {
    task: t,
    siteName: (siteRes.data as { name: string } | null)?.name ?? '—',
    siteBoundary: ((siteRes.data as { boundary: [number, number][] | null } | null)?.boundary ?? null),
    siteWells,
    rigLabel: rigRes.data ? `${(rigRes.data as { rig_number: string; model: string | null }).rig_number}${(rigRes.data as { model: string | null }).model ? ` (${(rigRes.data as { model: string | null }).model})` : ''}` : null,
    orgName: (orgRes.data as { name: string } | null)?.name ?? null,
    foremanName: (foremanRes.data as { full_name: string } | null)?.full_name ?? null,
    reports,
    days,
    masters,
    intervals,
    masterSegments,
    casings,
    reamings,
    events,
    costs,
    samples,
    geology,
    crew,
    totals: {
      meters,
      hours,
      shifts: reports.length,
      activeDays: days.filter((d) => d.total > 0).length,
      daysElapsed,
      pace,
      bestShift,
      shift1,
      shift2,
      forecast,
      planDeviation,
      percent: t.projected_depth ? round2((meters / t.projected_depth) * 100) : null,
    },
    generatedAt: new Date().toISOString(),
  }
}
