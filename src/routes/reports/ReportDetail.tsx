import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, MessageSquare, MessageCircle, Check, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { isManagement } from '../../types/roles'
import { ApprovalBadge } from '../../components/StatusBadge'
import { buildDrillingShiftMessage } from '../../lib/whatsappMessage'
import { loadReportSiteAndWellLabel } from '../../lib/reportLabel'
import { round2 } from '../../lib/taskProgress'
import type { TaskType } from '../../types/taskType'
import type { CostItem, DrillingTask, Report, ReportCost } from '../../types/database'

interface EnrichedCost extends ReportCost {
  categoryName: string
}

function shiftLabel(taskType: TaskType, shiftNumber: number | null) {
  if (!shiftNumber) return ''
  if (taskType === 'core-sawing') return shiftNumber === 1 ? ', день' : ', ночь'
  return `, смена ${shiftNumber}`
}

// Просмотр уже поданной сводки — история "что я отправлял", без правки
// (см. отзыв 17.09.2026: бригадир должен видеть заполненную форму по
// клику из списка сводок, а не только черновики). Правка — отдельной
// кнопкой отсюда, только пока это разрешено RLS (draft/edit_unlocked) и
// только автору.
export default function ReportDetail() {
  const { taskType, taskId, reportId } = useParams<{
    taskType: TaskType
    taskId: string
    reportId: string
  }>()
  const { session, profile, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  const [report, setReport] = useState<Report | null>(null)
  const [drillingTask, setDrillingTask] = useState<DrillingTask | null>(null)
  const [drillingRigNumber, setDrillingRigNumber] = useState<string | null>(null)
  const [authorName, setAuthorName] = useState('—')
  const [siteName, setSiteName] = useState('—')
  const [wellLabel, setWellLabel] = useState('—')
  const [costs, setCosts] = useState<EnrichedCost[]>([])
  const [bottomHole, setBottomHole] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!session || !taskId || !taskType || !reportId) return

    async function load() {
      setLoading(true)
      setError(null)

      const { data: r, error: reportError } = await supabase
        .from('reports')
        .select('*')
        .eq('id', reportId)
        .single()
      if (reportError) setError(reportError.message)
      setReport(r)

      if (!r) {
        setLoading(false)
        return
      }

      const [authorRes, costsRes, siteAndWell] = await Promise.all([
        supabase.from('profiles').select('full_name').eq('id', r.author_id).single(),
        supabase.from('report_costs').select('*').eq('report_id', reportId),
        loadReportSiteAndWellLabel(r),
      ])
      if (authorRes.data) setAuthorName(authorRes.data.full_name)
      setSiteName(siteAndWell.siteName)
      setWellLabel(siteAndWell.wellLabel)

      if (costsRes.data && costsRes.data.length > 0) {
        const itemIds = [...new Set(costsRes.data.map((c) => c.cost_item_id))]
        const { data: items } = await supabase
          .from('cost_items')
          .select('*, cost_categories(name)')
          .in('id', itemIds)
        const itemMap = new Map(
          ((items ?? []) as (CostItem & { cost_categories: { name: string } | null })[]).map(
            (it) => [it.id, `${it.cost_categories?.name ?? '—'} — ${it.name}`],
          ),
        )
        setCosts(
          costsRes.data.map((c) => ({ ...c, categoryName: itemMap.get(c.cost_item_id) ?? '—' })),
        )
      } else {
        setCosts([])
      }

      if (taskType === 'drilling') {
        const { data: task } = await supabase
          .from('drilling_tasks')
          .select('*')
          .eq('id', taskId)
          .single()
        setDrillingTask(task)
        if (task?.drilling_rig_id) {
          const { data: rig } = await supabase
            .from('drilling_rigs')
            .select('rig_number')
            .eq('id', task.drilling_rig_id)
            .single()
          setDrillingRigNumber(rig?.rig_number ?? null)
        }

        // Забой на момент ЭТОЙ смены — сумма подтверждённых метров по
        // заданию строго ДО неё хронологически (по дате и номеру смены),
        // плюс метраж самой этой смены. Не просто "все approved на
        // сегодня" — так исторический просмотр остаётся верным даже для
        // сводки не последней по дате.
        const { data: allReports } = await supabase
          .from('reports')
          .select('*')
          .eq('drilling_task_id', taskId)
          .eq('approval_status', 'approved')
        const priorSum = (allReports ?? [])
          .filter((other) => {
            if (other.id === r.id) return false
            if (other.report_date !== r.report_date) return other.report_date < r.report_date
            return (other.shift_number ?? 0) < (r.shift_number ?? 0)
          })
          .reduce((s, other) => s + (other.drilling_meters ?? 0), 0)
        setBottomHole(round2(priorSum + (r.drilling_meters ?? 0)))
      }

      setLoading(false)
    }

    load()
  }, [session, taskId, taskType, reportId])

  if (authLoading) return <p>Загрузка…</p>
  if (!session) return <Navigate to="/login" replace />
  if (!taskId || !taskType || !reportId) return <p>Не указана сводка.</p>

  async function handleCopyWhatsApp() {
    if (!report || !drillingTask) return
    const message = buildDrillingShiftMessage({
      wellNumber: drillingTask.well_number,
      rigNumber: drillingRigNumber,
      reportDate: report.report_date,
      shiftNumber: report.shift_number,
      meters: report.drilling_meters ?? 0,
      bottomHole: bottomHole ?? report.drilling_meters ?? 0,
      shiftNotes: report.shift_notes,
    })
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Не удалось скопировать — скопируйте текст вручную.')
    }
  }

  const canEdit =
    !!report &&
    !!profile &&
    report.author_id === profile.id &&
    (report.approval_status === 'draft' || report.edit_unlocked)

  // Автор может удалить только СВОЙ черновик — отправленную/согласованную/
  // отклонённую сводку удалить так нельзя, это уже часть истории (см.
  // отзыв 20.09.2026 и RLS-политику reports_delete_own_draft). Management
  // может удалить сводку в любом статусе (reports_delete_management) —
  // например, для уборки тестовых/ошибочных данных.
  const canDelete =
    !!report &&
    !!profile &&
    (isManagement(profile.role) || (report.author_id === profile.id && report.approval_status === 'draft'))

  async function handleDelete() {
    if (!reportId) return
    setDeleting(true)
    setError(null)
    // .select() обязателен: DELETE, которому RLS не разрешил тронуть ни
    // одной строки, возвращает error: null и просто 0 затронутых строк —
    // без .select() это выглядело бы как успех, хотя на деле ничего не
    // удалилось (например, миграция 0011 ещё не применена на сервере).
    const { data: deletedRows, error: deleteError } = await supabase
      .from('reports')
      .delete()
      .eq('id', reportId)
      .select('id')
    setDeleting(false)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    if (!deletedRows || deletedRows.length === 0) {
      setError('Не удалось удалить — сводка не найдена или уже недоступна для удаления.')
      setConfirmingDelete(false)
      return
    }
    navigate(`/tasks/${taskType}/${taskId}/reports`)
  }

  return (
    <div style={{ maxWidth: 460 }}>
      <Link
        to={`/tasks/${taskType}/${taskId}/reports`}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13.5, marginBottom: 14 }}
      >
        <ChevronLeft size={15} /> Все сводки
      </Link>

      <h1>Сводка за смену</h1>

      {error && <p className="text-error">{error}</p>}

      {loading || !report ? (
        <p>Загрузка…</p>
      ) : (
        <>
          <div className="card" style={{ padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>
                {siteName}, {wellLabel}
              </p>
              <ApprovalBadge status={report.approval_status} />
            </div>
            <p style={{ margin: '0 0 4px' }}>{authorName}</p>
            <p className="text-muted num" style={{ margin: '0 0 12px', fontSize: 13.5 }}>
              {report.report_date}
              {shiftLabel(taskType, report.shift_number)}
            </p>
            <div style={{ display: 'grid', gap: 6, fontSize: 14.5 }}>
              {report.hours_worked != null && (
                <p style={{ margin: 0 }}>
                  Часы работы: <span className="num">{report.hours_worked}</span>
                </p>
              )}
              {report.drilling_meters != null && (
                <p style={{ margin: 0 }}>
                  Метраж бурения: <span className="num">{round2(report.drilling_meters)} м</span>
                  {bottomHole != null && (
                    <span className="text-muted"> (забой: <span className="num">{round2(bottomHole)} м</span>)</span>
                  )}
                </p>
              )}
              {report.core_description_interval_to != null && (
                <p style={{ margin: 0 }}>
                  Описание керна:{' '}
                  <span className="num">
                    {round2(report.core_description_interval_from ?? 0)}–{round2(report.core_description_interval_to)} м
                  </span>
                </p>
              )}
              {report.photofixation_interval_to != null && (
                <p style={{ margin: 0 }}>
                  Фотофиксация:{' '}
                  <span className="num">
                    {round2(report.photofixation_interval_from ?? 0)}–{round2(report.photofixation_interval_to)} м
                  </span>
                </p>
              )}
              {report.sawn_meters != null && (
                <p style={{ margin: 0 }}>
                  Распилено: <span className="num">{round2(report.sawn_meters)} м</span>
                </p>
              )}
              {report.samples_taken != null && (
                <p style={{ margin: 0 }}>
                  Проб отобрано: <span className="num">{report.samples_taken}</span>
                </p>
              )}
              {report.samples_submitted != null && (
                <p style={{ margin: 0 }}>
                  Проб сдано в лабораторию: <span className="num">{report.samples_submitted}</span>
                </p>
              )}
            </div>
          </div>

          {report.approval_status === 'rejected' && report.review_comment && (
            <p className="card" style={{ padding: 12, fontSize: 14, marginBottom: 16, borderLeft: '3px solid var(--color-danger)' }}>
              <span className="text-error">Причина отклонения:</span> {report.review_comment}
            </p>
          )}

          {report.shift_notes && (
            <p className="card" style={{ display: 'flex', gap: 8, padding: 12, fontSize: 14, marginBottom: 16 }}>
              <MessageSquare size={16} className="text-faint" style={{ flexShrink: 0, marginTop: 2 }} />
              {report.shift_notes}
            </p>
          )}

          {costs.length > 0 && (
            <>
              <h2>Затраты</h2>
              <div className="card" style={{ padding: 4, marginBottom: 16 }}>
                <ul>
                  {costs.map((c) => (
                    <li key={c.id} style={{ padding: '9px 12px', display: 'flex', justifyContent: 'space-between' }}>
                      <span>{c.categoryName}</span>
                      <span className="num text-muted">{c.quantity ?? '—'}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {taskType === 'drilling' && (
              <button
                type="button"
                className="btn-outline"
                onClick={handleCopyWhatsApp}
                style={{ display: 'flex', alignItems: 'center', gap: 7 }}
              >
                {copied ? <Check size={16} /> : <MessageCircle size={16} />}
                {copied ? 'Скопировано' : 'Скопировать для WhatsApp'}
              </button>
            )}
            {canEdit && (
              <Link to={`/tasks/${taskType}/${taskId}/reports/${reportId}/edit`}>
                <button type="button" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Pencil size={15} />
                  {report.approval_status === 'rejected' ? 'Исправить и отправить заново' : 'Редактировать'}
                </button>
              </Link>
            )}
            {canDelete && !confirmingDelete && (
              <button
                type="button"
                className="btn-outline"
                onClick={() => setConfirmingDelete(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--color-danger)' }}
              >
                <Trash2 size={15} /> {report.approval_status === 'draft' ? 'Удалить черновик' : 'Удалить сводку'}
              </button>
            )}
            {canDelete && confirmingDelete && (
              <>
                <span style={{ alignSelf: 'center', fontSize: 13.5 }}>Удалить безвозвратно?</span>
                <button
                  type="button"
                  className="btn-danger"
                  disabled={deleting}
                  onClick={handleDelete}
                  style={{ display: 'flex', alignItems: 'center', gap: 7 }}
                >
                  {deleting ? <span className="spinner" style={{ marginRight: 0 }} /> : <Trash2 size={15} />}
                  {deleting ? 'Удаляем…' : 'Да, удалить'}
                </button>
                <button
                  type="button"
                  className="btn-outline"
                  disabled={deleting}
                  onClick={() => setConfirmingDelete(false)}
                >
                  Отмена
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
