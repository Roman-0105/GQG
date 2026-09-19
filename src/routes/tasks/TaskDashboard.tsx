import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ChevronLeft,
  TrendingUp,
  TrendingDown,
  Minus,
  MessageSquare,
  Layers,
  Percent,
  HardHat,
  Pencil,
  Scissors,
  FlaskConical,
  Plus,
} from 'lucide-react'
import DerrickIcon from '../../components/icons/DerrickIcon'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { isManagement } from '../../types/roles'
import ProgressBar from '../../components/ProgressBar'
import WellboreProgress from '../../components/WellboreProgress'
import { TASK_TYPE_REPORT_COLUMN, TASK_TYPE_LABELS, type TaskType } from '../../types/taskType'
import type {
  CoreDescriptionTask,
  CoreSawingTask,
  DrillingTask,
  Profile,
  Report,
  SamplingTask,
} from '../../types/database'

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}
function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
function dayIndex(startIso: string, iso: string) {
  return Math.round(
    (new Date(`${iso}T00:00:00Z`).getTime() - new Date(`${startIso}T00:00:00Z`).getTime()) /
      86_400_000,
  )
}

interface ShiftCell {
  report: Report | null
}
interface DayRow {
  date: string
  shift1: ShiftCell
  shift2: ShiftCell
  noShift: ShiftCell // для заданий без деления на смены
}

// Единая "рабочая" сводка для смены: в норме на (дата, смена) ровно одна
// строка reports (правки идут через update того же id, см. ТЗ) — если
// исторически оказалось несколько, берём последнюю по updated_at.
function pickReport(reports: Report[]): Report | null {
  if (reports.length === 0) return null
  return reports.reduce((a, b) => (a.updated_at > b.updated_at ? a : b))
}

function paceLabel(diff: number, plan: number) {
  if (plan <= 0) return { text: '—', variant: 'neutral' as const }
  const pct = (diff / plan) * 100
  if (Math.abs(diff) < 0.25) return { text: 'по плану', variant: 'neutral' as const }
  if (diff > 0)
    return { text: `опережаем на ${diff.toFixed(1)} м (${pct.toFixed(0)}%)`, variant: 'success' as const }
  return { text: `отстаём на ${Math.abs(diff).toFixed(1)} м (${Math.abs(pct).toFixed(0)}%)`, variant: 'danger' as const }
}

const TASK_ICON: Record<TaskType, typeof Layers> = {
  drilling: DerrickIcon as unknown as typeof Layers,
  'core-description': Layers,
  'core-sawing': Scissors,
  sampling: FlaskConical,
}

