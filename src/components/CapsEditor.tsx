import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { isManagement, type UserRole } from '../types/roles'

export const CAP_LABELS: Record<string, { label: string; hint: string }> = {
  approve_reports: { label: 'Согласование сводок', hint: 'принимать и возвращать сводки' },
  corrections_db: { label: 'БД сводок', hint: 'исправлять согласованные сводки' },
  view_all_data: { label: 'Просмотр всех данных', hint: 'все участки, задания и сводки, только чтение' },
}

// Дополнительные права конкретного сотрудника (profile_caps). Для начальства
// (уровни 1–2) блок не нужен: у них есть всё. Менять может только начальство.
export default function CapsEditor({ profileId, role }: { profileId: string; role: UserRole }) {
  const { profile } = useAuth()
  const [granted, setGranted] = useState<Set<string>>(new Set())
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('profile_caps')
      .select('cap, allowed')
      .eq('profile_id', profileId)
      .then(({ data, error: err }) => {
        if (cancelled) return
        if (err) setError('Права недоступны: примените миграцию 0038.')
        setGranted(new Set((data ?? []).filter((r) => r.allowed).map((r) => r.cap as string)))
        setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [profileId])

  if (isManagement(role) || !isManagement(profile?.role)) return null

  async function toggle(cap: string, on: boolean) {
    setError(null)
    const { error: err } = on
      ? await supabase.from('profile_caps').upsert({ profile_id: profileId, cap, allowed: true, granted_by: profile?.id ?? null })
      : await supabase.from('profile_caps').delete().eq('profile_id', profileId).eq('cap', cap)
    if (err) return setError(err.message)
    setGranted((prev) => {
      const next = new Set(prev)
      if (on) next.add(cap)
      else next.delete(cap)
      return next
    })
  }

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <b style={{ fontSize: 13 }}>Дополнительные права</b>
      {Object.entries(CAP_LABELS).map(([cap, { label, hint }]) => (
        <label key={cap} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="checkbox"
            style={{ width: 'auto' }}
            disabled={!loaded}
            checked={granted.has(cap)}
            onChange={(e) => void toggle(cap, e.target.checked)}
          />
          <span>
            {label} <span className="text-muted" style={{ fontSize: 12 }}>— {hint}</span>
          </span>
        </label>
      ))}
      {error && <p className="text-error" style={{ margin: 0, fontSize: 12 }}>{error}</p>}
    </div>
  )
}
