import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import type { Report } from '../types/database'

// Геологические подробности сводки (03.10.2026): пробы по видам из справочника
// и отметки «документация закончена» / «разбивка на опробование выполнена».
// Используется в просмотре сводки автором и на экране согласования.
export default function ReportGeologyExtras({ report }: { report: Report }) {
  const [rows, setRows] = useState<{ name: string; quantity: number }[]>([])

  useEffect(() => {
    if (report.sampling_task_id == null) return
    let cancelled = false
    supabase
      .from('report_samples')
      .select('quantity, sample_types(name)')
      .eq('report_id', report.id)
      .then(({ data }) => {
        if (cancelled) return
        const list = ((data ?? []) as unknown as { quantity: number; sample_types: { name: string } | null }[]).map((r) => ({
          name: r.sample_types?.name ?? '—',
          quantity: r.quantity,
        }))
        setRows(list)
      })
    return () => {
      cancelled = true
    }
  }, [report.id, report.sampling_task_id])

  const hasFlags = report.documentation_finished || report.sampling_layout_done
  if (rows.length === 0 && !hasFlags) return null

  return (
    <>
      {rows.length > 0 && (
        <div>
          <p style={{ margin: '0 0 2px' }}>Пробы по видам:</p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {rows.map((r) => (
              <li key={r.name}>
                {r.name} — <span className="num">{r.quantity}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {report.documentation_finished && (
        <p style={{ margin: 0 }}>
          <span className="badge badge-success">Документация закончена</span>
        </p>
      )}
      {report.sampling_layout_done && (
        <p style={{ margin: 0 }}>
          <span className="badge badge-primary">Разбивка на опробование выполнена</span>
        </p>
      )}
    </>
  )
}
