import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ClipboardCheck, ChevronDown, ChevronRight, PartyPopper, X } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { isManagement } from '../../types/roles'
import { riseIn } from '../../lib/motionVariants'
import type { Report } from '../../types/database'

type SubtaskKey = 'drilling' | 'core-geological' | 'core-geotechnical' | 'sawing' | 'sampling'

const SUBTASK_ORDER: SubtaskKey[] = ['drilling', 'core-geological', 'core-geotechnical', 'sawing', 'sampling']
const SUBTASK_LABELS: Record<SubtaskKey, string> = {
  drilling: 'Бурение',
  'core-geological': 'Керн — геологическая документация',
  'core-geotechnical': 'Керн — геотехническая документация',
  sawing: 'Распиловка керна',
  sampling: 'Опробование',
}

interface EnrichedReport extends Report {
  authorName: string
  siteName: string
  // Ключ группировки "скважина/задание" — для своей скважины это
  // drilling_task_id (общий для бурения и всех прицепленных к ней работ,
  // см. отзыв 19.09.2026), для скважины подрядчика — синтетический ключ
  // на саму подзадачу (у неё нет общего "родителя").
  wellKey: string
  wellLabel: string
  subtaskKey: SubtaskKey
}

interface GroupedSubtask {
  key: SubtaskKey
  label: string
  reports: EnrichedReport[]
}
interface GroupedWell {
  key: string
  label: string
  subtasks: GroupedSubtask[]
  count: number
}
interface GroupedSite {
  siteId: string
  siteName: string
  wells: GroupedWell[]
  count: number
}

// Категоризация сводок на согласовании по участкам -> заданиям (скважинам)
// -> видам работ под заданием (19.09.2026 отзыв: "все приходящие сводки
// нужно категоризировать... для удобства ориентирования") + фильтры по
// участку/заданию/бригадиру. Раньше это был плоский список, отсортированный
// только по времени отправки — при нескольких участках сразу было сложно
// понять, что где.
function groupReports(reports: EnrichedReport[]): GroupedSite[] {
  const siteMap = new Map<string, GroupedSite>()

  for (const r of reports) {
    let site = siteMap.get(r.site_id)
    if (!site) {
      site = { siteId: r.site_id, siteName: r.siteName, wells: [], count: 0 }
      siteMap.set(r.site_id, site)
    }
    site.count += 1

    let well = site.wells.find((w) => w.key === r.wellKey)
    if (!well) {
      well = { key: r.wellKey, label: r.wellLabel, subtasks: [], count: 0 }
      site.wells.push(well)
    }
    well.count += 1

    let subtask = well.subtasks.find((s) => s.key === r.subtaskKey)
    if (!subtask) {
      subtask = { key: r.subtaskKey, label: SUBTASK_LABELS[r.subtaskKey], reports: [] }
      well.subtasks.push(subtask)
    }
    subtask.reports.push(r)
  }

  const sites = [...siteMap.values()]
  sites.sort((a, b) => a.siteName.localeCompare(b.siteName))
  for (const site of sites) {
    site.wells.sort((a, b) => a.label.localeCompare(b.label))
    for (const well of site.wells) {
      well.subtasks.sort((a, b) => SUBTASK_ORDER.indexOf(a.key) - SUBTASK_ORDER.indexOf(b.key))
    }
  }
  return sites
}

function shiftLabel(r: Report, subtaskKey: SubtaskKey) {
  if (!r.shift_number) return ''
  if (subtaskKey === 'sawing') return r.shift_number === 1 ? ', день' : ', ночь'
  return `, смена ${r.shift_number}`
}

