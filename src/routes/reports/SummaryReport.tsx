import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Download, Timer, Layers, Camera, Coins, Scissors, FlaskConical, TrendingUp, FileText } from 'lucide-react'
import DerrickIcon from '../../components/icons/DerrickIcon'
import { supabase } from '../../lib/supabaseClient'
import { exportToXlsx } from '../../lib/xlsxExport'
import { useAuth } from '../../context/AuthContext'
import { isManagement } from '../../types/roles'
import { riseIn } from '../../lib/motionVariants'
import { round2 } from '../../lib/taskProgress'
import SearchSelect from '../../components/SearchSelect'
import { DailyBarsChart, HBars, MASTER_COLORS, shortName } from '../../components/report/ReportCharts'
import { loadWellReportData, type DayRow, type WellReportData } from '../../lib/wellReportData'
import type { CoreDescriptionTask, DrillingTask, Report, Site } from '../../types/database'

interface EnrichedReport extends Report {
  siteName: string
  wellLabel: string
}

// Значение в <select> задания — закодированный тип+id, чтобы одним
// полем выбирать и из бурения, и из описания керна (два разных FK
// в reports, drilling_task_id / core_description_task_id).
type TaskFilterValue = '' | `drilling:${string}` | `core:${string}`

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

// По умолчанию — последние 30 дней: в начале месяца «с 1-го числа» давало
// пустой отчёт, хотя свежие данные за прошлый месяц есть.
function defaultFromIso() {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d.toISOString().slice(0, 10)
}