// Дашборд задания — общий для всех 4 видов (бурение, описание керна,
// распиловка, опробование, см. миграцию 0007). Бурение и распиловка —
// метраж накапливается аддитивно посменно, у обоих есть накопительный
// факт в таблице по дням; план/темп/отклонение — только у бурения (у
// распиловки своего planned_daily_meters нет, не придумываем). Описание
// керна — интервалы (кумулятивные "от-до"), не аддитивные, показываются
// прогресс-барами без таблицы накопления. Опробование — без смен вообще,
// два независимых счётчика (отобрано / сдано в лабораторию).
export default function TaskDashboard() {
  const { taskType, taskId } = useParams<{ taskType: TaskType; taskId: string }>()
  const { session, profile, loading: authLoading } = useAuth()

  const [drillingTask, setDrillingTask] = useState<DrillingTask | null>(null)
  const [coreTask, setCoreTask] = useState<CoreDescriptionTask | null>(null)
  const [sawingTask, setSawingTask] = useState<CoreSawingTask | null>(null)
  const [samplingTask, setSamplingTask] = useState<SamplingTask | null>(null)
  const [linkedDrillingTask, setLinkedDrillingTask] = useState<DrillingTask | null>(null)
  const [foreman, setForeman] = useState<Profile | null>(null)
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [planDraft, setPlanDraft] = useState('')
  const [editingPlan, setEditingPlan] = useState(false)
  const [savingPlan, setSavingPlan] = useState(false)

  const isDrilling = taskType === 'drilling'
  const isCoreDescription = taskType === 'core-description'
  const isSawing = taskType === 'core-sawing'
  const isSampling = taskType === 'sampling'
  // Метраж накапливается посменно простым сложением (в отличие от
  // core-description, где хранятся интервалы "от-до").
  const isAdditiveMeters = isDrilling || isSawing

  useEffect(() => {
    if (!session || !taskId || !taskType) return
    const currentTaskType = taskType

    async function load() {
      setLoading(true)
      setError(null)

      let foremanId: string | null = null

      if (taskType === 'drilling') {
        const { data, error: taskError } = await supabase
          .from('drilling_tasks')
          .select('*')
          .eq('id', taskId)
          .single()
        if (taskError) setError(taskError.message)
        setDrillingTask(data)
        foremanId = data?.foreman_id ?? null
      } else if (taskType === 'core-description') {
        const { data, error: taskError } = await supabase
          .from('core_description_tasks')
          .select('*')
          .eq('id', taskId)
          .single()
        if (taskError) setError(taskError.message)
        setCoreTask(data)
        if (data?.drilling_task_id) {
          const { data: linked } = await supabase
            .from('drilling_tasks')
            .select('*')
            .eq('id', data.drilling_task_id)
            .single()
          setLinkedDrillingTask(linked)
          foremanId = linked?.foreman_id ?? null
        } else {
          foremanId = data?.assigned_party_chief_id ?? null
        }
      } else if (taskType === 'core-sawing') {
        const { data, error: taskError } = await supabase
          .from('core_sawing_tasks')
          .select('*')
          .eq('id', taskId)
          .single()
        if (taskError) setError(taskError.message)
        setSawingTask(data)
        if (data?.drilling_task_id) {
          const { data: linked } = await supabase
            .from('drilling_tasks')
            .select('*')
            .eq('id', data.drilling_task_id)
            .single()
          setLinkedDrillingTask(linked)
          foremanId = linked?.foreman_id ?? null
        }
      } else if (taskType === 'sampling') {
        const { data, error: taskError } = await supabase
          .from('sampling_tasks')
          .select('*')
          .eq('id', taskId)
          .single()
        if (taskError) setError(taskError.message)
        setSamplingTask(data)
        foremanId = data?.assigned_party_chief_id ?? null
        if (data?.drilling_task_id) {
          const { data: linked } = await supabase
            .from('drilling_tasks')
            .select('*')
            .eq('id', data.drilling_task_id)
            .single()
          setLinkedDrillingTask(linked)
        }
      }

      if (foremanId) {
        const { data: foremanProfile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', foremanId)
          .single()
        setForeman(foremanProfile)
      }

      const column = TASK_TYPE_REPORT_COLUMN[currentTaskType]
      const { data: reportRows, error: reportsError } = await supabase
        .from('reports')
        .select('*')
        .eq(column, taskId)
        .order('report_date', { ascending: true })
      if (reportsError) setError(reportsError.message)
      setReports(reportRows ?? [])

      setLoading(false)
    }

    load()
  }, [session, taskId, taskType])

  async function savePlan() {
    if (!drillingTask) return
    setSavingPlan(true)
    const value = planDraft ? Number(planDraft) : null
    const { error: updateError } = await supabase
      .from('drilling_tasks')
      .update({ planned_daily_meters: value })
      .eq('id', drillingTask.id)
    setSavingPlan(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    setDrillingTask({ ...drillingTask, planned_daily_meters: value })
    setEditingPlan(false)
  }

  if (authLoading) return <p>Загрузка…</p>
  if (!session) return <Navigate to="/login" replace />
  if (!taskId || !taskType) return <p>Не указано задание.</p>
  if (loading) return <p>Загрузка…</p>
  if (error) return <p className="text-error">{error}</p>

  const wellLabel = isDrilling
    ? `Скважина №${drillingTask?.well_number ?? '…'}`
    : isCoreDescription
      ? coreTask?.drilling_task_id
        ? `Своя скважина №${linkedDrillingTask?.well_number ?? '…'}`
        : `Скважина подрядчика №${coreTask?.external_well_number ?? '…'}`
      : isSawing
        ? `Скважина №${linkedDrillingTask?.well_number ?? '…'}`
        : samplingTask?.drilling_task_id
          ? `Своя скважина №${linkedDrillingTask?.well_number ?? '…'}`
          : `Скважина подрядчика №${samplingTask?.external_well_number ?? '…'}`

  const description =
    drillingTask?.description ?? coreTask?.description ?? sawingTask?.description ?? samplingTask?.description
  const siteId = drillingTask?.site_id ?? coreTask?.site_id ?? sawingTask?.site_id ?? samplingTask?.site_id

  const shiftsApply = isDrilling || isSawing ? true : isCoreDescription ? (coreTask?.shift_enabled ?? true) : false

  // План "на всю задачу": для бурения — своя проектная глубина; для
  // описания керна и распиловки — глубина связанной (своей или подрядчика)
  // скважины, так как обе идут вдоль того же ствола (см. дорожную карту).
  // У опробования плана нет — считать процент не от чего.
  const projectedDepth = isDrilling
    ? (drillingTask?.projected_depth ?? null)
    : isCoreDescription
      ? ((coreTask?.drilling_task_id ? linkedDrillingTask?.projected_depth : coreTask?.external_projected_depth) ?? null)
      : isSawing
        ? (linkedDrillingTask?.projected_depth ?? null)
        : null

  const plannedDailyMeters = isDrilling ? (drillingTask?.planned_daily_meters ?? null) : null

  const approvedReports = reports.filter((r) => r.approval_status === 'approved')
  const submittedReports = reports.filter((r) => r.approval_status === 'submitted')

  function additiveMetric(r: Report) {
    return isDrilling ? r.drilling_meters : isSawing ? r.sawn_meters : null
  }

  // ---- сводные прогресс-бары ----
  const approvedAdditiveMeters = approvedReports.reduce((s, r) => s + (additiveMetric(r) ?? 0), 0)
  const pendingAdditiveMeters = submittedReports.reduce((s, r) => s + (additiveMetric(r) ?? 0), 0)

  const approvedCoreTo = approvedReports.reduce(
    (max, r) => Math.max(max, r.core_description_interval_to ?? 0),
    0,
  )
  const approvedPhotoTo = approvedReports.reduce(
    (max, r) => Math.max(max, r.photofixation_interval_to ?? 0),
    0,
  )

  const approvedSamplesTaken = approvedReports.reduce((s, r) => s + (r.samples_taken ?? 0), 0)
  const approvedSamplesSubmitted = approvedReports.reduce((s, r) => s + (r.samples_submitted ?? 0), 0)

  // ---- дневная таблица — показываем для всех видов задания; у описания
  //      керна нет аддитивных накопительных колонок (интервалы "от-до",
  //      не сумма), но сама таблица по сменам всё равно полезна ----
  const startDate =
    (isDrilling ? drillingTask?.start_date : undefined) ?? reports[0]?.report_date ?? todayIso()
  const endDate = reports.length > 0 ? reports[reports.length - 1].report_date : todayIso()
  const lastDate = endDate > todayIso() ? endDate : todayIso()
  const totalDays = Math.max(0, dayIndex(startDate, lastDate))

  const byKey = new Map<string, Report[]>()
  for (const r of reports) {
    const key = `${r.report_date}|${r.shift_number ?? '_'}`
    byKey.set(key, [...(byKey.get(key) ?? []), r])
  }

  const dayRows: DayRow[] = []
  for (let i = 0; i <= totalDays; i++) {
    const date = addDays(startDate, i)
    dayRows.push({
      date,
      shift1: { report: pickReport(byKey.get(`${date}|1`) ?? []) },
      shift2: { report: pickReport(byKey.get(`${date}|2`) ?? []) },
      noShift: { report: pickReport(byKey.get(`${date}|_`) ?? []) },
    })
  }

  interface CellInfo {
    meters: number | null
    hours: number | null
    status: Report['approval_status'] | null
    notes: string | null
    samplesTaken: number | null
    samplesSubmitted: number | null
  }

  function cellValue(cell: ShiftCell): CellInfo {
    if (!cell.report) {
      return { meters: null, hours: null, status: null, notes: null, samplesTaken: null, samplesSubmitted: null }
    }
    const r = cell.report
    const meters = isAdditiveMeters
      ? additiveMetric(r)
      : isCoreDescription && r.core_description_interval_to != null && r.core_description_interval_from != null
        ? r.core_description_interval_to - r.core_description_interval_from
        : null
    return {
      meters,
      hours: r.hours_worked,
      status: r.approval_status,
      notes: r.shift_notes,
      samplesTaken: r.samples_taken,
      samplesSubmitted: r.samples_submitted,
    }
  }

  let runningApproved = 0
  const rowsRendered = dayRows.map((row) => {
    const cells = shiftsApply ? [cellValue(row.shift1), cellValue(row.shift2)] : [cellValue(row.noShift)]

    const dayApproved = isAdditiveMeters
      ? cells.reduce((s, c) => s + (c.status === 'approved' ? (c.meters ?? 0) : 0), 0)
      : 0
    runningApproved += dayApproved

    const daySamplesTaken = isSampling
      ? cells.reduce((s, c) => s + (c.status === 'approved' ? (c.samplesTaken ?? 0) : 0), 0)
      : 0

    const plannedCumulative =
      isDrilling && plannedDailyMeters != null && projectedDepth != null
        ? Math.min(plannedDailyMeters * (dayIndex(startDate, row.date) + 1), projectedDepth)
        : null

    return { row, cells, dayApproved, runningApproved, daySamplesTaken, plannedCumulative }
  })

  const latestPlanned = rowsRendered[rowsRendered.length - 1]?.plannedCumulative ?? null
  const pace = isDrilling && latestPlanned != null ? paceLabel(approvedAdditiveMeters - latestPlanned, latestPlanned) : null
  const overallPercent = isAdditiveMeters && projectedDepth ? (approvedAdditiveMeters / projectedDepth) * 100 : null
  const rowsForDisplay = [...rowsRendered].reverse()

  const PaceIcon = pace?.variant === 'success' ? TrendingUp : pace?.variant === 'danger' ? TrendingDown : Minus
  const paceColors: Record<'success' | 'danger' | 'neutral', { bg: string; fg: string }> = {
    success: { bg: 'var(--color-success-soft)', fg: 'var(--color-success)' },
    danger: { bg: 'var(--color-danger-soft)', fg: 'var(--color-danger)' },
    neutral: { bg: 'var(--color-surface-muted)', fg: 'var(--color-text-muted)' },
  }

  function shiftColumnLabel(index: 0 | 1) {
    if (isSawing) return index === 0 ? 'День' : 'Ночь'
    return `Смена ${index + 1}`
  }

  const TaskIcon = TASK_ICON[taskType]

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 13.5, marginBottom: 14, flexWrap: 'wrap' }}>
        {siteId && (
          <Link to={`/sites/${siteId}`} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <ChevronLeft size={15} /> Участок
          </Link>
        )}
        <Link to={`/tasks/${taskType}/${taskId}/reports`}>Все сводки →</Link>
        {profile?.role === 'party_chief' && (
          <Link to={`/tasks/${taskType}/${taskId}/reports/new`} style={{ marginLeft: 'auto' }}>
            <button type="button" style={{ fontSize: 12.5, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 5 }}>
              <Plus size={13} /> Сводка
            </button>
          </Link>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <span
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            background: isDrilling ? 'var(--color-primary-soft)' : 'var(--color-accent-soft)',
            color: isDrilling ? 'var(--color-primary)' : 'var(--color-accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <TaskIcon size={19} />
        </span>
        <h1 style={{ margin: 0 }}>{wellLabel}</h1>
      </div>
      <p className="eyebrow" style={{ marginBottom: 18, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {TASK_TYPE_LABELS[taskType]}
        {isCoreDescription && coreTask && (
          <span className="badge badge-neutral">
            {coreTask.documentation_type === 'geological' ? 'геологическая' : 'геотехническая'}
          </span>
        )}
        {foreman && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--color-text-muted)' }}>
            <HardHat size={13} /> {foreman.full_name}
          </span>
        )}
      </p>

      {description && (
        <p className="card" style={{ padding: 12, fontSize: 14, marginBottom: 20 }}>
          {description}
        </p>
      )}

      {isDrilling ? (
        <motion.div
          className="card"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 260px) 1fr',
            gap: 24,
            padding: 24,
            marginBottom: 24,
            alignItems: 'center',
          }}
        >
          <WellboreProgress
            projectedDepth={projectedDepth}
            approvedDepth={approvedAdditiveMeters}
            pendingDepth={pendingAdditiveMeters}
          />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
              {overallPercent != null && (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 14px',
                    borderRadius: 'var(--radius-full)',
                    fontWeight: 700,
                    fontSize: 14,
                    background: 'var(--color-primary-soft)',
                    color: 'var(--color-primary)',
                  }}
                >
                  <Percent size={15} />
                  {overallPercent.toFixed(0)}% плана пробурено
                </div>
              )}
              {pace && (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 14px',
                    borderRadius: 'var(--radius-full)',
                    fontWeight: 700,
                    fontSize: 14,
                    background: paceColors[pace.variant].bg,
                    color: paceColors[pace.variant].fg,
                  }}
                >
                  <PaceIcon size={17} />
                  {pace.text}
                </div>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 14, marginBottom: 14 }}>
              <div>
                <div className="eyebrow" style={{ marginBottom: 3 }}>
                  Факт
                </div>
                <div className="num" style={{ fontSize: 22, fontWeight: 700 }}>
                  {approvedAdditiveMeters} м
                </div>
              </div>
              <div>
                <div className="eyebrow" style={{ marginBottom: 3 }}>
                  План
                </div>
                <div className="num" style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-muted)' }}>
                  {projectedDepth ?? '—'} м
                </div>
              </div>
              {pendingAdditiveMeters > 0 && (
                <div>
                  <div className="eyebrow" style={{ marginBottom: 3 }}>
                    На согласовании
                  </div>
                  <div className="num" style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-accent)' }}>
                    +{pendingAdditiveMeters} м
                  </div>
                </div>
              )}
            </div>

            {drillingTask && isManagement(profile?.role) && (
              <div style={{ fontSize: 13 }}>
                {editingPlan ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      type="number"
                      step="any"
                      autoFocus
                      value={planDraft}
                      onChange={(e) => setPlanDraft(e.target.value)}
                      placeholder="м/сутки"
                      style={{ width: 100, padding: '6px 8px' }}
                    />
                    <button type="button" onClick={savePlan} disabled={savingPlan} style={{ padding: '6px 10px', fontSize: 12.5 }}>
                      {savingPlan ? '…' : 'Сохранить'}
                    </button>
                    <button
                      type="button"
                      className="btn-outline"
                      onClick={() => setEditingPlan(false)}
                      style={{ padding: '6px 10px', fontSize: 12.5 }}
                    >
                      Отмена
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={() => {
                      setPlanDraft(drillingTask.planned_daily_meters != null ? String(drillingTask.planned_daily_meters) : '')
                      setEditingPlan(true)
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, padding: '6px 10px' }}
                  >
                    <Pencil size={12} />
                    {plannedDailyMeters != null ? `План: ${plannedDailyMeters} м/сутки` : 'Задать план бурения'}
                  </button>
                )}
              </div>
            )}
          </div>
        </motion.div>
      ) : isCoreDescription ? (
        <div className="card" style={{ padding: 20, marginBottom: 24 }}>
          <ProgressBar label="Керн описан" approved={approvedCoreTo} plan={projectedDepth} />
          <ProgressBar label="Фотофиксация" approved={approvedPhotoTo} plan={projectedDepth} />
        </div>
      ) : isSawing ? (
        <div className="card" style={{ padding: 20, marginBottom: 24 }}>
          {overallPercent != null && (
            <p style={{ margin: '0 0 10px' }}>
              <span className="badge badge-primary num">{overallPercent.toFixed(0)}% плана распилено</span>
            </p>
          )}
          <ProgressBar
            label="Распилено"
            approved={approvedAdditiveMeters}
            pending={pendingAdditiveMeters}
            plan={projectedDepth}
          />
        </div>
      ) : (
        <div className="card" style={{ padding: 20, marginBottom: 24, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16 }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 3 }}>
              Проб отобрано
            </div>
            <div className="num" style={{ fontSize: 26, fontWeight: 700 }}>
              {approvedSamplesTaken}
            </div>
          </div>
          <div>
            <div className="eyebrow" style={{ marginBottom: 3 }}>
              Сдано в лабораторию
            </div>
            <div className="num" style={{ fontSize: 26, fontWeight: 700, color: 'var(--color-text-muted)' }}>
              {approvedSamplesSubmitted}
            </div>
          </div>
        </div>
      )}

      <>
          <h2>По дням {shiftsApply ? `(${shiftColumnLabel(0).toLowerCase()} / ${shiftColumnLabel(1).toLowerCase()})` : ''}</h2>
          {isDrilling && plannedDailyMeters == null && (
            <p className="text-muted" style={{ fontSize: 13, marginTop: -8, marginBottom: 12 }}>
              План бурения не задан — колонки «накопл. план» и «отклонение» пустые.
              {isManagement(profile?.role) ? ' Задайте его в блоке выше.' : ' Уточните у техдира.'}
            </p>
          )}
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, minWidth: 480 }}>
                <thead>
                  <tr style={{ textAlign: 'left', background: 'var(--color-surface-muted)' }}>
                    <th style={{ padding: '10px 12px', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--color-text-faint)' }}>Дата</th>
                    {shiftsApply ? (
                      <>
                        <th style={{ padding: '10px 12px', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--color-text-faint)' }}>{shiftColumnLabel(0)}</th>
                        <th style={{ padding: '10px 12px', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--color-text-faint)' }}>{shiftColumnLabel(1)}</th>
                      </>
                    ) : (
                      <th style={{ padding: '10px 12px', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--color-text-faint)' }}>Сводка</th>
                    )}
                    {isAdditiveMeters && (
                      <>
                        <th style={{ padding: '10px 12px', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--color-text-faint)' }}>Итого/день</th>
                        <th title="Сумма подтверждённых метров с начала задания по эту дату включительно" style={{ padding: '10px 12px', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--color-text-faint)' }}>Накопл. факт</th>
                      </>
                    )}
                    {isDrilling && (
                      <>
                        <th title="Сколько должно быть пробурено к этой дате при темпе «план, м/сутки» из настроек задания" style={{ padding: '10px 12px', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--color-text-faint)' }}>Накопл. план</th>
                        <th title="Накопл. факт минус накопл. план: плюс — опережаем, минус — отстаём" style={{ padding: '10px 12px', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--color-text-faint)' }}>Отклонение</th>
                      </>
                    )}
                    {isSampling && (
                      <th style={{ padding: '10px 12px', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--color-text-faint)' }}>Проб с начала</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rowsForDisplay.map(({ row, cells, dayApproved, runningApproved: cumApproved, daySamplesTaken, plannedCumulative }, rowIndex) => {
                    const dayDiff = plannedCumulative != null ? cumApproved - plannedCumulative : null
                    const isToday = row.date === todayIso()
                    return (
                      <tr
                        key={row.date}
                        style={{
                          borderTop: '1px solid var(--color-border)',
                          background: isToday ? 'var(--color-primary-soft)' : rowIndex % 2 === 1 ? 'var(--color-surface-muted)' : 'transparent',
                        }}
                      >
                        <td className="num" style={{ padding: '9px 12px', whiteSpace: 'nowrap', fontWeight: isToday ? 700 : 400 }}>
                          {row.date}
                        </td>
                        {cells.map((c, i) => (
                          <td key={i} style={{ padding: '9px 12px' }}>
                            {c.meters == null && c.hours == null && c.samplesTaken == null ? (
                              <span className="text-faint">—</span>
                            ) : (
                              <>
                                {c.meters != null && <span className="num">{c.meters} м</span>}
                                {isSampling && c.samplesTaken != null && (
                                  <span className="num">
                                    {c.samplesTaken} проб
                                    {c.samplesSubmitted != null && ` (сдано: ${c.samplesSubmitted})`}
                                  </span>
                                )}
                                {c.hours != null && <span className="text-muted num"> · {c.hours} ч</span>}
                                {c.status && c.status !== 'approved' && (
                                  <span className={`badge badge-${c.status === 'submitted' ? 'primary' : c.status === 'rejected' ? 'danger' : 'neutral'}`} style={{ marginLeft: 6 }}>
                                    {c.status === 'submitted' ? 'на согл.' : c.status === 'rejected' ? 'отклонено' : 'черновик'}
                                  </span>
                                )}
                              </>
                            )}
                          </td>
                        ))}
                        {isAdditiveMeters && (
                          <>
                            <td className="num" style={{ padding: '9px 12px', fontWeight: 600 }}>{dayApproved} м</td>
                            <td className="num" style={{ padding: '9px 12px' }}>{cumApproved} м</td>
                          </>
                        )}
                        {isDrilling && (
                          <>
                            <td className="num" style={{ padding: '9px 12px' }}>{plannedCumulative != null ? `${plannedCumulative.toFixed(1)} м` : '—'}</td>
                            <td className="num" style={{ padding: '9px 12px' }}>
                              {dayDiff != null ? (
                                <span className={dayDiff >= 0 ? 'text-success' : 'text-error'}>
                                  {dayDiff >= 0 ? '+' : ''}
                                  {dayDiff.toFixed(1)} м
                                </span>
                              ) : (
                                '—'
                              )}
                            </td>
                          </>
                        )}
                        {isSampling && (
                          <td className="num" style={{ padding: '9px 12px', fontWeight: 600 }}>{daySamplesTaken}</td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
      </>

      {rowsRendered.some(({ cells }) => cells.some((c) => c.notes)) && (
        <>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <MessageSquare size={18} className="text-muted" /> Комментарии бригадира по сменам
          </h2>
          <div className="card" style={{ padding: 4 }}>
            <ul>
              {rowsRendered.flatMap(({ row, cells }) =>
                cells
                  .map((c, i) => ({ c, i }))
                  .filter(({ c }) => c.notes)
                  .map(({ c, i }) => (
                    <li key={`${row.date}-${i}`} style={{ padding: '10px 12px' }}>
                      <b className="num">{row.date}</b>
                      {shiftsApply ? `, ${shiftColumnLabel(i as 0 | 1).toLowerCase()}` : ''} — {c.notes}
                    </li>
                  )),
              )}
            </ul>
          </div>
        </>
      )}
    </div>
  )
}
