import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

interface Row {
  id: string
  edited_at: string
  reason: string
  editor_id: string | null
  changes: Record<string, { old: unknown; new: unknown }>
}

const LABELS: Record<string, string> = {
  drilling_meters: 'Метры',
  hours_worked: 'Часы',
  author_id: 'Мастер',
  shift_notes: 'Комментарий',
  report_date: 'Дата',
  shift_number: 'Смена',
  diameters: 'Диаметры',
  casings: 'Обсадка',
  costs: 'Затраты',
}

// Исправления согласованной сводки руководством (миграция 0035): кто, когда,
// что было → стало и причина. Видят руководство и составитель сводки.
export default function ReportEditLog({ reportId }: { reportId: string }) {
  const [rows, setRows] = useState<Row[]>([])
  const [names, setNames] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data } = await supabase.from('report_edit_log').select('id, edited_at, reason, editor_id, changes').eq('report_id', reportId).order('edited_at', { ascending: false })
      const list = (data ?? []) as Row[]
      const ids = new Set<string>()
      for (const r of list) {
        if (r.editor_id) ids.add(r.editor_id)
        const a = r.changes.author_id
        if (a) {
          ids.add(String(a.old))
          ids.add(String(a.new))
        }
      }
      let map: Record<string, string> = {}
      if (ids.size > 0) {
        const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', [...ids])
        map = Object.fromEntries((profs ?? []).map((p) => [p.id as string, p.full_name as string]))
      }
      if (!cancelled) {
        setRows(list)
        setNames(map)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [reportId])

  if (rows.length === 0) return null
  return (
    <>
      <h2>Исправления после согласования</h2>
      <div className="card" style={{ padding: 4, marginBottom: 16 }}>
        <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {rows.map((r) => (
            <li key={r.id} style={{ padding: '10px 12px', display: 'grid', gap: 2 }}>
              <span className="text-muted" style={{ fontSize: 12 }}>
                {new Date(r.edited_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })} · {names[r.editor_id ?? ''] ?? '—'}
              </span>
              {Object.entries(r.changes).map(([k, v]) => (
                <span key={k} style={{ fontSize: 13 }}>
                  <span className="text-muted">{LABELS[k] ?? k}: </span>
                  {k === 'diameters' || k === 'casings' || k === 'costs'
                    ? 'изменены'
                    : `${k === 'author_id' ? (names[String(v.old)] ?? '—') : String(v.old ?? '—')} → ${k === 'author_id' ? (names[String(v.new)] ?? '—') : String(v.new ?? '—')}`}
                </span>
              ))}
              <span style={{ fontSize: 12 }}>Причина: {r.reason}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}
