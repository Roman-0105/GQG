import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Mountain, Plus, ChevronRight } from 'lucide-react'
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
          style={{
            display: 'flex',
            gap: 8,
            margin: '0 0 22px',
            flexWrap: 'wrap',
            padding: 14,
            alignItems: 'flex-end',
          }}
        >
          <label style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
            Новый участок
            <input
              type="text"
              placeholder="Название участка"
              value={newSiteName}
              onChange={(e) => setNewSiteName(e.target.value)}
              required
            />
          </label>
          <button type="submit" disabled={creating} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {creating ? <span className="spinner" style={{ marginRight: 0 }} /> : <Plus size={16} />}
            {creating ? 'Добавляем…' : 'Добавить'}
          </button>
        </form>
      )}

      {error && <p className="text-error">{error}</p>}

      {loading ? (
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: 64, borderRadius: 'var(--radius-md)' }} />
          ))}
        </div>
      ) : sites.length === 0 ? (
        <p className="text-muted">Пока нет доступных участков.</p>
      ) : (
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
          {sites.map((site, i) => (
            <motion.div
              key={site.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: Math.min(i, 8) * 0.035, ease: [0.16, 1, 0.3, 1] }}
            >
              <Link
                to={`/sites/${site.id}`}
                className="site-card card"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '14px 16px',
                }}
              >
                <span
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 9,
                    background: 'var(--color-accent-soft)',
                    color: 'var(--color-accent)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Mountain size={17} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      display: 'block',
                      fontFamily: 'var(--font-display)',
                      fontWeight: 600,
                      fontSize: 16,
                      color: 'var(--color-text)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {site.name}
                  </span>
                  <span className={`badge badge-${site.status === 'active' ? 'primary' : 'neutral'}`} style={{ marginTop: 4 }}>
                    {site.status === 'active' ? 'активен' : 'закрыт'}
                  </span>
                </span>
                <ChevronRight size={18} className="text-faint" style={{ flexShrink: 0 }} />
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
