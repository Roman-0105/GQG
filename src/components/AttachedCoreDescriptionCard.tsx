import { useState } from 'react'
import { Layers, Plus } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import type { CoreDescriptionTask, DocumentationType } from '../types/database'

const LABELS: Record<DocumentationType, string> = {
  geological: 'Геологическая документация',
  geotechnical: 'Геотехническая документация',
}

interface Props {
  siteId: string
  drillingTaskId: string
  documentationType: DocumentationType
  task: CoreDescriptionTask | null
  onSaved: (task: CoreDescriptionTask) => void
}

// Описание керна, прицепленное к заданию на бурение (см. отзыв 19.09.2026):
// скважина и бригадир берутся от связанного drilling_task автоматически —
// ничего второй раз выбирать не нужно, ровно как для "своей скважины" в
// самостоятельной форме CoreDescriptionTaskForm.
export default function AttachedCoreDescriptionCard({
  siteId,
  drillingTaskId,
  documentationType,
  task,
  onSaved,
}: Props) {
  const { profile } = useAuth()
  const [adding, setAdding] = useState(false)
  const [shiftEnabled, setShiftEnabled] = useState(task?.shift_enabled ?? true)
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
      documentation_type: documentationType,
      shift_enabled: shiftEnabled,
      description: description.trim() || null,
    }

    const { data, error: saveError } = task
      ? await supabase
          .from('core_description_tasks')
          .update(commonFields)
          .eq('id', task.id)
          .select()
          .single()
      : await supabase
          .from('core_description_tasks')
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
        <Plus size={14} /> {LABELS[documentationType]}
      </button>
    )
  }

  return (
    <div className="attached-task-card">
      <div className="attached-task-card-header">
        <Layers size={15} className="text-muted" />
        <span>{LABELS[documentationType]}</span>
      </div>
      <label className="attached-task-checkbox">
        <input type="checkbox" checked={shiftEnabled} onChange={(e) => setShiftEnabled(e.target.checked)} />
        Ведётся посменно
      </label>
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
