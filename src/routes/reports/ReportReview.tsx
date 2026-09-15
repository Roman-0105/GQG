import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { isManagement } from '../../types/roles'
import type { CostCategory, Report, ReportCost } from '../../types/database'

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
        const { data: authorProfile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', r.author_id)
          .single()
        if (authorProfile) setAuthorName(authorProfile.full_name)

        const { data: costsData } = await supabase
          .from('report_costs')
          .select('*')
          .eq('report_id', reportId)

        if (costsData && costsData.length > 0) {
          const categoryIds = [
            ...new Set(costsData.map((c) => c.cost_category_id)),
          ]
          const { data: categories } = await supabase
            .from('cost_categories')
            .select('*')
            .in('id', categoryIds)
          const catMap = new Map(
            ((categories ?? []) as CostCategory[]).map((c) => [c.id, c.name]),
          )
          setCosts(
            costsData.map((c) => ({
              ...c,
              categoryName: catMap.get(c.cost_category_id) ?? '—',
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
    <div style={{ maxWidth: 420 }}>
      <h1>Просмотр сводки</h1>

      {loading || !report ? (
        <p>Загрузка…</p>
      ) : (
        <>
          <p>Автор: {authorName}</p>
          <p>
            Дата: {report.report_date}
            {report.shift_number ? `, смена ${report.shift_number}` : ''}
          </p>
          {report.hours_worked != null && <p>Часы работы: {report.hours_worked}</p>}
          {report.drilling_meters != null && (
            <p>Метраж бурения: {report.drilling_meters} м</p>
          )}
          {report.core_description_interval_to != null && (
            <p>
              Описание керна: {report.core_description_interval_from}–
              {report.core_description_interval_to} м
            </p>
          )}
          {report.photofixation_interval_to != null && (
            <p>
              Фотофиксация: {report.photofixation_interval_from}–
              {report.photofixation_interval_to} м
            </p>
          )}

          {costs.length > 0 && (
            <>
              <h2>Затраты</h2>
              <ul>
                {costs.map((c) => (
                  <li key={c.id}>
                    {c.categoryName}: {c.quantity ?? '—'} / {c.amount ?? '—'} ₽
                  </li>
                ))}
              </ul>
            </>
          )}

          <label style={{ display: 'block', marginTop: 16 }}>
            Комментарий (обязателен при отклонении)
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              style={{ display: 'block', width: '100%' }}
            />
          </label>

          {error && <p style={{ color: '#c0392b' }}>{error}</p>}

          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button
              type="button"
              disabled={acting !== null}
              onClick={() => handleDecision('approve')}
            >
              {acting === 'approve' ? 'Согласуем…' : 'Согласовать'}
            </button>
            <button
              type="button"
              disabled={acting !== null}
              onClick={() => handleDecision('reject')}
            >
              {acting === 'reject' ? 'Отклоняем…' : 'Отклонить'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
