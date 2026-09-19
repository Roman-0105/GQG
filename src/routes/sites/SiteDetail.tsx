import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronLeft, Layers, Plus, ChevronRight, Lock, Unlock, Scissors, FlaskConical, Pencil, FileText } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { isManagement } from '../../types/roles'
import { TaskStatusBadge } from '../../components/StatusBadge'
import ProgressBar from '../../components/ProgressBar'
import DerrickIcon from '../../components/icons/DerrickIcon'
import type {
  CoreDescriptionTask,
  CoreSawingTask,
  DrillingTask,
  Report,
  SamplingTask,
  Site,
} from '../../types/database'

// Прогресс по бурению = сумма подтверждённых метров; по керну/фото —
// максимум "до" среди подтверждённых сводок (интервалы кумулятивные, не
// складываются, см. дорожную карту).
function drillingProgress(taskId: string, reports: Report[]) {
  return reports
    .filter((r) => r.drilling_task_id === taskId && r.approval_status === 'approved')
    .reduce((s, r) => s + (r.drilling_meters ?? 0), 0)
}
function coreProgress(taskId: string, reports: Report[]) {
  const rows = reports.filter(
    (r) => r.core_description_task_id === taskId && r.approval_status === 'approved',
  )
  return {
    core: rows.reduce((m, r) => Math.max(m, r.core_description_interval_to ?? 0), 0),
    photo: rows.reduce((m, r) => Math.max(m, r.photofixation_interval_to ?? 0), 0),
  }
}

function sawingProgress(taskId: string, reports: Report[]) {
  return reports
    .filter((r) => r.core_sawing_task_id === taskId && r.approval_status === 'approved')
    .reduce((s, r) => s + (r.sawn_meters ?? 0), 0)
}
function samplingProgress(taskId: string, reports: Report[]) {
  const rows = reports.filter((r) => r.sampling_task_id === taskId && r.approval_status === 'approved')
  return {
    taken: rows.reduce((s, r) => s + (r.samples_taken ?? 0), 0),
    submitted: rows.reduce((s, r) => s + (r.samples_submitted ?? 0), 0),
  }
}

// Сколько сводок задания сейчас "требуют внимания" — на согласовании или
// отклонены. Бригадиру и техдиру так видно, не заходя в каждое задание,
// всё ли заполнено (см. отзыв 17.09.2026).
type TaskFkField = 'drilling_task_id' | 'core_description_task_id' | 'core_sawing_task_id' | 'sampling_task_id'
function attentionCounts(taskId: string, taskField: TaskFkField, reports: Report[]) {
  const rows = reports.filter((r) => r[taskField] === taskId)
  return {
    submitted: rows.filter((r) => r.approval_status === 'submitted').length,
    rejected: rows.filter((r) => r.approval_status === 'rejected').length,
  }
}

// Керн/распиловка/опробование, прицепленные к конкретной скважине —
// рендерятся вложенными строками внутри её карточки (см. отзыв 19.09.2026),
// а не отдельными карточками верхнего уровня. Разные виды несут разные
// метрики, отсюда объединение через union по наличию поля.
interface AttachedRowBase {
  key: string
  taskType: 'core-description' | 'core-sawing' | 'sampling'
  taskId: string
  icon: LucideIcon
  label: string
  attention: { submitted: number; rejected: number }
}
type AttachedRow =
  | (AttachedRowBase & { progress: { core: number; photo: number }; plan: number | null })
  | (AttachedRowBase & { sawn: number; plan: number | null })
  | (AttachedRowBase & { samples: { taken: number; submitted: number } })

function AttentionBadges({ submitted, rejected }: { submitted: number; rejected: number }) {
  if (submitted === 0 && rejected === 0) return null
  return (
    <span style={{ display: 'inline-flex', gap: 5 }}>
      {submitted > 0 && (
        <span className="badge badge-primary num" title="Сводок на согласовании">
          {submitted} на согл.
        </span>
      )}
      {rejected > 0 && (
        <span className="badge badge-danger num" title="Отклонённых сводок">
          {rejected} откл.
        </span>
      )}
    </span>
  )
}

