import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import type { Report } from '../../types/database'

type TaskType = 'drilling' | 'core-description'

const APPROVAL_LABELS: Record<Report['approval_status'], string> = {
  draft: 'Черновик',
  submitted: 'На согласовании',
  approved: 'Одобрено',
  rejected: 'Отклонено',
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

    async function load() {
      setLoading(true)
      const column =
        taskType === 'drilling' ? 'drilling_task_id' : 'core_description_task_id'
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
      <p>
        <Link to={`/tasks/${taskType}/${taskId}/reports/new`}>
          + Новая сводка
        </Link>
      </p>

      <h1>Сводки по заданию</h1>
      {error && <p style={{ color: '#c0392b' }}>{error}</p>}

      {loading ? (
        <p>Загрузка…</p>
      ) : reports.length === 0 ? (
        <p>Сводок пока нет.</p>
      ) : (
        <ul>
          {reports.map((r) => (
            <li key={r.id}>
              {r.report_date}
              {r.shift_number ? `, смена ${r.shift_number}` : ''} —{' '}
              {APPROVAL_LABELS[r.approval_status]}
              {(r.approval_status === 'draft' || r.edit_unlocked) && (
                <>
                  {' '}
                  —{' '}
                  <Link to={`/tasks/${taskType}/${taskId}/reports/${r.id}/edit`}>
                    открыть
                  </Link>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
