import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, X } from 'lucide-react'
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

// Роли, где смена реально имеет значение (25.09.2026, по запросу мастера
// участка) — буровик/помбур на станке работают посменно, а "ответственный
// исполнитель" на керне/распиловке/опробовании — нет, для него смены не
// заводим вообще (shift_number остаётся null, поведение не меняется).
const SHIFT_AWARE_ROLES = new Set<WorkerRole>(['driller', 'assistant_driller'])
const SHIFTS = [1, 2] as const

function todayIso() {
  return new Date().toISOString().slice(0, 10)
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
//
// 25.09.2026 — добавлены смены (буровик/помбур смены 1 и 2 — разные люди)
// и история замен: "убрать" работника больше не удаляет строку, а
// закрывает её (valid_to = сегодня) — так замена (временная или
// постоянная) не стирает, кто работал раньше. Текущий состав = строки с
// valid_to = null.
export default function CrewAssignmentSection({ taskType, taskId, foremanId, canEdit, heading }: Props) {
  const [assignments, setAssignments] = useState<TaskWorkerAssignment[]>([])
  const [brigadeWorkers, setBrigadeWorkers] = useState<Worker[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)

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

  async function handleAdd(role: WorkerRole, shiftNumber: 1 | 2 | null, workerId: string) {
    if (!workerId) return
    setError(null)
    const { data, error: insertError } = await supabase
      .from('task_worker_assignments')
      .insert({ [taskColumn]: taskId, role, shift_number: shiftNumber, worker_id: workerId })
      .select()
      .single()
    if (insertError) {
      setError(insertError.message)
      return
    }
    setAssignments((prev) => [...prev, data])
  }

  // "Убрать" = закрыть назначение сегодняшним числом, не удалить — так
  // замена (временная или постоянная) не стирает историю, кто работал
  // раньше (см. заголовок файла).
  async function handleRemove(id: string) {
    setError(null)
    const { data, error: updateError } = await supabase
      .from('task_worker_assignments')
      .update({ valid_to: todayIso() })
      .eq('id', id)
      .select()
      .single()
    if (updateError) {
      setError(updateError.message)
      return
    }
    setAssignments((prev) => prev.map((a) => (a.id === id ? data : a)))
  }

  const workerName = (id: string) => brigadeWorkers.find((w) => w.id === id)?.full_name ?? '—'

  if (loading) return null

  const active = assignments.filter((a) => !a.valid_to)
  const closed = assignments
    .filter((a) => a.valid_to)
    .sort((a, b) => (a.valid_from < b.valid_from ? 1 : -1))

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
          const shiftAware = SHIFT_AWARE_ROLES.has(role.value)
          const rows = active.filter((a) => a.role === role.value)

          if (!shiftAware) {
            const availableToAdd = brigadeWorkers.filter(
              (w) => !w.archived_at && !rows.some((r) => r.worker_id === w.id),
            )
            return (
              <RoleSlot
                key={role.value}
                label={role.label}
                rows={rows}
                availableToAdd={availableToAdd}
                canEdit={canEdit}
                workerName={workerName}
                onAdd={(workerId) => handleAdd(role.value, null, workerId)}
                onRemove={handleRemove}
              />
            )
          }

          return (
            <div key={role.value}>
              <div className="eyebrow" style={{ marginBottom: 6 }}>
                {role.label}
              </div>
              <div style={{ display: 'grid', gap: 8, paddingLeft: 10, borderLeft: '2px solid var(--color-border)' }}>
                {SHIFTS.map((shift) => {
                  const shiftRows = rows.filter((r) => r.shift_number === shift)
                  const availableToAdd = brigadeWorkers.filter(
                    (w) => !w.archived_at && !shiftRows.some((r) => r.worker_id === w.id),
                  )
                  return (
                    <RoleSlot
                      key={shift}
                      label={`Смена ${shift}`}
                      rows={shiftRows}
                      availableToAdd={availableToAdd}
                      canEdit={canEdit}
                      workerName={workerName}
                      onAdd={(workerId) => handleAdd(role.value, shift, workerId)}
                      onRemove={handleRemove}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {closed.length > 0 && (
        <div style={{ marginTop: 14, borderTop: '1px solid var(--color-border)', paddingTop: 10 }}>
          <button
            type="button"
            onClick={() => setHistoryOpen((prev) => !prev)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              background: 'transparent',
              border: 'none',
              color: 'var(--color-text-muted)',
              padding: 0,
              fontSize: 12.5,
            }}
          >
            {historyOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            История замен ({closed.length})
          </button>
          {historyOpen && (
            <div style={{ display: 'grid', gap: 4, marginTop: 8 }}>
              {closed.map((a) => {
                const roleLabel = roles.find((r) => r.value === a.role)?.label ?? a.role
                return (
                  <div key={a.id} className="text-muted" style={{ fontSize: 12.5 }}>
                    {roleLabel}
                    {a.shift_number ? `, смена ${a.shift_number}` : ''} — {workerName(a.worker_id)}
                    {' '}
                    <span className="num">
                      {a.valid_from} – {a.valid_to}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Одна строка "роль(+смена): текущие работники + кнопка добавить" — общая
// для ролей со сменой (вызывается дважды, на смену 1 и 2) и без неё
// (вызывается один раз). Вынесено, чтобы не дублировать разметку чипов.
function RoleSlot({
  label,
  rows,
  availableToAdd,
  canEdit,
  workerName,
  onAdd,
  onRemove,
}: {
  label: string
  rows: TaskWorkerAssignment[]
  availableToAdd: Worker[]
  canEdit: boolean
  workerName: (id: string) => string
  onAdd: (workerId: string) => void
  onRemove: (id: string) => void
}) {
  return (
    <div>
      <div className="eyebrow" style={{ marginBottom: 6, fontSize: 11.5 }}>
        {label}
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
                onClick={() => onRemove(r.id)}
                style={{
                  display: 'inline-flex',
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  color: 'inherit',
                  cursor: 'pointer',
                }}
                title="Убрать (сохранится в истории)"
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
          onChange={(e) => onAdd(e.target.value)}
          style={{ fontSize: 13, maxWidth: 260 }}
        >
          <option value="">+ добавить работника</option>
          {availableToAdd.map((w) => (
            <option key={w.id} value={w.id}>
              {w.full_name}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}
