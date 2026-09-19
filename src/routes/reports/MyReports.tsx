import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X, ChevronLeft, ChevronRight, Layers, Scissors, FlaskConical } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import DerrickIcon from '../../components/icons/DerrickIcon'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { ApprovalBadge } from '../../components/StatusBadge'
import { TASK_TYPE_LABELS, type TaskType } from '../../types/taskType'
import type {
  CoreDescriptionTask,
  CoreSawingTask,
  DrillingTask,
  Report,
  SamplingTask,
} from '../../types/database'

const PAGE_SIZE = 3

interface ReportCategory {
  key: string
  taskType: TaskType
  taskId: string
  icon: LucideIcon
  label: string
  sublabel: string
  reports: Report[]
}

function shiftLabel(taskType: TaskType, shiftNumber: number | null) {
  if (!shiftNumber) return ''
  if (taskType === 'core-sawing') return shiftNumber === 1 ? ', день' : ', ночь'
  return `, смена ${shiftNumber}`
}

function sortReports(rows: Report[]) {
  return [...rows].sort((a, b) => {
    if (a.report_date !== b.report_date) return b.report_date < a.report_date ? -1 : 1
    return (b.shift_number ?? 0) - (a.shift_number ?? 0)
  })
}

// Личная история сводок бригадира сразу по ВСЕМ его заданиям (все скважины,
// все виды работ) — см. отзыв 19.09.2026: список "Все сводки" внутри
// ОДНОГО задания физически не может показать чужие категории, а бригадиру
// был нужен именно сквозной обзор. Категории — карточки вида "Бурение,
// скважина №21"; клик открывает компактное окно с постраничным просмотром
// (по PAGE_SIZE сводок за раз), а не сразу полный список.
export default function MyReports() {
  const { session, profile, loading: authLoading } = useAuth()

  const [drillingTasks, setDrillingTasks] = useState<DrillingTask[]>([])
  const [coreTasks, setCoreTasks] = useState<CoreDescriptionTask[]>([])
  const [sawingTasks, setSawingTasks] = useState<CoreSawingTask[]>([])
  const [samplingTasks, setSamplingTasks] = useState<SamplingTask[]>([])
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)

  const [openCategoryKey, setOpenCategoryKey] = useState<string | null>(null)
  const [page, setPage] = useState(0)

  useEffect(() => {
    if (!session || !profile) return
    const currentProfileId = profile.id

    async function load() {
      setLoading(true)
      // RLS уже отдаёт drilling_tasks/core_description_tasks/... только
      // "свои" party_chief'у (foreman_id / assigned_party_chief_id =
      // auth.uid()) — отдельный фильтр по бригадиру тут не нужен.
      const [drillingRes, coreRes, sawingRes, samplingRes, reportsRes] = await Promise.all([
        supabase.from('drilling_tasks').select('*'),
        supabase.from('core_description_tasks').select('*'),
        supabase.from('core_sawing_tasks').select('*'),
        supabase.from('sampling_tasks').select('*'),
        supabase.from('reports').select('*').eq('author_id', currentProfileId),
      ])
      setDrillingTasks(drillingRes.data ?? [])
      setCoreTasks(coreRes.data ?? [])
      setSawingTasks(sawingRes.data ?? [])
      setSamplingTasks(samplingRes.data ?? [])
      setReports(reportsRes.data ?? [])
      setLoading(false)
    }

    load()
  }, [session, profile])

  if (authLoading) return <p>Загрузка…</p>
  if (!session) return <Navigate to="/login" replace />
  if (profile && profile.role !== 'party_chief') {
    return <p>Этот экран — личная история сводок начальника буровой партии.</p>
  }

  const categories: ReportCategory[] = []

  for (const t of drillingTasks) {
    const rows = sortReports(reports.filter((r) => r.drilling_task_id === t.id))
    if (rows.length === 0) continue
    categories.push({
      key: `drilling:${t.id}`,
      taskType: 'drilling',
      taskId: t.id,
      icon: DerrickIcon as unknown as LucideIcon,
      label: `Скважина №${t.well_number}`,
      sublabel: TASK_TYPE_LABELS.drilling,
      reports: rows,
    })
  }

  for (const t of coreTasks) {
    const rows = sortReports(reports.filter((r) => r.core_description_task_id === t.id))
    if (rows.length === 0) continue
    const linkedWell = drillingTasks.find((d) => d.id === t.drilling_task_id)
    const wellLabel = t.drilling_task_id
      ? `Своя скважина №${linkedWell?.well_number ?? '…'}`
      : `Скважина подрядчика №${t.external_well_number}`
    categories.push({
      key: `core-description:${t.id}`,
      taskType: 'core-description',
      taskId: t.id,
      icon: Layers,
      label: wellLabel,
      sublabel: `${TASK_TYPE_LABELS['core-description']} · ${t.documentation_type === 'geological' ? 'геологическая' : 'геотехническая'}`,
      reports: rows,
    })
  }

  for (const t of sawingTasks) {
    const rows = sortReports(reports.filter((r) => r.core_sawing_task_id === t.id))
    if (rows.length === 0) continue
    const linkedWell = drillingTasks.find((d) => d.id === t.drilling_task_id)
    categories.push({
      key: `core-sawing:${t.id}`,
      taskType: 'core-sawing',
      taskId: t.id,
      icon: Scissors,
      label: `Скважина №${linkedWell?.well_number ?? '…'}`,
      sublabel: TASK_TYPE_LABELS['core-sawing'],
      reports: rows,
    })
  }

  for (const t of samplingTasks) {
    const rows = sortReports(reports.filter((r) => r.sampling_task_id === t.id))
    if (rows.length === 0) continue
    const linkedWell = drillingTasks.find((d) => d.id === t.drilling_task_id)
    const wellLabel = t.drilling_task_id
      ? `Своя скважина №${linkedWell?.well_number ?? '…'}`
      : `Скважина подрядчика №${t.external_well_number}`
    categories.push({
      key: `sampling:${t.id}`,
      taskType: 'sampling',
      taskId: t.id,
      icon: FlaskConical,
      label: wellLabel,
      sublabel: TASK_TYPE_LABELS.sampling,
      reports: rows,
    })
  }

  categories.sort((a, b) => (b.reports[0]?.report_date ?? '').localeCompare(a.reports[0]?.report_date ?? ''))

  const openCategory = categories.find((c) => c.key === openCategoryKey) ?? null
  const totalPages = openCategory ? Math.max(1, Math.ceil(openCategory.reports.length / PAGE_SIZE)) : 1
  const pageReports = openCategory
    ? openCategory.reports.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)
    : []

  function openCategoryModal(key: string) {
    setOpenCategoryKey(key)
    setPage(0)
  }

  return (
    <div>
      <h1>Мои сводки</h1>
      <p className="text-muted" style={{ marginTop: -12, marginBottom: 22 }}>
        Вся ваша история сводок — по всем скважинам и видам работ. Откройте категорию, чтобы пролистать сводки.
      </p>

      {loading ? (
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: 88, borderRadius: 'var(--radius-md)' }} />
          ))}
        </div>
      ) : categories.length === 0 ? (
        <p className="text-muted">Вы ещё не отправляли сводок.</p>
      ) : (
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
          {categories.map((c, i) => {
            const submitted = c.reports.filter((r) => r.approval_status === 'submitted').length
            const rejected = c.reports.filter((r) => r.approval_status === 'rejected').length
            const Icon = c.icon
            return (
              <motion.button
                key={c.key}
                type="button"
                className="card card-interactive"
                onClick={() => openCategoryModal(c.key)}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: Math.min(i, 10) * 0.03, ease: [0.16, 1, 0.3, 1] }}
                style={{ textAlign: 'left', padding: 14, display: 'block', width: '100%' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 9,
                      background: 'var(--color-accent-soft)',
                      color: 'var(--color-accent)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Icon size={16} />
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span
                      style={{
                        display: 'block',
                        fontFamily: 'var(--font-display)',
                        fontWeight: 600,
                        fontSize: 15,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {c.label}
                    </span>
                    <span className="text-muted" style={{ fontSize: 12.5 }}>
                      {c.sublabel}
                    </span>
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span className="badge badge-neutral num">{c.reports.length} сводок</span>
                  {submitted > 0 && <span className="badge badge-primary num">{submitted} на согл.</span>}
                  {rejected > 0 && <span className="badge badge-danger num">{rejected} откл.</span>}
                </div>
              </motion.button>
            )
          })}
        </div>
      )}

      <AnimatePresence>
        {openCategory && (
          <motion.div
            className="modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setOpenCategoryKey(null)}
          >
            <motion.div
              className="modal-panel"
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                <div>
                  <h2 style={{ margin: 0 }}>{openCategory.label}</h2>
                  <p className="text-muted" style={{ margin: '2px 0 0', fontSize: 13 }}>
                    {openCategory.sublabel}
                  </p>
                </div>
                <button
                  type="button"
                  className="icon-btn-round"
                  onClick={() => setOpenCategoryKey(null)}
                  title="Закрыть"
                >
                  <X size={18} />
                </button>
              </div>

              <div style={{ display: 'grid', gap: 8, margin: '14px 0' }}>
                {pageReports.map((r) => (
                  <Link
                    key={r.id}
                    to={`/tasks/${openCategory.taskType}/${openCategory.taskId}/reports/${r.id}`}
                    className="card card-interactive"
                    style={{ display: 'block', padding: '12px 14px' }}
                    onClick={() => setOpenCategoryKey(null)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span className="num" style={{ fontWeight: 700 }}>
                        {r.report_date}
                        {shiftLabel(openCategory.taskType, r.shift_number)}
                      </span>
                      <ApprovalBadge status={r.approval_status} />
                    </div>
                    {r.approval_status === 'rejected' && r.review_comment && (
                      <p className="text-error" style={{ fontSize: 13, margin: '6px 0 0' }}>
                        Причина: {r.review_comment}
                      </p>
                    )}
                    {r.shift_notes && (
                      <p
                        className="text-muted"
                        style={{
                          fontSize: 13,
                          margin: '6px 0 0',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {r.shift_notes}
                      </p>
                    )}
                  </Link>
                ))}
              </div>

              {totalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <button
                    type="button"
                    className="btn-outline"
                    disabled={page === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5, padding: '6px 10px' }}
                  >
                    <ChevronLeft size={14} /> Назад
                  </button>
                  <span className="text-muted num" style={{ fontSize: 12.5 }}>
                    {page + 1} / {totalPages}
                  </span>
                  <button
                    type="button"
                    className="btn-outline"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5, padding: '6px 10px' }}
                  >
                    Вперёд <ChevronRight size={14} />
                  </button>
                </div>
              )}

              <Link
                to={`/tasks/${openCategory.taskType}/${openCategory.taskId}/reports`}
                onClick={() => setOpenCategoryKey(null)}
                style={{ display: 'block', textAlign: 'center', marginTop: 14, fontSize: 13 }}
              >
                Открыть полный список →
              </Link>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
