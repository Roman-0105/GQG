import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Download, Timer, Layers, Camera, Coins } from 'lucide-react'
import DerrickIcon from '../../components/icons/DerrickIcon'
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

  const statTiles = [
    { label: 'Часы работы', value: totalHours, unit: 'ч', icon: Timer },
    { label: 'Метраж бурения', value: totalDrillingMeters, unit: 'м', icon: DerrickIcon },
    { label: 'Описание керна', value: totalCoreMeters, unit: 'м', icon: Layers },
    { label: 'Фотофиксация', value: totalPhotoMeters, unit: 'м', icon: Camera },
  ]

  return (
    <div>
      <h1>Сводный отчёт</h1>
      <p className="text-muted" style={{ marginBottom: 20 }}>
        Учитываются только одобренные сводки (approval_status = approved).
      </p>

      <div className="card" style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap', padding: 16 }}>
        <label style={{ marginBottom: 0 }}>
          Участок
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
        <label style={{ marginBottom: 0 }}>
          Задание
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
        <label style={{ marginBottom: 0 }}>
          С
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </label>
        <label style={{ marginBottom: 0 }}>
          По
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </label>
      </div>

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
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
                style={{ padding: 16 }}
              >
                <tile.icon size={17} className="text-muted" style={{ marginBottom: 8 }} />
                <div className="num" style={{ fontSize: 24, fontWeight: 700 }}>
                  {tile.value} {tile.unit}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--color-text-muted)', fontWeight: 600 }}>{tile.label}</div>
              </motion.div>
            ))}
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

          <button
            type="button"
            onClick={handleExport}
            disabled={reports.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 24 }}
          >
            <Download size={16} /> Экспорт в Excel ({reports.length} строк)
          </button>

          <h2>Сводки за период</h2>
          {reports.length === 0 ? (
            <p className="text-muted">За выбранный период и участок нет одобренных сводок.</p>
          ) : (
            <div className="card" style={{ padding: 4 }}>
              <ul>
                {reports.map((r) => (
                  <li key={r.id} style={{ padding: '10px 12px' }}>
                    <span className="num">{r.report_date}</span>
                    {r.shift_number ? `, смена ${r.shift_number}` : ''} —{' '}
                    {r.siteName}, {r.wellLabel}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  )
}
