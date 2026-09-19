import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ClipboardCheck, ChevronRight, PartyPopper } from 'lucide-react'
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
      const sawingTaskIds = [
        ...new Set(list.map((r) => r.core_sawing_task_id).filter(Boolean)),
      ] as string[]
      const samplingTaskIds = [
        ...new Set(list.map((r) => r.sampling_task_id).filter(Boolean)),
      ] as string[]

      const [authorsRes, sitesRes, drillingRes, coreRes, sawingRes, samplingRes] = await Promise.all([
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
              .select('id, external_well_number, drilling_task_id, documentation_type')
              .in('id', coreTaskIds)
          : Promise.resolve({ data: [] }),
        sawingTaskIds.length
          ? supabase.from('core_sawing_tasks').select('id, drilling_task_id').in('id', sawingTaskIds)
          : Promise.resolve({ data: [] }),
        samplingTaskIds.length
          ? supabase
              .from('sampling_tasks')
              .select('id, external_well_number, drilling_task_id')
              .in('id', samplingTaskIds)
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
          `${c.documentation_type === 'geological' ? 'геол.' : 'геотех.'} документация, ` +
            (c.drilling_task_id
              ? `своя скв. №${drillingMap.get(c.drilling_task_id) ?? '?'}`
              : `подрядчик, скв. №${c.external_well_number}`),
        ]),
      )
      const sawingMap = new Map(
        (sawingRes.data ?? []).map((s) => [
          s.id,
          `распиловка, скв. №${drillingMap.get(s.drilling_task_id) ?? '?'}`,
        ]),
      )
      const samplingMap = new Map(
        (samplingRes.data ?? []).map((s) => [
          s.id,
          `опробование, ${
            s.drilling_task_id
              ? `своя скв. №${drillingMap.get(s.drilling_task_id) ?? '?'}`
              : `подрядчик, скв. №${s.external_well_number}`
          }`,
        ]),
      )

      const enriched: EnrichedReport[] = list.map((r) => ({
        ...r,
        authorName: authorMap.get(r.author_id) ?? '—',
        siteName: siteMap.get(r.site_id) ?? '—',
        wellLabel: r.drilling_task_id
          ? `бурение, скв. №${drillingMap.get(r.drilling_task_id) ?? '?'}`
          : r.core_description_task_id
            ? (coreMap.get(r.core_description_task_id) ?? 'описание керна')
            : r.core_sawing_task_id
              ? (sawingMap.get(r.core_sawing_task_id) ?? 'распиловка керна')
              : (samplingMap.get(r.sampling_task_id ?? '') ?? 'опробование'),
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
      <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <ClipboardCheck size={26} className="text-muted" /> Сводки на согласовании
      </h1>
      {error && <p className="text-error">{error}</p>}
      {loading ? (
        <div style={{ display: 'grid', gap: 8 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: 56, borderRadius: 'var(--radius-md)' }} />
          ))}
        </div>
      ) : reports.length === 0 ? (
        <div className="card" style={{ padding: 28, textAlign: 'center', color: 'var(--color-text-muted)' }}>
          <PartyPopper size={28} style={{ marginBottom: 8, color: 'var(--color-success)' }} />
          <p style={{ margin: 0 }}>Пока нет сводок, ожидающих согласования.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {reports.map((r, i) => (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: Math.min(i, 10) * 0.03, ease: [0.16, 1, 0.3, 1] }}
            >
              <Link
                to={`/reports/${r.id}/review`}
                className="card card-interactive"
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px' }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 700, fontSize: 14.5 }}>
                    {r.siteName}, {r.wellLabel}
                  </span>
                  <span className="text-muted" style={{ fontSize: 13 }}>
                    <span className="num">{r.report_date}</span>
                    {r.shift_number ? `, смена ${r.shift_number}` : ''} — {r.authorName}
                  </span>
                </span>
                <ChevronRight size={18} className="text-faint" />
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
