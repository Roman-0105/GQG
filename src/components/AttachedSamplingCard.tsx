import { useEffect, useState } from 'react'
import { FlaskConical, Plus } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import type { Profile, SamplingTask } from '../types/database'

interface Props {
  siteId: string
  drillingTaskId: string
  // Бригадир бурения этой скважины — подставляется по умолчанию (см. отзыв
  // 19.09.2026: чаще всего пробы отбирает та же бригада), но остаётся
  // редактируемым полем, т.к. опробование иногда ведёт отдельная бригада.
  defaultForemanId: string
  task: SamplingTask | null
  onSaved: (task: SamplingTask) => void
}

export default function AttachedSamplingCard({
  siteId,
  drillingTaskId,
  defaultForemanId,
  task,
  onSaved,
}: Props) {
  const { profile } = useAuth()
  const [adding, setAdding] = useState(false)
  const [partyChiefs, setPartyChiefs] = useState<Profile[]>([])
  const [assignedId, setAssignedId] = useState(task?.assigned_party_chief_id ?? defaultForemanId)
  const [description, setDescription] = useState(task?.description ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!adding && !task) return
    supabase
      .from('profiles')
      .select('*')
      .eq('role', 'party_chief')
      .order('full_name')
      .then(({ data }) => data && setPartyChiefs(data))
  }, [adding, task])

  async function handleSave() {
    if (!profile || !assignedId) return
    setSaving(true)
    setError(null)

    const commonFields = {
      site_id: siteId,
      drilling_task_id: drillingTaskId,
      assigned_party_chief_id: assignedId,
      description: description.trim() || null,
    }

    const { data, error: saveError } = task
      ? await supabase
          .from('sampling_tasks')
          .update(commonFields)
          .eq('id', task.id)
          .select()
          .single()
      : await supabase
          .from('sampling_tasks')
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
      <button
        type="button"
        className="btn-outline attached-task-add"
        onClick={() => {
          setAssignedId(defaultForemanId)
          setAdding(true)
        }}
      >
        <Plus size={14} /> Опробование
      </button>
    )
  }

  return (
    <div className="attached-task-card">
      <div className="attached-task-card-header">
        <FlaskConical size={15} className="text-muted" />
        <span>Опробование</span>
      </div>
      <label style={{ fontSize: 12.5 }}>
        Ответственный
        <select value={assignedId} onChange={(e) => setAssignedId(e.target.value)}>
          <option value="">— выбрать —</option>
          {partyChiefs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}
            </option>
          ))}
        </select>
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
        <button type="button" onClick={handleSave} disabled={saving || !assignedId} style={{ fontSize: 12.5, padding: '6px 10px' }}>
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
