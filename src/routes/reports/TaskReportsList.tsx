import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Plus, FileText, ChevronRight, ChevronLeft } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { riseIn } from '../../lib/motionVariants'
import { ApprovalBadge } from '../../components/StatusBadge'
import { TASK_TYPE_REPORT_COLUMN, type TaskType } from '../../types/taskType'
import { isManagement } from '../../types/roles'
import type { ApprovalStatus, Report } from '../../types/database'

function shiftLabel(taskType: TaskType, shiftNumber: number | null) {
  if (!shiftNumber) return ''
  if (taskType === 'core-sawing') return shiftNumber === 1 ? ', день' : ', ночь'
  return `, смена ${shiftNumber}`
}

export default function TaskReportsList() {
  const { taskType, taskId } = useParams<{
    taskType: TaskType
    taskId: string
  }>()
  const { session, profile, loading: authLoading } = useAuth()
  const showPeople = isManagement(profile?.role)
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [statusFilter, setStatusFilter] = useState<ApprovalStatus | 'all'>('all')

  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!session || !taskId || !taskType) return
    const currentTaskType = taskType

    async function load() {
      setLoading(true)
      const column = TASK_TYPE_REPORT_COLUMN[currentTaskType]
      const { data, error: fetchError } = await supabase
        .from('reports')
        .select('*')
        .eq(column, taskId)
        .order('report_date', { ascending: false })
        .order('shift_number', { ascending: false })

      if (fetchError) setError(fetchError.message)
      else setReports(data ?? [])
      const ids = [...new Set((data ?? []).flatMap((r) => [r.author_id, r.approved_by]).filter((x): x is string => !!x))]
      if (ids.length > 0) {
        const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', ids)
        setNames(new Map((profs ?? []).map((p) => [p.id as string, p.full_name as string])))
      }
      setLoading(false)
    }

    load()
  }, [session, taskId, taskType])

  if (authLoading) return <p>Загрузка…</p>
  if (!session) return <Navigate to="/login" replace />
  if (!taskId || !taskType) return <p>Не указано задание.</p>

  return (
    <div>
      <Link
        to={`/tasks/${taskType}/${taskId}/dashboard`}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, marginBottom: 10 }}
      >
        <ChevronLeft size={15} /> Дашборд задания
      </Link>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <FileText size={24} className="text-muted" /> Сводки по заданию
        </h1>
        <Link to={`/tasks/${taskType}/${taskId}/reports/new`}>
          <button type="button" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={16} /> Новая сводка
          </button>
        </Link>
      </div>
      <p className="text-muted" style={{ fontSize: 13, marginTop: 6 }}>
        Клик по сводке открывает историю — что было заполнено, статус, комментарий согласования.
        {showPeople && ' Из сводки можно вернуть мастеру на правку.'}
      </p>

      {showPeople && reports.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
          {([['all', 'Все'], ['submitted', 'На согласовании'], ['approved', 'Одобрено'], ['rejected', 'Отклонено / на правке'], ['draft', 'Черновики']] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              className={statusFilter === k ? undefined : 'btn-outline'}
              onClick={() => setStatusFilter(k)}
              style={{ minHeight: 34, padding: '4px 12px', fontSize: 13 }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-error">{error}</p>}

      {loading ? (
        <div style={{ display: 'grid', gap: 8, marginTop: 20 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: 56, borderRadius: 'var(--radius-md)' }} />
          ))}
        </div>
      ) : reports.length === 0 ? (
        <p className="text-muted" style={{ marginTop: 20 }}>
          Сводок пока нет.
        </p>
      ) : (
        <div style={{ display: 'grid', gap: 8, marginTop: 20 }}>
          {reports.filter((r) => statusFilter === 'all' || r.approval_status === statusFilter).map((r, i) => (
            <motion.div key={r.id} {...riseIn(i, { duration: 0.25, cap: 10, step: 0.03 })}>
              <Link
                to={`/tasks/${taskType}/${taskId}/reports/${r.id}`}
                className="card card-interactive"
                style={{ display: 'block', padding: '12px 16px' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span className="num" style={{ fontWeight: 700, color: 'var(--color-text)' }}>
                    {r.report_date}
                    {shiftLabel(taskType, r.shift_number)}
                  </span>
                  <ApprovalBadge status={r.approval_status} />
                  <ChevronRight size={17} className="text-faint" style={{ marginLeft: 'auto' }} />
                </div>
                {showPeople && (
                  <p className="text-muted" style={{ fontSize: 13, margin: '6px 0 0' }}>
                    Автор: {names.get(r.author_id) ?? '—'}
                    {r.approved_by && r.approved_at && (r.approval_status === 'approved' || r.approval_status === 'rejected') &&
                      ` · ${r.approval_status === 'approved' ? 'согласовал' : 'вернул'}: ${names.get(r.approved_by) ?? '—'}, ${new Date(r.approved_at).toLocaleDateString('ru-RU')}`}
                  </p>
                )}
                {r.approval_status === 'rejected' && r.review_comment && (
                  <p className="text-error" style={{ fontSize: 13, margin: '6px 0 0' }}>
                    Причина: {r.review_comment}
                  </p>
                )}
                {r.shift_notes && (
                  <p className="text-muted" style={{ fontSize: 13, margin: '6px 0 0' }}>
                    {r.shift_notes}
                  </p>
                )}
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