// Сводный отчёт — см. ТЗ раздел 4.2 (v0.1) + раздел 6 (v0.6, экспорт).
// Считаем только по ОДОБРЕННЫМ сводкам — черновики и то, что ещё на
// согласовании, в официальные цифры не входят.
export default function SummaryReport() {
  const { session, profile, loading: authLoading } = useAuth()

  const [sites, setSites] = useState<Site[]>([])
  const [selectedSiteId, setSelectedSiteId] = useState('')

  // Задания текущего выбранного участка — каскадный фильтр.
  const [allDrillingTasks, setAllDrillingTasks] = useState<DrillingTask[]>([])
  const [allCoreTasks, setAllCoreTasks] = useState<CoreDescriptionTask[]>([])
  const [wellData, setWellData] = useState<WellReportData | null>(null)
  const [wellLoading, setWellLoading] = useState(false)
  const [withCosts, setWithCosts] = useState(false)
  const [showAllList, setShowAllList] = useState(false)
  const [selectedTask, setSelectedTask] = useState<TaskFilterValue>('')

  const [dateFrom, setDateFrom] = useState(defaultFromIso())
  const [dateTo, setDateTo] = useState(todayIso())

  const [reports, setReports] = useState<EnrichedReport[]>([])
  const [costTotals, setCostTotals] = useState<
    { categoryName: string; unit: string | null; quantity: number; amount: number }[]
  >([])
  const [sampleTotals, setSampleTotals] = useState<{ name: string; quantity: number }[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!session) return
    supabase
      .from('sites')
      .select('*')
      .order('name')
      .then(({ data }) => data && setSites(data))
  }, [session])

  // Все задания сразу (поиск по номеру скважины работает по всем участкам);
  // список в выпадашке сужается выбранным участком.
  useEffect(() => {
    if (!session) return
    Promise.all([
      supabase.from('drilling_tasks').select('*').order('well_number'),
      supabase.from('core_description_tasks').select('*'),
    ]).then(([drillingRes, coreRes]) => {
      setAllDrillingTasks((drillingRes.data ?? []) as DrillingTask[])
      setAllCoreTasks((coreRes.data ?? []) as CoreDescriptionTask[])
    })
  }, [session])

  // Мини-дашборд выбранной скважины (бурение)
  useEffect(() => {
    if (!selectedTask.startsWith('drilling:')) {
      setWellData(null)
      return
    }
    let cancelled = false
    setWellLoading(true)
    loadWellReportData(selectedTask.slice('drilling:'.length)).then((d) => {
      if (!cancelled) {
        setWellData(d)
        setWellLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [selectedTask])

  useEffect(() => {
    if (!session || !isManagement(profile?.role)) return
    loadReport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, profile, selectedSiteId, selectedTask, dateFrom, dateTo])

  async function loadReport() {
    setLoading(true)
    setError(null)

    let query = supabase
      .from('reports')
      .select('*')
      .eq('approval_status', 'approved')
      .gte('report_date', dateFrom)
      .lte('report_date', dateTo)

    if (selectedSiteId) query = query.eq('site_id', selectedSiteId)

    if (selectedTask.startsWith('drilling:')) {
      query = query.eq('drilling_task_id', selectedTask.slice('drilling:'.length))
    } else if (selectedTask.startsWith('core:')) {
      query = query.eq(
        'core_description_task_id',
        selectedTask.slice('core:'.length),
      )
    }

    const { data: list, error: fetchError } = await query.order('report_date')

    if (fetchError) {
      setError(fetchError.message)
      setLoading(false)
      return
    }

    const reportsList = list ?? []

    const siteIds = [...new Set(reportsList.map((r) => r.site_id))]
    const drillingTaskIds = [
      ...new Set(reportsList.map((r) => r.drilling_task_id).filter(Boolean)),
    ] as string[]
    const coreTaskIds = [
      ...new Set(
        reportsList.map((r) => r.core_description_task_id).filter(Boolean),
      ),
    ] as string[]

    const [sitesRes, drillingRes, coreRes, costsRes] = await Promise.all([
      siteIds.length
        ? supabase.from('sites').select('id, name').in('id', siteIds)
        : Promise.resolve({ data: [] }),
      drillingTaskIds.length
        ? supabase
            .from('drilling_tasks')
            .select('id, well_number')
            .in('id', drillingTaskIds)
        : Promise.resolve({ data: [] }),
      coreTaskIds.length
        ? supabase
            .from('core_description_tasks')
            .select('id, external_well_number, drilling_task_id')
            .in('id', coreTaskIds)
        : Promise.resolve({ data: [] }),
      reportsList.length
        ? supabase
            .from('report_costs')
            .select('*, cost_items(name, unit, cost_categories(name))')
            .in(
              'report_id',
              reportsList.map((r) => r.id),
            )
        : Promise.resolve({ data: [] }),
    ])

    const siteMap = new Map((sitesRes.data ?? []).map((s) => [s.id, s.name]))
    const drillingMap = new Map(
      (drillingRes.data ?? []).map((d) => [d.id, d.well_number]),
    )
    const coreMap = new Map(
      (coreRes.data ?? []).map((c) => [
        c.id,
        c.drilling_task_id
          ? `керн, скв. №${drillingMap.get(c.drilling_task_id) ?? '?'}`
          : `керн, подрядчик №${c.external_well_number}`,
      ]),
    )

    const enriched: EnrichedReport[] = reportsList.map((r) => ({
      ...r,
      siteName: siteMap.get(r.site_id) ?? '—',
      wellLabel: r.drilling_task_id
        ? `бурение, скв. №${drillingMap.get(r.drilling_task_id) ?? '?'}`
        : (coreMap.get(r.core_description_task_id ?? '') ?? '—'),
    }))
    setReports(enriched)

    // Пробы по видам (справочник видов проб, миграция 0021)
    if (reportsList.length > 0) {
      const { data: sampleRows } = await supabase
        .from('report_samples')
        .select('quantity, sample_types(name)')
        .in(
          'report_id',
          reportsList.map((r) => r.id),
        )
      const byType = new Map<string, number>()
      for (const row of (sampleRows ?? []) as unknown as { quantity: number; sample_types: { name: string } | null }[]) {
        const name = row.sample_types?.name ?? '—'
        byType.set(name, (byType.get(name) ?? 0) + row.quantity)
      }
      setSampleTotals([...byType.entries()].map(([name, quantity]) => ({ name, quantity })).sort((a, b) => a.name.localeCompare(b.name)))
    } else {
      setSampleTotals([])
    }

    // Агрегация затрат по видам затрат (внутри категории)
    type CostRow = {
      quantity: number | null
      amount: number | null
      cost_items: { name: string; unit: string | null; cost_categories: { name: string } | null } | null
    }
    const costsByCategory = new Map<
      string,
      { unit: string | null; quantity: number; amount: number }
    >()
    for (const c of (costsRes.data ?? []) as CostRow[]) {
      const categoryName = c.cost_items?.cost_categories?.name ?? '—'
      const itemName = c.cost_items?.name ?? '—'
      const name = `${categoryName} — ${itemName}`
      const prev = costsByCategory.get(name) ?? {
        unit: c.cost_items?.unit ?? null,
        quantity: 0,
        amount: 0,
      }
      prev.quantity += c.quantity ?? 0
      prev.amount += c.amount ?? 0
      costsByCategory.set(name, prev)
    }
    setCostTotals(
      [...costsByCategory.entries()].map(([categoryName, v]) => ({
        categoryName,
        ...v,
      })),
    )

    setLoading(false)
  }

  if (authLoading) return <p>Загрузка…</p>
  if (!session) return <Navigate to="/login" replace />
  if (!isManagement(profile?.role)) {
    return <p>Отчёты доступны только гендиру/техдиру.</p>
  }

  const totalHours = round2(reports.reduce((s, r) => s + (r.hours_worked ?? 0), 0))
  const totalDrillingMeters = round2(
    reports.reduce((s, r) => s + (r.drilling_meters ?? 0), 0),
  )
  const totalCoreMeters = round2(
    reports.reduce((s, r) => {
      if (r.core_description_interval_to == null) return s
      return (
        s +
        (r.core_description_interval_to - (r.core_description_interval_from ?? 0))
      )
    }, 0),
  )
  const totalPhotoMeters = round2(
    reports.reduce((s, r) => {
      if (r.photofixation_interval_to == null) return s
      return (
        s + (r.photofixation_interval_to - (r.photofixation_interval_from ?? 0))
      )
    }, 0),
  )
  // Распиловка/опробование — раньше не входили в сводный отчёт вообще
  // (пробел, найденный при исследовании фазы 3 редизайна 25.09.2026),
  // хотя строки reports для них уже приходят тем же запросом (фильтр
  // выше — по approval_status/датам/участку, не по виду работ).
  const totalSawnMeters = round2(reports.reduce((s, r) => s + (r.sawn_meters ?? 0), 0))
  const totalSamplesTaken = reports.reduce((s, r) => s + (r.samples_taken ?? 0), 0)
  const totalSamplesSubmitted = reports.reduce((s, r) => s + (r.samples_submitted ?? 0), 0)

  // Темп бурения по дням за период (только согласованные сводки). Для выбранной
  // скважины график строится по всей её истории (wellData.days).
  const periodDays: DayRow[] = (() => {
    const byDate = new Map<string, { s1: number; s2: number }>()
    for (const r of reports) {
      if (!r.drilling_meters) continue
      const c = byDate.get(r.report_date) ?? { s1: 0, s2: 0 }
      if (r.shift_number === 2) c.s2 += r.drilling_meters
      else c.s1 += r.drilling_meters
      byDate.set(r.report_date, c)
    }
    let cum = 0
    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, c]) => {
        const total = round2(c.s1 + c.s2)
        cum = round2(cum + total)
        return { date, s1: c.s1 ? round2(c.s1) : null, s2: c.s2 ? round2(c.s2) : null, total, cum, plan: null, hours: 0 }
      })
  })()

  // Списки для поиска
  const siteOptions = sites.map((x) => ({ value: x.id, label: x.name }))
  const siteNameOf = new Map(sites.map((x) => [x.id, x.name]))
  const taskOptions = [
    ...allDrillingTasks
      .filter((tk) => !selectedSiteId || tk.site_id === selectedSiteId)
      .map((tk) => ({
        value: `drilling:${tk.id}`,
        label: `№${tk.well_number}`,
        hint: selectedSiteId ? undefined : siteNameOf.get(tk.site_id),
        group: 'Бурение',
      })),
    ...allCoreTasks
      .filter((tk) => !selectedSiteId || tk.site_id === selectedSiteId)
      .map((tk) => ({
        value: `core:${tk.id}`,
        label: tk.drilling_task_id ? `Керн, своя скв. ${allDrillingTasks.find((d) => d.id === tk.drilling_task_id)?.well_number ?? ''}` : `Керн, подрядчик №${tk.external_well_number}`,
        hint: selectedSiteId ? undefined : siteNameOf.get(tk.site_id),
        group: 'Описание керна',
      })),
  ]

  function setPeriodDays(n: number | null) {
    const to = todayIso()
    setDateTo(to)
    if (n == null) setDateFrom('2020-01-01')
    else {
      const d = new Date()
      d.setDate(d.getDate() - n)
      setDateFrom(d.toISOString().slice(0, 10))
    }
  }

  function handleExport() {
    exportToXlsx(
      `report_${dateFrom}_${dateTo}.xlsx`,
      'Сводки',
      [
        'Дата',
        'Смена',
        'Участок',
        'Задание',
        'Часы',
        'Метраж бурения, м',
        'Керн от',
        'Керн до',
        'Фото от',
        'Фото до',
        'Распиловка, м',
        'Проб отобрано',
        'Проб сдано',
      ],
      reports.map((r) => [
        r.report_date,
        r.shift_number,
        r.siteName,
        r.wellLabel,
        r.hours_worked,
        r.drilling_meters,
        r.core_description_interval_from,
        r.core_description_interval_to,
        r.photofixation_interval_from,
        r.photofixation_interval_to,
        r.sawn_meters,
        r.samples_taken,
        r.samples_submitted,
      ]),
    ).catch(() => setError('Не удалось сформировать файл экспорта.'))
  }

  const statTiles = [
    { label: 'Часы работы', value: totalHours, unit: 'ч', icon: Timer },
    { label: 'Метраж бурения', value: totalDrillingMeters, unit: 'м', icon: DerrickIcon },
    { label: 'Описание керна', value: totalCoreMeters, unit: 'м', icon: Layers },
    { label: 'Фотофиксация', value: totalPhotoMeters, unit: 'м', icon: Camera },
    { label: 'Распиловка', value: totalSawnMeters, unit: 'м', icon: Scissors },
    { label: 'Проб отобрано', value: totalSamplesTaken, unit: `(сдано ${totalSamplesSubmitted})`, icon: FlaskConical },
  ]

  return (
    <div>
      <h1>Сводный отчёт</h1>
      <p className="text-muted" style={{ marginBottom: 20 }}>
        Учитываются только согласованные сводки.
      </p>

      <div className="card" style={{ display: 'grid', gap: 12, marginBottom: 20, padding: 16 }}>
        <div className="report-filters">
          <label style={{ marginBottom: 0 }}>
            Участок
            <SearchSelect
              options={siteOptions}
              value={selectedSiteId}
              onChange={(v) => {
                setSelectedSiteId(v)
                if (v && selectedTask) {
                  const id = selectedTask.slice(selectedTask.indexOf(':') + 1)
                  const task = allDrillingTasks.find((x) => x.id === id) ?? allCoreTasks.find((x) => x.id === id)
                  if (task && task.site_id !== v) setSelectedTask('')
                }
              }}
              emptyLabel="Все участки"
              ariaLabel="Участок"
            />
          </label>
          <label style={{ marginBottom: 0 }}>
            Скважина / задание
            <SearchSelect
              options={taskOptions}
              value={selectedTask}
              onChange={(v) => {
                setSelectedTask(v as TaskFilterValue)
                if (v && !selectedSiteId) {
                  const id = v.slice(v.indexOf(':') + 1)
                  const task = allDrillingTasks.find((x) => x.id === id) ?? allCoreTasks.find((x) => x.id === id)
                  if (task) setSelectedSiteId(task.site_id)
                }
              }}
              emptyLabel="Все задания"
              placeholder="Введите номер скважины…"
              ariaLabel="Скважина или задание"
            />
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {([['7 дней', 7], ['30 дней', 30], ['90 дней', 90], ['Весь период', null]] as const).map(([label, n]) => (
            <button key={label} type="button" className="btn-outline" onClick={() => setPeriodDays(n)} style={{ minHeight: 34, padding: '4px 12px', fontSize: 13 }}>
              {label}
            </button>
          ))}
          <label style={{ marginBottom: 0 }}>
            С
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label style={{ marginBottom: 0 }}>
            По
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>
        </div>
      </div>

      {selectedTask.startsWith('drilling:') && (
        <div className="card" style={{ padding: 16, marginBottom: 24 }}>
          {wellLoading || !wellData ? (
            <div className="skeleton" style={{ height: 120, borderRadius: 'var(--radius-md)' }} />
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                <h2 style={{ margin: 0, fontStyle: 'italic' }}>№{wellData.task.well_number}</h2>
                <span className="text-muted">{wellData.siteName}</span>
                <Link to={`/tasks/drilling/${wellData.task.id}/dashboard`} style={{ marginLeft: 'auto', fontSize: 13 }}>Открыть задание →</Link>
              </div>
              <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', marginBottom: 14 }}>
                {[
                  { label: 'Пробурено', value: `${round2(wellData.totals.meters)} м` },
                  { label: 'От проекта', value: wellData.totals.percent != null ? `${wellData.totals.percent}%` : '—' },
                  { label: 'Средний темп', value: `${wellData.totals.pace} м/сут` },
                  { label: 'Смен', value: String(wellData.totals.shifts) },
                  { label: 'Мастеров', value: String(wellData.masters.length) },
                ].map((k) => (
                  <div key={k.label} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '10px 12px' }}>
                    <div className="num" style={{ fontSize: 18, fontWeight: 700 }}>{k.value}</div>
                    <div className="text-muted" style={{ fontSize: 12 }}>{k.label}</div>
                  </div>
                ))}
              </div>
              <div className="eyebrow" style={{ marginBottom: 6 }}>Темп бурения по дням (вся история скважины)</div>
              <DailyBarsChart days={wellData.days} projectedDepth={wellData.task.projected_depth} />
              {wellData.masters.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div className="eyebrow" style={{ marginBottom: 8 }}>Кто бурил</div>
                  <HBars items={wellData.masters.map((m, i) => ({ label: shortName(m.name), value: m.meters, color: MASTER_COLORS[i % MASTER_COLORS.length], note: `${m.shifts} см.` }))} />
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginTop: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, color: 'var(--color-text)' }}>
                  <input type="checkbox" checked={withCosts} onChange={(e) => setWithCosts(e.target.checked)} style={{ width: 'auto' }} />
                  Включить затраты
                </label>
                <Link to={`/reports/well/${wellData.task.id}${withCosts ? '?costs=1' : ''}`} style={{ marginLeft: 'auto' }}>
                  <button type="button" style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                    <FileText size={16} /> Составить отчёт по скважине
                  </button>
                </Link>
              </div>
            </>
          )}
        </div>
      )}

      {error && <p className="text-error">{error}</p>}

      {loading ? (
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: 80, borderRadius: 'var(--radius-md)' }} />
          ))}
        </div>
      ) : (
        <>
          <h2>Итого за период</h2>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginBottom: 24 }}>
            {statTiles.map((tile, i) => (
              <motion.div
                key={tile.label}
                className="card"
                {...riseIn(i, { duration: 0.28, step: 0.04, cap: Infinity })}
                style={{ padding: 16 }}
              >
                <tile.icon size={17} className="text-muted" style={{ marginBottom: 8 }} />
                <div className="num" style={{ fontSize: 22, fontWeight: 700 }}>
                  {tile.value} {tile.unit}
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 600 }}>{tile.label}</div>
              </motion.div>
            ))}
          </div>

          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TrendingUp size={18} className="text-muted" /> Темп бурения по дням (за выбранный период)
          </h2>
          <div className="card" style={{ padding: 16, marginBottom: 24 }}>
            <DailyBarsChart days={periodDays} />
          </div>

          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Coins size={18} className="text-muted" /> Затраты по категориям
          </h2>
          {costTotals.length === 0 ? (
            <p className="text-muted">Затрат за период нет.</p>
          ) : (
            <div className="card" style={{ padding: 4, marginBottom: 24 }}>
              <ul>
                {costTotals.map((c) => (
                  <li key={c.categoryName} style={{ padding: '10px 12px', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{c.categoryName}</span>
                    <span className="num text-muted">
                      {c.quantity}
                      {c.unit ? ` ${c.unit}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {sampleTotals.length > 0 && (
            <>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FlaskConical size={18} className="text-muted" /> Пробы по видам
              </h2>
              <div className="card" style={{ padding: 4, marginBottom: 24 }}>
                <ul>
                  {sampleTotals.map((t) => (
                    <li key={t.name} style={{ padding: '10px 12px', display: 'flex', justifyContent: 'space-between' }}>
                      <span>{t.name}</span>
                      <span className="num text-muted">{t.quantity}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          <button
            type="button"
            onClick={handleExport}
            disabled={reports.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 24 }}
          >
            <Download size={16} /> Экспорт в Excel ({reports.length} строк)
          </button>

          <h2>Последние сводки</h2>
          {reports.length === 0 ? (
            <p className="text-muted">За выбранный период и участок нет одобренных сводок.</p>
          ) : (
            <div className="card" style={{ padding: 4 }}>
              <ul>
                {[...reports].reverse().slice(0, showAllList ? reports.length : 10).map((r) => (
                  <li key={r.id} style={{ padding: '10px 12px' }}>
                    <span className="num">{r.report_date}</span>
                    {r.shift_number ? `, смена ${r.shift_number}` : ''} —{' '}
                    {r.siteName}, {r.wellLabel}
                  </li>
                ))}
              </ul>
              {reports.length > 10 && (
                <button type="button" className="btn-outline" onClick={() => setShowAllList((v) => !v)} style={{ width: '100%', margin: '4px 0' }}>
                  {showAllList ? 'Свернуть список' : `Показать все (${reports.length})`}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