export default function SiteDetail() {
  const { siteId } = useParams<{ siteId: string }>()
  const { session, profile, loading: authLoading } = useAuth()

  const [site, setSite] = useState<Site | null>(null)
  const [drillingTasks, setDrillingTasks] = useState<DrillingTask[]>([])
  const [coreTasks, setCoreTasks] = useState<CoreDescriptionTask[]>([])
  const [sawingTasks, setSawingTasks] = useState<CoreSawingTask[]>([])
  const [samplingTasks, setSamplingTasks] = useState<SamplingTask[]>([])
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [togglingStatus, setTogglingStatus] = useState(false)

  useEffect(() => {
    if (!session || !siteId) return

    async function load() {
      setLoading(true)
      const [siteRes, drillingRes, coreRes, sawingRes, samplingRes] = await Promise.all([
        supabase.from('sites').select('*').eq('id', siteId).single(),
        supabase
          .from('drilling_tasks')
          .select('*')
          .eq('site_id', siteId)
          .order('created_at', { ascending: false }),
        supabase
          .from('core_description_tasks')
          .select('*')
          .eq('site_id', siteId)
          .order('created_at', { ascending: false }),
        supabase
          .from('core_sawing_tasks')
          .select('*')
          .eq('site_id', siteId)
          .order('created_at', { ascending: false }),
        supabase
          .from('sampling_tasks')
          .select('*')
          .eq('site_id', siteId)
          .order('created_at', { ascending: false }),
      ])

      if (siteRes.error) setError(siteRes.error.message)
      else setSite(siteRes.data)

      if (drillingRes.error) setError(drillingRes.error.message)
      else setDrillingTasks(drillingRes.data ?? [])

      if (coreRes.error) setError(coreRes.error.message)
      else setCoreTasks(coreRes.data ?? [])

      if (sawingRes.error) setError(sawingRes.error.message)
      else setSawingTasks(sawingRes.data ?? [])

      if (samplingRes.error) setError(samplingRes.error.message)
      else setSamplingTasks(samplingRes.data ?? [])

      const { data: reportRows } = await supabase
        .from('reports')
        .select('*')
        .eq('site_id', siteId)
      setReports(reportRows ?? [])

      setLoading(false)
    }

    load()
  }, [session, siteId])

  async function toggleSiteStatus() {
    if (!site) return
    setTogglingStatus(true)
    const nextStatus = site.status === 'active' ? 'closed' : 'active'
    const { error: updateError } = await supabase
      .from('sites')
      .update({ status: nextStatus })
      .eq('id', site.id)
    setTogglingStatus(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    setSite({ ...site, status: nextStatus })
  }

  if (authLoading) return <p>Загрузка…</p>
  if (!session) return <Navigate to="/login" replace />
  if (!siteId) return <p>Не указан участок.</p>

  const siteAttention = {
    submitted: reports.filter((r) => r.approval_status === 'submitted').length,
    rejected: reports.filter((r) => r.approval_status === 'rejected').length,
  }

  // Задания на скважину подрядчика (без drilling_task_id) не к чему
  // прицепить — остаются отдельными списками, как раньше. "Свои" уходят
  // вложенными в карточку соответствующей скважины бурения (см. выше).
  const externalCoreTasks = coreTasks.filter((t) => !t.drilling_task_id)
  const externalSamplingTasks = samplingTasks.filter((t) => !t.drilling_task_id)

  return (
    <div>
      <Link
        to="/sites"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13.5, marginBottom: 14 }}
      >
        <ChevronLeft size={15} /> Все участки
      </Link>

      {error && <p className="text-error">{error}</p>}

      {loading ? (
        <div className="skeleton" style={{ height: 140, borderRadius: 'var(--radius-md)' }} />
      ) : !site ? (
        <p>Участок не найден или недоступен.</p>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0 }}>{site.name}</h1>
            <span className={`badge badge-${site.status === 'active' ? 'primary' : 'neutral'}`}>
              {site.status === 'active' ? 'активен' : 'закрыт'}
            </span>
            {isManagement(profile?.role) && (
              <button
                type="button"
                className="btn-outline"
                onClick={toggleSiteStatus}
                disabled={togglingStatus}
                style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12.5, padding: '4px 10px' }}
              >
                {site.status === 'active' ? <Lock size={13} /> : <Unlock size={13} />}
                {site.status === 'active' ? 'Закрыть участок' : 'Открыть участок'}
              </button>
            )}
          </div>
          <AttentionBadges submitted={siteAttention.submitted} rejected={siteAttention.rejected} />

          {isManagement(profile?.role) && (
            <div style={{ display: 'flex', gap: 8, margin: '16px 0 24px', flexWrap: 'wrap' }}>
              <Link to={`/sites/${siteId}/tasks/drilling/new`}>
                <button type="button" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Plus size={15} /> Задание: бурение
                </button>
              </Link>
              <Link to={`/sites/${siteId}/tasks/core-description/new`}>
                <button type="button" className="btn-outline" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Plus size={15} /> Задание: описание керна
                </button>
              </Link>
              <Link to={`/sites/${siteId}/tasks/core-sawing/new`}>
                <button type="button" className="btn-outline" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Plus size={15} /> Задание: распиловка керна
                </button>
              </Link>
              <Link to={`/sites/${siteId}/tasks/sampling/new`}>
                <button type="button" className="btn-outline" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Plus size={15} /> Задание: опробование
                </button>
              </Link>
            </div>
          )}

          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <DerrickIcon size={18} className="text-muted" /> Бурение скважин
          </h2>
          {drillingTasks.length === 0 ? (
            <p className="text-muted">Пока нет заданий на бурение.</p>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {drillingTasks.map((t, i) => {
                const attention = attentionCounts(t.id, 'drilling_task_id', reports)
                // Керн/распиловка/опробование, прицепленные ИМЕННО к этой
                // скважине (drilling_task_id совпадает) — показываем
                // вложенными в карточку скважины, а не отдельным списком
                // (см. отзыв 19.09.2026: одна физическая скважина — одна
                // карточка). Задания на скважине подрядчика (без
                // drilling_task_id) остаются отдельными списками ниже.
                const attachedRows: AttachedRow[] = [
                  ...coreTasks
                    .filter((c) => c.drilling_task_id === t.id)
                    .map((c) => ({
                      key: `core-description:${c.id}`,
                      taskType: 'core-description' as const,
                      taskId: c.id,
                      icon: Layers,
                      label: c.documentation_type === 'geological' ? 'Описание керна · геологическая' : 'Описание керна · геотехническая',
                      attention: attentionCounts(c.id, 'core_description_task_id', reports),
                      progress: coreProgress(c.id, reports),
                      plan: t.projected_depth,
                    })),
                  ...sawingTasks
                    .filter((s) => s.drilling_task_id === t.id)
                    .map((s) => ({
                      key: `core-sawing:${s.id}`,
                      taskType: 'core-sawing' as const,
                      taskId: s.id,
                      icon: Scissors,
                      label: 'Распиловка керна',
                      attention: attentionCounts(s.id, 'core_sawing_task_id', reports),
                      sawn: sawingProgress(s.id, reports),
                      plan: t.projected_depth,
                    })),
                  ...samplingTasks
                    .filter((s) => s.drilling_task_id === t.id)
                    .map((s) => ({
                      key: `sampling:${s.id}`,
                      taskType: 'sampling' as const,
                      taskId: s.id,
                      icon: FlaskConical,
                      label: 'Опробование',
                      attention: attentionCounts(s.id, 'sampling_task_id', reports),
                      samples: samplingProgress(s.id, reports),
                    })),
                ]
                return (
                  <motion.div
                    key={t.id}
                    className="card"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.28, delay: Math.min(i, 8) * 0.03, ease: [0.16, 1, 0.3, 1] }}
                    style={{ padding: 14 }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                      <Link
                        to={`/tasks/drilling/${t.id}/dashboard`}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15.5, flexWrap: 'wrap' }}
                      >
                        Скважина №{t.well_number}
                        <TaskStatusBadge status={t.status} />
                      </Link>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {profile?.role === 'party_chief' && (
                          <Link to={`/tasks/drilling/${t.id}/reports`}>
                            <button type="button" style={{ fontSize: 12.5, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 5 }}>
                              <FileText size={13} /> Сводка
                            </button>
                          </Link>
                        )}
                        {isManagement(profile?.role) && (
                          <Link to={`/sites/${siteId}/tasks/drilling/${t.id}/edit`} title="Редактировать задание">
                            <Pencil size={16} className="text-faint" />
                          </Link>
                        )}
                        <Link to={`/tasks/drilling/${t.id}/dashboard`} style={{ display: 'flex' }}>
                          <ChevronRight size={17} className="text-faint" />
                        </Link>
                      </div>
                    </div>
                    <AttentionBadges submitted={attention.submitted} rejected={attention.rejected} />
                    {t.projected_depth != null && (
                      <div style={{ marginTop: 8 }}>
                        <ProgressBar
                          label="Метраж бурения"
                          approved={drillingProgress(t.id, reports)}
                          plan={t.projected_depth}
                        />
                      </div>
                    )}

                    {attachedRows.length > 0 && (
                      <div className="attached-row-list">
                        {attachedRows.map((row) => (
                          <div key={row.key} className="attached-row">
                            <div className="attached-row-header">
                              <row.icon size={14} className="text-muted" />
                              <span>{row.label}</span>
                              <AttentionBadges submitted={row.attention.submitted} rejected={row.attention.rejected} />
                              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                                {profile?.role === 'party_chief' && (
                                  <Link to={`/tasks/${row.taskType}/${row.taskId}/reports`}>
                                    <button type="button" style={{ fontSize: 12, padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 4 }}>
                                      <FileText size={11} /> Сводка
                                    </button>
                                  </Link>
                                )}
                                <Link to={`/tasks/${row.taskType}/${row.taskId}/dashboard`} style={{ display: 'flex' }}>
                                  <ChevronRight size={15} className="text-faint" />
                                </Link>
                              </div>
                            </div>
                            {'progress' in row && (
                              <div style={{ marginTop: 6 }}>
                                <ProgressBar label="Керн описан" approved={row.progress.core} plan={row.plan} />
                                <ProgressBar label="Фотофиксация" approved={row.progress.photo} plan={row.plan} />
                              </div>
                            )}
                            {'sawn' in row && (
                              <div style={{ marginTop: 6 }}>
                                <ProgressBar label="Распилено" approved={row.sawn} plan={row.plan} />
                              </div>
                            )}
                            {'samples' in row && (
                              <p className="text-muted" style={{ fontSize: 13, margin: '6px 0 0' }}>
                                Проб отобрано: <span className="num text-success">{row.samples.taken}</span>
                                {' · '}
                                сдано в лабораторию: <span className="num text-success">{row.samples.submitted}</span>
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )
              })}
            </div>
          )}

          {externalCoreTasks.length > 0 && (
            <>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Layers size={18} className="text-muted" /> Описание керна (скважина подрядчика)
              </h2>
              <div style={{ display: 'grid', gap: 10 }}>
                {externalCoreTasks.map((t, i) => {
                  const attention = attentionCounts(t.id, 'core_description_task_id', reports)
                  const progress = coreProgress(t.id, reports)
                  return (
                    <motion.div
                      key={t.id}
                      className="card"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.28, delay: Math.min(i, 8) * 0.03, ease: [0.16, 1, 0.3, 1] }}
                      style={{ padding: 14 }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                        <Link
                          to={`/tasks/core-description/${t.id}/dashboard`}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15.5, flexWrap: 'wrap' }}
                        >
                          {`Скважина подрядчика №${t.external_well_number}`}
                          <span className="badge badge-neutral">
                            {t.documentation_type === 'geological' ? 'геологическая' : 'геотехническая'}
                          </span>
                          {!t.shift_enabled && <span className="badge badge-neutral">без смен</span>}
                        </Link>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {profile?.role === 'party_chief' && (
                            <Link to={`/tasks/core-description/${t.id}/reports`}>
                              <button type="button" style={{ fontSize: 12.5, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 5 }}>
                                <FileText size={13} /> Сводка
                              </button>
                            </Link>
                          )}
                          {isManagement(profile?.role) && (
                            <Link to={`/sites/${siteId}/tasks/core-description/${t.id}/edit`} title="Редактировать задание">
                              <Pencil size={16} className="text-faint" />
                            </Link>
                          )}
                          <Link to={`/tasks/core-description/${t.id}/dashboard`} style={{ display: 'flex' }}>
                            <ChevronRight size={17} className="text-faint" />
                          </Link>
                        </div>
                      </div>
                      <AttentionBadges submitted={attention.submitted} rejected={attention.rejected} />
                      <div style={{ marginTop: 8 }}>
                        <ProgressBar label="Керн описан" approved={progress.core} plan={t.external_projected_depth} />
                        <ProgressBar label="Фотофиксация" approved={progress.photo} plan={t.external_projected_depth} />
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            </>
          )}

          {externalSamplingTasks.length > 0 && (
            <>
              <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FlaskConical size={18} className="text-muted" /> Опробование (скважина подрядчика)
              </h2>
              <div style={{ display: 'grid', gap: 10 }}>
                {externalSamplingTasks.map((t, i) => {
                  const attention = attentionCounts(t.id, 'sampling_task_id', reports)
                  const progress = samplingProgress(t.id, reports)
                  return (
                    <motion.div
                      key={t.id}
                      className="card"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.28, delay: Math.min(i, 8) * 0.03, ease: [0.16, 1, 0.3, 1] }}
                      style={{ padding: 14 }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                        <Link
                          to={`/tasks/sampling/${t.id}/dashboard`}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15.5 }}
                        >
                          {`Скважина подрядчика №${t.external_well_number}`}
                        </Link>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {profile?.role === 'party_chief' && (
                            <Link to={`/tasks/sampling/${t.id}/reports`}>
                              <button type="button" style={{ fontSize: 12.5, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 5 }}>
                                <FileText size={13} /> Сводка
                              </button>
                            </Link>
                          )}
                          {isManagement(profile?.role) && (
                            <Link to={`/sites/${siteId}/tasks/sampling/${t.id}/edit`} title="Редактировать задание">
                              <Pencil size={16} className="text-faint" />
                            </Link>
                          )}
                          <Link to={`/tasks/sampling/${t.id}/dashboard`} style={{ display: 'flex' }}>
                            <ChevronRight size={17} className="text-faint" />
                          </Link>
                        </div>
                      </div>
                      <AttentionBadges submitted={attention.submitted} rejected={attention.rejected} />
                      <p className="text-muted" style={{ fontSize: 13.5, margin: '8px 0 0' }}>
                        Проб отобрано: <span className="num text-success">{progress.taken}</span>
                        {' · '}
                        сдано в лабораторию: <span className="num text-success">{progress.submitted}</span>
                      </p>
                    </motion.div>
                  )
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
