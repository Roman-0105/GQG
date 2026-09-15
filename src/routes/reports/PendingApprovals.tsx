import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { isManagement } from '../../types/roles'
import type { Report } from '../../types/database'

interface EnrichedReport extends Report {
  authorName: string
  siteName: string
  wellLabel: string
}

export default function PendingApprovals() {
  const { session, profile, loading: authLoading } = useAuth()
  const [reports, setReports] = useState<EnrichedReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!session || !isManagement(profile?.role)) return

    async function load() {
      setLoading(true)
      const { data: pending, error: fetchError } = await supabase
        .from('reports')
        .select('*')
        .eq('approval_status', 'submitted')
        .order('submitted_at', { ascending: true })

      if (fetchError) {
        setError(fetchError.message)
        setLoading(false)
        return
      }

      const list = pending ?? []
      const authorIds = [...new Set(list.map((r) => r.author_id))]
      const siteIds = [...new Set(list.map((r) => r.site_id))]
      const drillingTaskIds = [
        ...new Set(list.map((r) => r.drilling_task_id).filter(Boolean)),
      ] as string[]
      const coreTaskIds = [
        ...new Set(
          list.map((r) => r.core_description_task_id).filter(Boolean),
        ),
      ] as string[]

      const [authorsRes, sitesRes, drillingRes, coreRes] = await Promise.all([
        authorIds.length
          ? supabase.from('profiles').select('id, full_name').in('id', authorIds)
          : Promise.resolve({ data: [] }),
        siteIds.length
          ? supabase.from('sites').select('id, name').in('id', siteIds)
          : Promise.resolve({ data: [] }),
        drillingTaskIds.length
          ? supabase
              .from('drilling_tasks')
              .select('id, well_number')
              .in('id', drillingTaskIds)
          : Promise.resolve({ data: [] }),
        coreTaskIds.length
          ? supabase
              .from('core_description_tasks')
              .select('id, external_well_number, drilling_task_id')
              .in('id', coreTaskIds)
          : Promise.resolve({ data: [] }),
      ])

      const authorMap = new Map(
        (authorsRes.data ?? []).map((a) => [a.id, a.full_name]),
      )
      const siteMap = new Map((sitesRes.data ?? []).map((s) => [s.id, s.name]))
      const drillingMap = new Map(
        (drillingRes.data ?? []).map((d) => [d.id, d.well_number]),
      )
      const coreMap = new Map(
        (coreRes.data ?? []).map((c) => [
          c.id,
          c.drilling_task_id
            ? `своя скв. №${drillingMap.get(c.drilling_task_id) ?? '?'}`
            : `подрядчик, скв. №${c.external_well_number}`,
        ]),
      )

      const enriched: EnrichedReport[] = list.map((r) => ({
        ...r,
        authorName: authorMap.get(r.author_id) ?? '—',
        siteName: siteMap.get(r.site_id) ?? '—',
        wellLabel: r.drilling_task_id
          ? `бурение, скв. №${drillingMap.get(r.drilling_task_id) ?? '?'}`
          : (coreMap.get(r.core_description_task_id ?? '') ??
            'описание керна'),
      }))

      setReports(enriched)
      setLoading(false)
    }

    load()
  }, [session, profile])

  if (authLoading) return <p>Загрузка…</p>
  if (!session) return <Navigate to="/login" replace />
  if (!isManagement(profile?.role)) {
    return <p>Согласование доступно только гендиру/техдиру.</p>
  }

  return (
    <div>
      <h1>Сводки на согласовании</h1>
      {error && <p style={{ color: '#c0392b' }}>{error}</p>}
      {loading ? (
        <p>Загрузка…</p>
      ) : reports.length === 0 ? (
        <p>Пока нет сводок, ожидающих согласования.</p>
      ) : (
        <ul>
          {reports.map((r) => (
            <li key={r.id}>
              <Link to={`/reports/${r.id}/review`}>
                {r.report_date}
                {r.shift_number ? `, смена ${r.shift_number}` : ''} —{' '}
                {r.siteName}, {r.wellLabel} — {r.authorName}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