export default function PendingApprovals() {
  const { session, profile, loading: authLoading } = useAuth()
  const [reports, setReports] = useState<EnrichedReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [collapsedSiteIds, setCollapsedSiteIds] = useState<Set<string>>(new Set())

  const [filterSiteId, setFilterSiteId] = useState('')
  const [filterWellKey, setFilterWellKey] = useState('')
  const [filterForemanId, setFilterForemanId] = useState('')

  useEffect(() => {
    if (!session || !isManagement(profile?.role)) return

    async function load() {
      setLoading(true)
      const { data: pending, error: fetchError } = await supabase
        .from('reports')
        .select('*')
        .eq('approval_status', 'submitted')
        .order('submitted_at', { ascending: true })

      if (fetchError) {
        setError(fetchError.message)
        setLoading(false)
        return
      }

      const list = pending ?? []
      const authorIds = [...new Set(list.map((r) => r.author_id))]
      const siteIds = [...new Set(list.map((r) => r.site_id))]
      const directDrillingTaskIds = [
        ...new Set(list.map((r) => r.drilling_task_id).filter(Boolean)),
      ] as string[]
      const coreTaskIds = [
        ...new Set(
          list.map((r) => r.core_description_task_id).filter(Boolean),
        ),
      ] as string[]
      const sawingTaskIds = [
        ...new Set(list.map((r) => r.core_sawing_task_id).filter(Boolean)),
      ] as string[]
      const samplingTaskIds = [
        ...new Set(list.map((r) => r.sampling_task_id).filter(Boolean)),
      ] as string[]

      const [authorsRes, sitesRes, coreRes, sawingRes, samplingRes] = await Promise.all([
        authorIds.length
          ? supabase.from('profiles').select('id, full_name').in('id', authorIds)
          : Promise.resolve({ data: [] }),
        siteIds.length
          ? supabase.from('sites').select('id, name').in('id', siteIds)
          : Promise.resolve({ data: [] }),
        coreTaskIds.length
          ? supabase
              .from('core_description_tasks')
              .select('id, external_well_number, drilling_task_id, documentation_type')
              .in('id', coreTaskIds)
          : Promise.resolve({ data: [] }),
        sawingTaskIds.length
          ? supabase.from('core_sawing_tasks').select('id, drilling_task_id').in('id', sawingTaskIds)
          : Promise.resolve({ data: [] }),
        samplingTaskIds.length
          ? supabase
              .from('sampling_tasks')
              .select('id, external_well_number, drilling_task_id')
              .in('id', samplingTaskIds)
          : Promise.resolve({ data: [] }),
      ])

      // Прицепленные к скважине подзадания (керн/распиловка/опробование)
      // ссылаются на drilling_task_id ЧЕРЕЗ САМУ подзадачу, а не через
      // reports.drilling_task_id напрямую — drilling_tasks запрашиваем
      // ВТОРЫМ шагом, объединив прямые и вложенные id (см. отзыв 20.09.2026).
      const nestedDrillingTaskIds = [
        ...(coreRes.data ?? []).map((c) => c.drilling_task_id).filter(Boolean),
        ...(sawingRes.data ?? []).map((s) => s.drilling_task_id).filter(Boolean),
        ...(samplingRes.data ?? []).map((s) => s.drilling_task_id).filter(Boolean),
      ] as string[]
      const allDrillingTaskIds = [...new Set([...directDrillingTaskIds, ...nestedDrillingTaskIds])]

      const drillingRes = allDrillingTaskIds.length
        ? await supabase.from('drilling_tasks').select('id, well_number').in('id', allDrillingTaskIds)
        : { data: [] }

      const authorMap = new Map(
        (authorsRes.data ?? []).map((a) => [a.id, a.full_name]),
      )
      const siteMap = new Map((sitesRes.data ?? []).map((s) => [s.id, s.name]))
      const drillingMap = new Map(
        (drillingRes.data ?? []).map((d) => [d.id, d.well_number]),
      )
      const coreMap = new Map((coreRes.data ?? []).map((c) => [c.id, c]))
      const sawingMap = new Map((sawingRes.data ?? []).map((s) => [s.id, s]))
      const samplingMap = new Map((samplingRes.data ?? []).map((s) => [s.id, s]))

      const enriched: EnrichedReport[] = list.map((r) => {
        const authorName = authorMap.get(r.author_id) ?? '—'
        const siteName = siteMap.get(r.site_id) ?? '—'

        if (r.drilling_task_id) {
          return {
            ...r,
            authorName,
            siteName,
            wellKey: r.drilling_task_id,
            wellLabel: `Скважина №${drillingMap.get(r.drilling_task_id) ?? '?'}`,
            subtaskKey: 'drilling',
          }
        }
        if (r.core_description_task_id) {
          const c = coreMap.get(r.core_description_task_id)
          const wellKey = c?.drilling_task_id ?? `core-description:${r.core_description_task_id}`
          const wellLabel = c?.drilling_task_id
            ? `Скважина №${drillingMap.get(c.drilling_task_id) ?? '?'}`
            : `Скв. подрядчика №${c?.external_well_number ?? '?'}`
          return {
            ...r,
            authorName,
            siteName,
            wellKey,
            wellLabel,
            subtaskKey: c?.documentation_type === 'geotechnical' ? 'core-geotechnical' : 'core-geological',
          }
        }
        if (r.core_sawing_task_id) {
          const s = sawingMap.get(r.core_sawing_task_id)
          const wellKey = s?.drilling_task_id ?? `core-sawing:${r.core_sawing_task_id}`
          return {
            ...r,
            authorName,
            siteName,
            wellKey,
            wellLabel: `Скважина №${s?.drilling_task_id ? (drillingMap.get(s.drilling_task_id) ?? '?') : '?'}`,
            subtaskKey: 'sawing',
          }
        }
        const s = samplingMap.get(r.sampling_task_id ?? '')
        const wellKey = s?.drilling_task_id ?? `sampling:${r.sampling_task_id}`
        const wellLabel = s?.drilling_task_id
          ? `Скважина №${drillingMap.get(s.drilling_task_id) ?? '?'}`
          : `Скв. подрядчика №${s?.external_well_number ?? '?'}`
        return {
          ...r,
          authorName,
          siteName,
          wellKey,
          wellLabel,
          subtaskKey: 'sampling',
        }
      })

      setReports(enriched)
      setLoading(false)
    }

    load()
  }, [session, profile])

  if (authLoading) return <p>Загрузка…</p>
  if (!session) return <Navigate to="/login" replace />
  if (!isManagement(profile?.role)) {
    return <p>Согласование доступно только гендиру/техдиру.</p>
  }

  const siteOptions = [...new Map(reports.map((r) => [r.site_id, r.siteName])).entries()].sort((a, b) =>
    a[1].localeCompare(b[1]),
  )
  const wellOptions = [
    ...new Map(
      reports.filter((r) => !filterSiteId || r.site_id === filterSiteId).map((r) => [r.wellKey, r.wellLabel]),
    ).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1]))
  const foremanOptions = [...new Map(reports.map((r) => [r.author_id, r.authorName])).entries()].sort((a, b) =>
    a[1].localeCompare(b[1]),
  )

  const filtered = reports.filter(
    (r) =>
      (!filterSiteId || r.site_id === filterSiteId) &&
      (!filterWellKey || r.wellKey === filterWellKey) &&
      (!filterForemanId || r.author_id === filterForemanId),
  )
  const filtersActive = Boolean(filterSiteId || filterWellKey || filterForemanId)
  const grouped = groupReports(filtered)

  function resetFilters() {
    setFilterSiteId('')
    setFilterWellKey('')
    setFilterForemanId('')
  }

  function toggleSite(siteId: string) {
    setCollapsedSiteIds((prev) => {
      const next = new Set(prev)
      if (next.has(siteId)) next.delete(siteId)
      else next.add(siteId)
      return next
    })
  }

  return (
    <div>
      <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <ClipboardCheck size={26} className="text-muted" /> Сводки на согласовании
      </h1>

      {reports.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
          <select
            value={filterSiteId}
            onChange={(e) => {
              setFilterSiteId(e.target.value)
              setFilterWellKey('')
            }}
          >
            <option value="">Все участки</option>
            {siteOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <select value={filterWellKey} onChange={(e) => setFilterWellKey(e.target.value)}>
            <option value="">Все задания</option>
            {wellOptions.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <select value={filterForemanId} onChange={(e) => setFilterForemanId(e.target.value)}>
            <option value="">Все бригадиры</option>
            {foremanOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          {filtersActive && (
            <button
              type="button"
              className="btn-outline"
              onClick={resetFilters}
              style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13 }}
            >
              <X size={14} /> Сбросить
            </button>
          )}
        </div>
      )}

      {error && <p className="text-error">{error}</p>}

      {loading ? (
        <div style={{ display: 'grid', gap: 8 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: 56, borderRadius: 'var(--radius-md)' }} />
          ))}
        </div>
      ) : reports.length === 0 ? (
        <div className="card" style={{ padding: 28, textAlign: 'center', color: 'var(--color-text-muted)' }}>
          <PartyPopper size={28} style={{ marginBottom: 8, color: 'var(--color-success)' }} />
          <p style={{ margin: 0 }}>Пока нет сводок, ожидающих согласования.</p>
        </div>
      ) : grouped.length === 0 ? (
        <div className="card" style={{ padding: 28, textAlign: 'center', color: 'var(--color-text-muted)' }}>
          <p style={{ margin: '0 0 10px' }}>Нет сводок по выбранным фильтрам.</p>
          <button type="button" className="btn-outline" onClick={resetFilters}>
            Сбросить фильтры
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {grouped.map((site, i) => {
            const isOpen = !collapsedSiteIds.has(site.siteId)
            return (
              <motion.div
                key={site.siteId}
                className="card"
                {...riseIn(i, { duration: 0.25, cap: 10, step: 0.03 })}
                style={{ padding: 0, overflow: 'hidden' }}
              >
                <button
                  type="button"
                  onClick={() => toggleSite(site.siteId)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    padding: '13px 16px',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--color-text)',
                    textAlign: 'left',
                  }}
                >
                  {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 16, flex: 1 }}>
                    {site.siteName}
                  </span>
                  <span className="badge badge-primary num">{site.count}</span>
                </button>

                {isOpen && (
                  <div style={{ padding: '0 16px 16px', display: 'grid', gap: 16 }}>
                    {site.wells.map((well) => (
                      <div key={well.key}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            marginBottom: 8,
                            paddingBottom: 6,
                            borderBottom: '1px solid var(--color-border)',
                          }}
                        >
                          <span style={{ fontWeight: 600, fontSize: 14 }}>{well.label}</span>
                          <span className="badge badge-neutral num">{well.count}</span>
                        </div>
                        <div style={{ display: 'grid', gap: 10 }}>
                          {well.subtasks.map((subtask) => (
                            <div key={subtask.key}>
                              <div className="eyebrow" style={{ marginBottom: 5 }}>
                                {subtask.label}
                              </div>
                              <div style={{ display: 'grid', gap: 6 }}>
                                {subtask.reports.map((r) => (
                                  <Link
                                    key={r.id}
                                    to={`/reports/${r.id}/review`}
                                    className="card card-interactive"
                                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px' }}
                                  >
                                    <span style={{ flex: 1, minWidth: 0 }}>
                                      <span className="num" style={{ fontWeight: 600 }}>
                                        {r.report_date}
                                        {shiftLabel(r, subtask.key)}
                                      </span>
                                      <span className="text-muted" style={{ fontSize: 13 }}>
                                        {' — '}
                                        {r.authorName}
                                      </span>
                                    </span>
                                    <ChevronRight size={16} className="text-faint" />
                                  </Link>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}
