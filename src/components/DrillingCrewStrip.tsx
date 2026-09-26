import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { TaskWorkerAssignment, Worker } from '../types/database'

interface Props {
  taskId: string
}

const ROLE_LABELS: Record<'driller' | 'assistant_driller', string> = {
  driller: 'Буровик',
  assistant_driller: 'Помбур',
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  const value = parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
  return value || '—'
}

// Компактная сводка ТЕКУЩЕГО состава бригады (буровик/помбур по сменам) —
// только для чтения, встраивается в панель "Проходка скважины"
// (DrillingProgressPanel.tsx, 25.09.2026). Полное редактирование и история
// замен по-прежнему только в модалке "Состав бригады"
// (CrewAssignmentSection.tsx) — этот компонент её не заменяет, а даёт
// быстрый обзор без лишнего клика. Работников резолвим напрямую по
// worker_id из назначения (не через "бригаду бригадира", как в
// CrewAssignmentSection) — так имя корректно покажется, даже если
// работника впоследствии перевели к другому бригадиру.
export default function DrillingCrewStrip({ taskId }: Props) {
  const [assignments, setAssignments] = useState<TaskWorkerAssignment[]>([])
  const [workers, setWorkers] = useState<Worker[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const { data: assignmentRows } = await supabase
        .from('task_worker_assignments')
        .select('*')
        .eq('drilling_task_id', taskId)
        .in('role', ['driller', 'assistant_driller'])
        .is('valid_to', null)
      if (cancelled) return
      const rows = assignmentRows ?? []
      setAssignments(rows)
      const workerIds = [...new Set(rows.map((r) => r.worker_id))]
      if (workerIds.length > 0) {
        const { data: workerRows } = await supabase.from('workers').select('*').in('id', workerIds)
        if (!cancelled) setWorkers(workerRows ?? [])
      } else {
        setWorkers([])
      }
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [taskId])

  if (loading) return null

  const slots: { role: 'driller' | 'assistant_driller'; shift: 1 | 2 }[] = [
    { role: 'driller', shift: 1 },
    { role: 'driller', shift: 2 },
    { role: 'assistant_driller', shift: 1 },
    { role: 'assistant_driller', shift: 2 },
  ]

  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
      <div className="eyebrow" style={{ flexShrink: 0 }}>
        Бригада
      </div>
      {slots.map(({ role, shift }) => {
        const assignment = assignments.find((a) => a.role === role && a.shift_number === shift)
        const worker = assignment ? workers.find((w) => w.id === assignment.worker_id) : undefined
        const name = worker?.full_name ?? 'не назначен'
        return (
          <div key={`${role}-${shift}`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: 'var(--radius-full)',
                background: worker ? 'var(--color-primary)' : 'var(--color-surface-muted)',
                color: worker ? '#fff' : 'var(--color-text-faint)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 10.5,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {worker ? initials(worker.full_name) : '—'}
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                {ROLE_LABELS[role]} · смена {shift}
              </div>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>{name}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
