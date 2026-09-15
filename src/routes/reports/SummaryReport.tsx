import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { exportToXlsx } from '../../lib/xlsxExport'
import { useAuth } from '../../context/AuthContext'
import { isManagement } from '../../types/roles'
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

function firstOfMonthIso() {
  const d = new Date()
  d.setDate(1)
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
  const [siteDrillingTasks, setSiteDrillingTasks] = useState<DrillingTask[]>([])
  const [siteCoreTasks, setSiteCoreTasks] = useState<CoreDescriptionTask[]>([])
  const [selectedTask, setSelectedTask] = useState<TaskFilterValue>('')

  const [dateFrom, setDateFrom] = useState(firstOfMonthIso())
  const [dateTo, setDateTo] = useState(todayIso())

  const [reports, setReports] = useState<EnrichedReport[]>([])
  const [costTotals, setCostTotals] = useState<
    { categoryName: string; unit: string | null; quantity: number; amount: number }[]
  >([])
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

  // Смена участка — сбрасываем выбранное задание и подгружаем список
  // заданий именно этого участка (бурение + описание керна).
  useEffect(() => {
    setSelectedTask('')
    if (!session || !selectedSiteId) {
      setSiteDrillingTasks([])
      setSiteCoreTasks([])
      return
    }
    Promise.all([
      supabase
        .from('drilling_tasks')
        .select('*')
        .eq('site_id', selectedSiteId)
        .order('well_number'),
      supabase
        .from('core_description_tasks')
        .select('*')
        .eq('site_id', selectedSiteId),
    ]).then(([drillingRes, coreRes]) => {
      setSiteDrillingTasks(drillingRes.data ?? [])
      setSiteCoreTasks(coreRes.data ?? [])
    })
  }, [session, selectedSiteId])

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
            .select('*, cost_categories(name, unit)')
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

    // Агрегация затрат по категориям
    type CostRow = {
      quantity: number | null
      amount: number | null
      cost_categories: { name: string; unit: string | null } | null
    }
    const costsByCategory = new Map<
      string,
      { unit: string | null; quantity: number; amount: number }
    >()
    for (const c of (costsRes.data ?? []) as CostRow[]) {
      const name = c.cost_categories?.name ?? '—'
      const prev = costsByCategory.get(name) ?? {
        unit: c.cost_categories?.unit ?? null,
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

  const totalHours = reports.reduce((s, r) => s + (r.hours_worked ?? 0), 0)
  const totalDrillingMeters = reports.reduce(
    (s, r) => s + (r.drilling_meters ?? 0),
    0,
  )
  const totalCoreMeters = reports.reduce((s, r) => {
    if (r.core_description_interval_to == null) return s
    return (
      s +
      (r.core_description_interval_to - (r.core_description_interval_from ?? 0))
    )
  }, 0)
  const totalPhotoMeters = reports.reduce((s, r) => {
    if (r.photofixation_interval_to == null) return s
    return (
      s + (r.photofixation_interval_to - (r.photofixation_interval_from ?? 0))
    )
  }, 0)

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
      ]),
    ).catch(() => setError('Не удалось сформировать файл экспорта.'))
  }

  return (
    <div>
      <h1>Сводный отчёт</h1>
      <p style={{ opacity: 0.7 }}>
        Учитываются только одобренные сводки (approval_status = approved).
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <label>
          Участок{' '}
          <select
            value={selectedSiteId}
            onChange={(e) => setSelectedSiteId(e.target.value)}
          >
            <option value="">Все</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Задание{' '}
          <select
            value={selectedTask}
            onChange={(e) => setSelectedTask(e.target.value as TaskFilterValue)}
            disabled={!selectedSiteId}
          >
            <option value="">
              {selectedSiteId ? 'Все задания участка' : 'Сначала выберите участок'}
            </option>
            {siteDrillingTasks.length > 0 && (
              <optgroup label="Бурение">
                {siteDrillingTasks.map((t) => (
                  <option key={t.id} value={`drilling:${t.id}`}>
                    Скважина №{t.well_number}
                  </option>
                ))}
              </optgroup>
            )}
            {siteCoreTasks.length > 0 && (
              <optgroup label="Описание керна">
                {siteCoreTasks.map((t) => (
                  <option key={t.id} value={`core:${t.id}`}>
                    {t.drilling_task_id
                      ? `Своя скв. (задание ${t.id.slice(0, 8)})`
                      : `Подрядчик, скв. №${t.external_well_number}`}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
        <label>
          С{' '}
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </label>
        <label>
          По{' '}
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </label>
      </div>

      {error && <p style={{ color: '#c0392b' }}>{error}</p>}

      {loading ? (
        <p>Загрузка…</p>
      ) : (
        <>
          <h2>Итого за период</h2>
          <ul>
            <li>Часы работы: {totalHours}</li>
            <li>Метраж бурения: {totalDrillingMeters} м</li>
            <li>Метраж описания керна: {totalCoreMeters} м</li>
            <li>Метраж фотофиксации керна: {totalPhotoMeters} м</li>
          </ul>

          <h2>Затраты по категориям</h2>
          {costTotals.length === 0 ? (
            <p>Затрат за период нет.</p>
          ) : (
            <ul>
              {costTotals.map((c) => (
                <li key={c.categoryName}>
                  {c.categoryName}: {c.quantity}
                  {c.unit ? ` ${c.unit}` : ''} / {c.amount} ₽
                </li>
              ))}
            </ul>
          )}

          <p>
            <button type="button" onClick={handleExport} disabled={reports.length === 0}>
              Экспорт в Excel ({reports.length} строк)
            </button>
          </p>

          <h2>Сводки за период</h2>
          {reports.length === 0 ? (
            <p>За выбранный период и участок нет одобренных сводок.</p>
          ) : (
            <ul>
              {reports.map((r) => (
                <li key={r.id}>
                  {r.report_date}
                  {r.shift_number ? `, смена ${r.shift_number}` : ''} —{' '}
                  {r.siteName}, {r.wellLabel}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
