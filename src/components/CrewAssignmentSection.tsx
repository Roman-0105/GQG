import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { TASK_TYPE_REPORT_COLUMN, type TaskType } from '../types/taskType'
import type { TaskWorkerAssignment, Worker, WorkerRole } from '../types/database'

const ROLE_SLOTS: Record<TaskType, { value: WorkerRole; label: string }[]> = {
  drilling: [
    { value: 'driller', label: 'Буровик' },
    { value: 'assistant_driller', label: 'Помощник бурильщика' },
  ],
  'core-description': [{ value: 'responsible', label: 'Ответственный исполнитель' }],
  'core-sawing': [{ value: 'responsible', label: 'Ответственный исполнитель' }],
  sampling: [{ value: 'responsible', label: 'Ответственный исполнитель' }],
}

interface Props {
  taskType: TaskType
  taskId: string
  // Профиль, чья бригада (workers.assigned_foreman_id) доступна для
  // назначения — бригадир скважины, либо ответственный за скважину
  // подрядчика (assigned_party_chief_id); см. отзыв 20.09.2026.
  foremanId: string | null
  canEdit: boolean
  // Подпись секции внутри модалки "Состав бригады" — на дашборде бурения
  // показывается несколько секций сразу (само бурение + прицепленные
  // керн/распиловка/опробование), поэтому подпись задаёт вызывающий код,
  // а не жёстко прошита в компоненте (см. TaskDashboard.tsx).
  heading?: string
}

// Распределение конкретных работников бригады по ролям на задании
// (20.09.2026, по запросу заказчика) — учётная информация, не связана с
// тем, кто согласовывает сводки. Работник выбирается только из списка
// ЭТОГО бригадира/ответственного (workers.assigned_foreman_id), RLS на
// task_worker_assignments проверяет то же самое на уровне базы.
export default function CrewAssignmentSection({ taskType, taskId, foremanId, canEdit, heading }: Props) {
  const [assignments, setAssignments] = useState<TaskWorkerAssignment[]>([])
  const [brigadeWorkers, setBrigadeWorkers] = useState<Worker[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const taskColumn = TASK_TYPE_REPORT_COLUMN[taskType]
  const roles = ROLE_SLOTS[taskType]

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const [assignmentsRes, workersRes] = await Promise.all([
        supabase.from('task_worker_assignments').select('*').eq(taskColumn, taskId),
        foremanId
          ? supabase.from('workers').select('*').eq('assigned_foreman_id', foremanId).order('full_name')
          : Promise.resolve({ data: [] as Worker[] }),
      ])
      if (cancelled) return
      setAssignments(assignmentsRes.data ?? [])
      setBrigadeWorkers(workersRes.data ?? [])
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [taskColumn, taskId, foremanId])

  async function handleAdd(role: WorkerRole, workerId: string) {
    if (!workerId) return
    setError(null)
    const { data, error: insertError } = await supabase
      .from('task_worker_assignments')
      .insert({ [taskColumn]: taskId, role, worker_id: workerId })
      .select()
      .single()
    if (insertError) {
      setError(insertError.message)
      return
    }
    setAssignments((prev) => [...prev, data])
  }

  async function handleRemove(id: string) {
    setAssignments((prev) => prev.filter((a) => a.id !== id))
    await supabase.from('task_worker_assignments').delete().eq('id', id)
  }

  const workerName = (id: string) => brigadeWorkers.find((w) => w.id === id)?.full_name ?? '—'

  if (loading) return null

  return (
    <div>
      {heading && <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 15 }}>{heading}</h3>}
      {error && <p className="text-error" style={{ fontSize: 13 }}>{error}</p>}
      {canEdit && foremanId && brigadeWorkers.length === 0 && (
        <p className="text-muted" style={{ fontSize: 13 }}>
          У бригадира пока нет работников в списке — добавьте на странице{' '}
          <Link to="/settings/workers">«Работники»</Link>.
        </p>
      )}
      <div style={{ display: 'grid', gap: 14 }}>
        {roles.map((role) => {
          const rows = assignments.filter((a) => a.role === role.value)
          const availableToAdd = brigadeWorkers.filter(
            (w) => !rows.some((r) => r.worker_id === w.id),
          )
          return (
            <div key={role.value}>
              <div className="eyebrow" style={{ marginBottom: 6 }}>
                {role.label}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: canEdit ? 8 : 0 }}>
                {rows.length === 0 && <span className="text-muted" style={{ fontSize: 13 }}>не назначен</span>}
                {rows.map((r) => (
                  <span
                    key={r.id}
                    className="badge badge-neutral"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
                  >
                    {workerName(r.worker_id)}
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => handleRemove(r.id)}
                        style={{
                          display: 'inline-flex',
                          background: 'transparent',
                          border: 'none',
                          padding: 0,
                          color: 'inherit',
                          cursor: 'pointer',
                        }}
                        title="Убрать"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </span>
                ))}
              </div>
              {canEdit && availableToAdd.length > 0 && (
                <select
                  value=""
                  onChange={(e) => handleAdd(role.value, e.target.value)}
                  style={{ fontSize: 13, maxWidth: 260 }}
                >
                  <option value="">+ добавить работника</option>
                  {availableToAdd.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.full_name}
                      {w.position ? ` — ${w.position}` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
