import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { ReportLogAction, ReportStatusLog } from '../types/database'
import { shortName } from '../lib/shortName'

const ACTION_LABEL: Record<ReportLogAction, { text: string; color: string }> = {
  submitted: { text: 'Отправлена на согласование', color: 'var(--color-primary)' },
  resubmitted: { text: 'Отправлена повторно после правки', color: 'var(--color-primary)' },
  approved: { text: 'Согласована', color: 'var(--color-success)' },
  rejected: { text: 'Отклонена', color: 'var(--color-danger)' },
  returned: { text: 'Возвращена мастеру на правку', color: 'var(--color-accent)' },
}

function formatDateTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// История согласования одной сводки: кто и когда отправил, согласовал,
// отклонил или вернул на правку, с комментариями (миграция 0030).
export default function ReportHistory({ reportId, reloadKey = 0 }: { reportId: string; reloadKey?: number }) {
  const [rows, setRows] = useState<(ReportStatusLog & { actorName: string })[] | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data } = await supabase
        .from('report_status_log')
        .select('*')
        .eq('report_id', reportId)
        .order('created_at', { ascending: true })
      const logs = (data ?? []) as ReportStatusLog[]
      const ids = [...new Set(logs.map((l) => l.actor_id).filter((x): x is string => !!x))]
      const names = new Map<string, string>()
      if (ids.length > 0) {
        const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', ids)
        for (const p of profs ?? []) names.set(p.id as string, shortName(p.full_name as string))
      }
      if (!cancelled) setRows(logs.map((l) => ({ ...l, actorName: l.actor_id ? (names.get(l.actor_id) ?? '—') : '—' })))
    }
    load()
    return () => {
      cancelled = true
    }
  }, [reportId, reloadKey])

  if (rows === null || rows.length === 0) return null

  return (
    <>
      <h2>История согласования</h2>
      <div className="card" style={{ padding: 4, marginBottom: 16 }}>
        <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {rows.map((r) => {
            const a = ACTION_LABEL[r.action]
            return (
              <li key={r.id} style={{ padding: '10px 12px', display: 'grid', gap: 2 }}>
                <span style={{ fontWeight: 600, color: a.color }}>{a.text}</span>
                <span className="text-muted" style={{ fontSize: 13 }}>
                  {r.actorName} · <span className="num">{formatDateTime(r.created_at)}</span>
                </span>
                {r.comment && <span style={{ fontSize: 14 }}>«{r.comment}»</span>}
              </li>
            )
          })}
        </ul>
      </div>
    </>
  )
}
