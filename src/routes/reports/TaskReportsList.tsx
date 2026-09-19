import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Plus, FileText, ChevronRight } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { ApprovalBadge } from '../../components/StatusBadge'
import { TASK_TYPE_REPORT_COLUMN, type TaskType } from '../../types/taskType'
import type { Report } from '../../types/database'

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
  const { session, loading: authLoading } = useAuth()

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
      setLoading(false)
    }

    load()
  }, [session, taskId, taskType])

  if (authLoading) return <p>Загрузка…</p>
  if (!session) return <Navigate to="/login" replace />
  if (!taskId || !taskType) return <p>Не указано задание.</p>

  return (
    <div>
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
      </p>

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
          {reports.map((r, i) => (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: Math.min(i, 10) * 0.03, ease: [0.16, 1, 0.3, 1] }}
            >
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
                {r.approval_status === 'rejected' && r.review_comment && (
                  <p className="text-error" style={{ fontSize: 13.5, margin: '6px 0 0' }}>
                    Причина: {r.review_comment}
                  </p>
                )}
                {r.shift_notes && (
                  <p className="text-muted" style={{ fontSize: 13.5, margin: '6px 0 0' }}>
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
