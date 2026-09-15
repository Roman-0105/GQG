import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { isManagement } from '../../types/roles'
import type { CoreDescriptionTask, DrillingTask, Site } from '../../types/database'

const TASK_STATUS_LABELS: Record<DrillingTask['status'], string> = {
  planned: 'запланировано',
  in_progress: 'в работе',
  suspended: 'приостановлено',
  completed: 'завершено',
}

export default function SiteDetail() {
  const { siteId } = useParams<{ siteId: string }>()
  const { session, profile, loading: authLoading } = useAuth()

  const [site, setSite] = useState<Site | null>(null)
  const [drillingTasks, setDrillingTasks] = useState<DrillingTask[]>([])
  const [coreTasks, setCoreTasks] = useState<CoreDescriptionTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!session || !siteId) return

    async function load() {
      setLoading(true)
      const [siteRes, drillingRes, coreRes] = await Promise.all([
        supabase.from('sites').select('*').eq('id', siteId).single(),
        supabase
          .from('drilling_tasks')
          .select('*')
          .eq('site_id', siteId)
          .order('created_at', { ascending: false }),
        supabase
          .from('core_description_tasks')
          .select('*')
          .eq('site_id', siteId)
          .order('created_at', { ascending: false }),
      ])

      if (siteRes.error) setError(siteRes.error.message)
      else setSite(siteRes.data)

      if (drillingRes.error) setError(drillingRes.error.message)
      else setDrillingTasks(drillingRes.data ?? [])

      if (coreRes.error) setError(coreRes.error.message)
      else setCoreTasks(coreRes.data ?? [])

      setLoading(false)
    }

    load()
  }, [session, siteId])

  if (authLoading) return <p>Загрузка…</p>
  if (!session) return <Navigate to="/login" replace />
  if (!siteId) return <p>Не указан участок.</p>

  return (
    <div>
      <p>
        <Link to="/sites">← Все участки</Link>
      </p>

      {error && <p style={{ color: '#c0392b' }}>{error}</p>}

      {loading ? (
        <p>Загрузка…</p>
      ) : !site ? (
        <p>Участок не найден или недоступен.</p>
      ) : (
        <>
          <h1>{site.name}</h1>
          <p style={{ opacity: 0.7 }}>
            {site.status === 'active' ? 'Активен' : 'Закрыт'}
          </p>

          {isManagement(profile?.role) && (
            <div style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
              <Link to={`/sites/${siteId}/tasks/drilling/new`}>
                <button type="button">+ Задание: бурение</button>
              </Link>
              <Link to={`/sites/${siteId}/tasks/core-description/new`}>
                <button type="button">+ Задание: описание керна</button>
              </Link>
            </div>
          )}

          <h2>Бурение скважин</h2>
          {drillingTasks.length === 0 ? (
            <p>Пока нет заданий на бурение.</p>
          ) : (
            <ul>
              {drillingTasks.map((t) => (
                <li key={t.id}>
                  Скважина №{t.well_number} —{' '}
                  {TASK_STATUS_LABELS[t.status]}
                </li>
              ))}
            </ul>
          )}

          <h2>Описание керна</h2>
          {coreTasks.length === 0 ? (
            <p>Пока нет заданий на описание керна.</p>
          ) : (
            <ul>
              {coreTasks.map((t) => (
                <li key={t.id}>
                  {t.drilling_task_id
                    ? 'Своя скважина'
                    : `Скважина подрядчика №${t.external_well_number}`}
                  {t.shift_enabled ? '' : ' (без смен)'}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
