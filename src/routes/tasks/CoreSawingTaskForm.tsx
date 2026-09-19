import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { Scissors, ChevronLeft } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { isManagement } from '../../types/roles'
import type { DrillingTask } from '../../types/database'

// Распиловка керна — только своя скважина, ответственный не назначается
// отдельно: это foreman_id связанного drilling_task (решение заказчика,
// см. миграцию 0007 и CLAUDE.md). taskId в URL — режим правки.
export default function CoreSawingTaskForm() {
  const { siteId, taskId } = useParams<{ siteId: string; taskId?: string }>()
  const isEditMode = Boolean(taskId)
  const { session, profile, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  const [ownDrillingTasks, setOwnDrillingTasks] = useState<DrillingTask[]>([])
  const [selectedDrillingTaskId, setSelectedDrillingTaskId] = useState('')
  const [description, setDescription] = useState('')
  const [loadingTask, setLoadingTask] = useState(isEditMode)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!session || !siteId) return
    supabase
      .from('drilling_tasks')
      .select('*')
      .eq('site_id', siteId)
      .order('well_number')
      .then(({ data }) => data && setOwnDrillingTasks(data))
  }, [session, siteId])

  useEffect(() => {
    if (!session || !taskId) return
    supabase
      .from('core_sawing_tasks')
      .select('*')
      .eq('id', taskId)
      .single()
      .then(({ data }) => {
        if (data) {
          setSelectedDrillingTaskId(data.drilling_task_id)
          setDescription(data.description ?? '')
        }
        setLoadingTask(false)
      })
  }, [session, taskId])

  if (authLoading) return <p>Загрузка…</p>
  if (!session) return <Navigate to="/login" replace />
  if (!siteId) return <p>Не указан участок.</p>
  if (!isManagement(profile?.role)) {
    return <p>{isEditMode ? 'Редактировать' : 'Создавать'} задания могут только гендир/техдир.</p>
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!profile || !selectedDrillingTaskId) return
    setSubmitting(true)
    setError(null)

    const commonFields = {
      site_id: siteId as string,
      drilling_task_id: selectedDrillingTaskId,
      description: description.trim() || null,
    }

    const { error: saveError } = isEditMode
      ? await supabase.from('core_sawing_tasks').update(commonFields).eq('id', taskId)
      : await supabase.from('core_sawing_tasks').insert({ ...commonFields, created_by: profile.id })

    setSubmitting(false)

    if (saveError) {
      setError(saveError.message)
      return
    }
    navigate(`/sites/${siteId}`)
  }

  return (
    <div style={{ maxWidth: 460 }}>
      <Link to={`/sites/${siteId}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13.5, marginBottom: 10 }}>
        <ChevronLeft size={15} /> Участок
      </Link>
      <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Scissors size={22} className="text-muted" /> {isEditMode ? 'Правка задания: распиловка керна' : 'Новое задание: распиловка керна'}
      </h1>
      {loadingTask ? (
        <p>Загрузка задания…</p>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 10 }}>
          <label>
            Скважина
            <select
              required
              value={selectedDrillingTaskId}
              onChange={(e) => setSelectedDrillingTaskId(e.target.value)}
            >
              <option value="">— выбрать —</option>
              {ownDrillingTasks.map((t) => (
                <option key={t.id} value={t.id}>
                  Скважина №{t.well_number}
                </option>
              ))}
            </select>
            {ownDrillingTasks.length === 0 && (
              <p className="text-muted" style={{ fontSize: 13 }}>
                На этом участке пока нет заданий на бурение — сначала создайте
                задание на бурение (распиловка ведётся только по своей скважине).
              </p>
            )}
          </label>

          <p className="text-muted" style={{ fontSize: 12.5 }}>
            Ответственного назначать не нужно — сводки по распиловке вносит тот
            же бригадир, что ведёт бурение этой скважины.
          </p>

          <label>
            Описание задания для бригадира
            <textarea
              rows={3}
              placeholder="Что делать, на что обратить внимание"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>

          {error && <p className="text-error">{error}</p>}

          <button
            type="submit"
            disabled={submitting || !selectedDrillingTaskId}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}
          >
            {submitting && <span className="spinner" style={{ marginRight: 0 }} />}
            {submitting ? 'Сохраняем…' : isEditMode ? 'Сохранить' : 'Создать задание'}
          </button>
        </form>
      )}
    </div>
  )
}
