import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { isManagement } from '../../types/roles'
import type { Site } from '../../types/database'

// Доступ и видимый список регулируются на уровне БД (RLS, см.
// supabase/migrations/0002_rls_policies.sql) — здесь просто запрашиваем
// "все участки" и база сама отдаёт то, что разрешено текущей роли.
export default function SitesList() {
  const { session, profile, loading: authLoading } = useAuth()
  const [sites, setSites] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [newSiteName, setNewSiteName] = useState('')
  const [creating, setCreating] = useState(false)

  async function loadSites() {
    setLoading(true)
    const { data, error: fetchError } = await supabase
      .from('sites')
      .select('*')
      .order('created_at', { ascending: false })

    if (fetchError) setError(fetchError.message)
    else setSites(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    if (session) loadSites()
  }, [session])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    if (!newSiteName.trim() || !profile) return
    setCreating(true)
    setError(null)

    const { error: insertError } = await supabase.from('sites').insert({
      name: newSiteName.trim(),
      created_by: profile.id,
    })

    setCreating(false)

    if (insertError) {
      setError(insertError.message)
      return
    }
    setNewSiteName('')
    loadSites()
  }

  if (authLoading) return <p>Загрузка…</p>
  if (!session) return <Navigate to="/login" replace />

  return (
    <div>
      <h1>Участки работ</h1>

      {isManagement(profile?.role) && (
        <form
          onSubmit={handleCreate}
          style={{ display: 'flex', gap: 8, margin: '12px 0' }}
        >
          <input
            type="text"
            placeholder="Название участка"
            value={newSiteName}
            onChange={(e) => setNewSiteName(e.target.value)}
            required
          />
          <button type="submit" disabled={creating}>
            {creating ? 'Добавляем…' : 'Добавить участок'}
          </button>
        </form>
      )}

      {error && <p className="text-error">{error}</p>}

      {loading ? (
        <p>Загрузка списка…</p>
      ) : sites.length === 0 ? (
        <p>Пока нет доступных участков.</p>
      ) : (
        <ul>
          {sites.map((site) => (
            <li key={site.id}>
              <Link to={`/sites/${site.id}`}>{site.name}</Link>{' '}
              <span style={{ opacity: 0.6 }}>
                ({site.status === 'active' ? 'активен' : 'закрыт'})
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
