import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { CheckCircle2, XCircle, MessageSquare } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { isManagement } from '../../types/roles'
import { loadReportSiteAndWellLabel } from '../../lib/reportLabel'
import type { CostItem, Report, ReportCost } from '../../types/database'

interface EnrichedCost extends ReportCost {
  categoryName: string
}

export default function ReportReview() {
  const { reportId } = useParams<{ reportId: string }>()
  const { session, profile, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  const [report, setReport] = useState<Report | null>(null)
  const [costs, setCosts] = useState<EnrichedCost[]>([])
  const [authorName, setAuthorName] = useState('—')
  const [siteName, setSiteName] = useState('—')
  const [wellLabel, setWellLabel] = useState('—')
  const [loading, setLoading] = useState(true)

  const [comment, setComment] = useState('')
  const [acting, setActing] = useState<'approve' | 'reject' | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!session || !reportId || !isManagement(profile?.role)) return

    async function load() {
      setLoading(true)
      const { data: r } = await supabase
        .from('reports')
        .select('*')
        .eq('id', reportId)
        .single()
      setReport(r)

      if (r) {
        const [authorRes, siteAndWell] = await Promise.all([
          supabase.from('profiles').select('full_name').eq('id', r.author_id).single(),
          loadReportSiteAndWellLabel(r),
        ])
        if (authorRes.data) setAuthorName(authorRes.data.full_name)
        setSiteName(siteAndWell.siteName)
        setWellLabel(siteAndWell.wellLabel)

        const { data: costsData } = await supabase
          .from('report_costs')
          .select('*')
          .eq('report_id', reportId)

        if (costsData && costsData.length > 0) {
          const itemIds = [...new Set(costsData.map((c) => c.cost_item_id))]
          const { data: items } = await supabase
            .from('cost_items')
            .select('*, cost_categories(name)')
            .in('id', itemIds)
          const itemMap = new Map(
            ((items ?? []) as (CostItem & { cost_categories: { name: string } | null })[]).map(
              (it) => [it.id, `${it.cost_categories?.name ?? '—'} — ${it.name}`],
            ),
          )
          setCosts(
            costsData.map((c) => ({
              ...c,
              categoryName: itemMap.get(c.cost_item_id) ?? '—',
            })),
          )
        } else {
          setCosts([])
        }
      }

      setLoading(false)
    }

    load()
  }, [session, reportId, profile])

  if (authLoading) return <p>Загрузка…</p>
  if (!session) return <Navigate to="/login" replace />
  if (!reportId) return <p>Не указана сводка.</p>
  if (!isManagement(profile?.role)) {
    return <p>Согласование доступно только гендиру/техдиру.</p>
  }

  async function handleDecision(decision: 'approve' | 'reject') {
    if (!profile || !reportId) return
    if (decision === 'reject' && !comment.trim()) {
      setError('При отклонении нужно указать причину.')
      return
    }
    setActing(decision)
    setError(null)

    const now = new Date().toISOString()
    const { error: updateError } = await supabase
      .from('reports')
      .update({
        approval_status: decision === 'approve' ? 'approved' : 'rejected',
        approved_by: profile.id,
        approved_at: now,
        review_comment: comment.trim() || null,
        // При отклонении открываем автору правку, чтобы он мог
        // исправить и отправить сводку заново (см. ТЗ).
        edit_unlocked: decision === 'reject',
      })
      .eq('id', reportId)

    setActing(null)

    if (updateError) {
      setError(updateError.message)
      return
    }
    navigate('/reports/pending')
  }

  return (
    <div style={{ maxWidth: 460 }}>
      <h1>Просмотр сводки</h1>

      {loading || !report ? (
        <p>Загрузка…</p>
      ) : (
        <>
          <div className="card" style={{ padding: 16, marginBottom: 16 }}>
            <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: 15 }}>
              {siteName}, {wellLabel}
            </p>
            <p style={{ margin: '0 0 4px' }}>
              <b>{authorName}</b>
            </p>
            <p className="text-muted num" style={{ margin: '0 0 12px', fontSize: 13.5 }}>
              {report.report_date}
              {report.shift_number ? `, смена ${report.shift_number}` : ''}
            </p>
            <div style={{ display: 'grid', gap: 6, fontSize: 14.5 }}>
              {report.hours_worked != null && (
                <p style={{ margin: 0 }}>
                  Часы работы: <span className="num">{report.hours_worked}</span>
                </p>
              )}
              {report.drilling_meters != null && (
                <p style={{ margin: 0 }}>
                  Метраж бурения: <span className="num">{report.drilling_meters} м</span>
                </p>
              )}
              {report.core_description_interval_to != null && (
                <p style={{ margin: 0 }}>
                  Описание керна:{' '}
                  <span className="num">
                    {report.core_description_interval_from}–{report.core_description_interval_to} м
                  </span>
                </p>
              )}
              {report.photofixation_interval_to != null && (
                <p style={{ margin: 0 }}>
                  Фотофиксация:{' '}
                  <span className="num">
                    {report.photofixation_interval_from}–{report.photofixation_interval_to} м
                  </span>
                </p>
              )}
              {report.sawn_meters != null && (
                <p style={{ margin: 0 }}>
                  Распилено: <span className="num">{report.sawn_meters} м</span>
                </p>
              )}
              {report.samples_taken != null && (
                <p style={{ margin: 0 }}>
                  Проб отобрано: <span className="num">{report.samples_taken}</span>
                </p>
              )}
              {report.samples_submitted != null && (
                <p style={{ margin: 0 }}>
                  Проб сдано в лабораторию: <span className="num">{report.samples_submitted}</span>
                </p>
              )}
            </div>
          </div>

          {report.shift_notes && (
            <p
              className="card"
              style={{
                display: 'flex',
                gap: 8,
                padding: 12,
                fontSize: 14,
                marginBottom: 16,
              }}
            >
              <MessageSquare size={16} className="text-faint" style={{ flexShrink: 0, marginTop: 2 }} />
              {report.shift_notes}
            </p>
          )}

          {costs.length > 0 && (
            <>
              <h2>Затраты</h2>
              <div className="card" style={{ padding: 4, marginBottom: 16 }}>
                <ul>
                  {costs.map((c) => (
                    <li key={c.id} style={{ padding: '9px 12px', display: 'flex', justifyContent: 'space-between' }}>
                      <span>{c.categoryName}</span>
                      <span className="num text-muted">{c.quantity ?? '—'}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          <label style={{ display: 'block', marginTop: 4 }}>
            Комментарий (обязателен при отклонении)
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              style={{ display: 'block', width: '100%' }}
            />
          </label>

          {error && <p className="text-error">{error}</p>}

          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              disabled={acting !== null}
              onClick={() => handleDecision('approve')}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {acting === 'approve' ? <span className="spinner" style={{ marginRight: 0 }} /> : <CheckCircle2 size={16} />}
              {acting === 'approve' ? 'Согласуем…' : 'Согласовать'}
            </button>
            <button
              type="button"
              className="btn-danger"
              disabled={acting !== null}
              onClick={() => handleDecision('reject')}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {acting === 'reject' ? <span className="spinner" style={{ marginRight: 0 }} /> : <XCircle size={16} />}
              {acting === 'reject' ? 'Отклоняем…' : 'Отклонить'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
