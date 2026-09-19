import { useState } from 'react'
import { Scissors, Plus } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import type { CoreSawingTask } from '../types/database'

interface Props {
  siteId: string
  drillingTaskId: string
  task: CoreSawingTask | null
  onSaved: (task: CoreSawingTask) => void
}

// Распиловка, прицепленная к заданию на бурение — ответственный не
// выбирается вообще (всегда foreman_id связанной скважины, см. миграцию
// 0007 и CLAUDE.md), поэтому тут только описание для бригадира.
export default function AttachedSawingCard({ siteId, drillingTaskId, task, onSaved }: Props) {
  const { profile } = useAuth()
  const [adding, setAdding] = useState(false)
  const [description, setDescription] = useState(task?.description ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    if (!profile) return
    setSaving(true)
    setError(null)

    const commonFields = {
      site_id: siteId,
      drilling_task_id: drillingTaskId,
      description: description.trim() || null,
    }

    const { data, error: saveError } = task
      ? await supabase
          .from('core_sawing_tasks')
          .update(commonFields)
          .eq('id', task.id)
          .select()
          .single()
      : await supabase
          .from('core_sawing_tasks')
          .insert({ ...commonFields, created_by: profile.id })
          .select()
          .single()

    setSaving(false)
    if (saveError || !data) {
      setError(saveError?.message ?? 'Не удалось сохранить')
      return
    }
    onSaved(data)
    setAdding(false)
  }

  if (!task && !adding) {
    return (
      <button type="button" className="btn-outline attached-task-add" onClick={() => setAdding(true)}>
        <Plus size={14} /> Распиловка керна
      </button>
    )
  }

  return (
    <div className="attached-task-card">
      <div className="attached-task-card-header">
        <Scissors size={15} className="text-muted" />
        <span>Распиловка керна</span>
      </div>
      <p className="text-muted" style={{ fontSize: 12.5, margin: 0 }}>
        Ответственный не назначается — сводки вносит тот же бригадир, что ведёт бурение.
      </p>
      <textarea
        rows={2}
        placeholder="Описание для бригадира (необязательно)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      {error && (
        <p className="text-error" style={{ fontSize: 12.5, margin: 0 }}>
          {error}
        </p>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" onClick={handleSave} disabled={saving} style={{ fontSize: 12.5, padding: '6px 10px' }}>
          {saving ? '…' : task ? 'Сохранить' : 'Добавить'}
        </button>
        {!task && (
          <button
            type="button"
            className="btn-outline"
            onClick={() => setAdding(false)}
            style={{ fontSize: 12.5, padding: '6px 10px' }}
          >
            Отмена
          </button>
        )}
      </div>
    </div>
  )
}
