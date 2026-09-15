import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import type { CoreDescriptionTask, CostCategory, DrillingTask } from '../../types/database'
import CostRowsEditor, {
  emptyCostRow,
  type CostRow,
} from '../../components/CostRowsEditor'

type TaskType = 'drilling' | 'core-description'

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

// Посменная сводка — см. ТЗ v0.7, раздел 3-4. Суточная сводка отдельно
// НЕ заполняется, считается на фронтенде агрегацией посменных (позже,
// на экране просмотра — этот PR закрывает только ввод/правку).
// reportId в URL — режим редактирования (только для черновиков/
// разблокированных сводок, см. RLS reports_update_own_when_editable).
export default function DailyReportForm() {
  const { taskType, taskId, reportId } = useParams<{
    taskType: TaskType
    taskId: string
    reportId?: string
  }>()
  const isEditMode = Boolean(reportId)
  const { session, profile, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  const [drillingTask, setDrillingTask] = useState<DrillingTask | null>(null)
  const [coreTask, setCoreTask] = useState<CoreDescriptionTask | null>(null)
  const [loadingTask, setLoadingTask] = useState(true)

  const [categories, setCategories] = useState<CostCategory[]>([])
  const [costRows, setCostRows] = useState<CostRow[]>([emptyCostRow()])

  const [reportDate, setReportDate] = useState(todayIso())
  const [shiftNumber, setShiftNumber] = useState<'1' | '2' | ''>('1')
  const [hoursWorked, setHoursWorked] = useState('')
  const [drillingMeters, setDrillingMeters] = useState('')
  const [coreFrom, setCoreFrom] = useState('0')
  const [coreTo, setCoreTo] = useState('')
  const [photoFrom, setPhotoFrom] = useState('0')
  const [photoTo, setPhotoTo] = useState('')

  const [submitting, setSubmitting] = useState<'draft' | 'submit' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const shiftsApply =
    taskType === 'drilling' ? true : (coreTask?.shift_enabled ?? true)

  useEffect(() => {
    if (!session || !taskId || !taskType) return

    async function load() {
      setLoadingTask(true)

      const catRes = await supabase.from('cost_categories').select('*').order('name')
      if (catRes.data) setCategories(catRes.data)

      if (taskType === 'drilling') {
        const { data } = await supabase
          .from('drilling_tasks')
          .select('*')
          .eq('id', taskId)
          .single()
        setDrillingTask(data)
      } else {
        const { data } = await supabase
          .from('core_description_tasks')
          .select('*')
          .eq('id', taskId)
          .single()
        setCoreTask(data)
      }

      if (reportId) {
        // Режим редактирования — подгружаем существующую сводку и её затраты.
        const [reportRes, costsRes] = await Promise.all([
          supabase.from('reports').select('*').eq('id', reportId).single(),
          supabase
            .from('report_costs')
            .select('*')
            .eq('report_id', reportId),
        ])

        if (reportRes.data) {
          const r = reportRes.data
          setReportDate(r.report_date)
          setShiftNumber(r.shift_number ? (String(r.shift_number) as '1' | '2') : '')
          setHoursWorked(r.hours_worked != null ? String(r.hours_worked) : '')
          setDrillingMeters(
            r.drilling_meters != null ? String(r.drilling_meters) : '',
          )
          setCoreFrom(
            r.core_description_interval_from != null
              ? String(r.core_description_interval_from)
              : '0',
          )
          setCoreTo(
            r.core_description_interval_to != null
              ? String(r.core_description_interval_to)
              : '',
          )
          setPhotoFrom(
            r.photofixation_interval_from != null
              ? String(r.photofixation_interval_from)
              : '0',
          )
          setPhotoTo(
            r.photofixation_interval_to != null
              ? String(r.photofixation_interval_to)
              : '',
          )
        }
        if (costsRes.data && costsRes.data.length > 0) {
          setCostRows(
            costsRes.data.map((c) => ({
              cost_category_id: c.cost_category_id,
              quantity: c.quantity != null ? String(c.quantity) : '',
              amount: c.amount != null ? String(c.amount) : '',
            })),
          )
        }
      } else if (taskType === 'core-description') {
        // Новая сводка — автоподстановка "от" из последнего "до" по заданию.
        const { data: lastReport } = await supabase
          .from('reports')
          .select('core_description_interval_to, photofixation_interval_to')
          .eq('core_description_task_id', taskId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (lastReport) {
          setCoreFrom(String(lastReport.core_description_interval_to ?? 0))
          setPhotoFrom(String(lastReport.photofixation_interval_to ?? 0))
        }
      }

      setLoadingTask(false)
    }

    load()
  }, [session, taskId, taskType, reportId])

  if (authLoading) return <p>Загрузка…</p>
  if (!session) return <Navigate to="/login" replace />
  if (!taskId || !taskType) return <p>Не указано задание.</p>
  if (profile && profile.role !== 'party_chief') {
    return <p>Сводки вносит только начальник буровой партии.</p>
  }

  async function handleSubmit(e: FormEvent, mode: 'draft' | 'submit') {
    e.preventDefault()
    if (!profile || !taskId) return
    setSubmitting(mode)
    setError(null)
    setSuccessMsg(null)

    const siteId =
      taskType === 'drilling' ? drillingTask?.site_id : coreTask?.site_id
    if (!siteId) {
      setError('Не удалось определить участок задания.')
      setSubmitting(null)
      return
    }

    // Затраты пишутся только пока сводка ЧЕРНОВИК (так требует RLS —
    // это намеренно, чтобы нельзя было незаметно поменять затраты в уже
    // отправленной сводке). Поэтому даже при "Отправить на согласование"
    // сначала сохраняем как draft, пишем затраты, и лишь ПОСЛЕ этого
    // отдельным запросом переключаем approval_status на submitted.
    const fields = {
      drilling_task_id: taskType === 'drilling' ? taskId : null,
      core_description_task_id:
        taskType === 'core-description' ? taskId : null,
      site_id: siteId,
      author_id: profile.id,
      report_date: reportDate,
      shift_number: shiftsApply && shiftNumber ? Number(shiftNumber) : null,
      hours_worked: hoursWorked ? Number(hoursWorked) : null,
      drilling_meters:
        taskType === 'drilling' && drillingMeters
          ? Number(drillingMeters)
          : null,
      core_description_interval_from:
        taskType === 'core-description' && coreTo ? Number(coreFrom) : null,
      core_description_interval_to:
        taskType === 'core-description' && coreTo ? Number(coreTo) : null,
      photofixation_interval_from:
        taskType === 'core-description' && photoTo ? Number(photoFrom) : null,
      photofixation_interval_to:
        taskType === 'core-description' && photoTo ? Number(photoTo) : null,
      approval_status: 'draft' as const,
      submitted_at: null,
    }

    const { data: report, error: saveError } = isEditMode
      ? await supabase
          .from('reports')
          .update(fields)
          .eq('id', reportId)
          .select()
          .single()
      : await supabase.from('reports').insert(fields).select().single()

    if (saveError || !report) {
      setError(saveError?.message ?? 'Не удалось сохранить сводку')
      setSubmitting(null)
      return
    }

    // Затраты: при редактировании проще всего снести старые строки
    // и записать текущее состояние формы заново, чем сверять построчно.
    if (isEditMode) {
      const { error: deleteError } = await supabase
        .from('report_costs')
        .delete()
        .eq('report_id', report.id)
      if (deleteError) {
        setError(`Сводка сохранена, но не удалось обновить затраты: ${deleteError.message}`)
        setSubmitting(null)
        return
      }
    }

    const validCosts = costRows.filter((c) => c.cost_category_id)
    if (validCosts.length > 0) {
      const { error: costsError } = await supabase.from('report_costs').insert(
        validCosts.map((c) => ({
          report_id: report.id,
          cost_category_id: c.cost_category_id,
          quantity: c.quantity ? Number(c.quantity) : null,
          amount: c.amount ? Number(c.amount) : null,
        })),
      )
      if (costsError) {
        setError(
          `Сводка сохранена, но не удалось сохранить затраты: ${costsError.message}`,
        )
        setSubmitting(null)
        return
      }
    }

    if (mode === 'submit') {
      const now = new Date().toISOString()
      const { error: submitError } = await supabase
        .from('reports')
        .update({ approval_status: 'submitted', submitted_at: now })
        .eq('id', report.id)
      if (submitError) {
        setError(
          `Сводка и затраты сохранены как черновик, но не удалось отправить на согласование: ${submitError.message}`,
        )
        setSubmitting(null)
        return
      }
    }

    setSubmitting(null)
    if (mode === 'submit') {
      setSuccessMsg('Сводка отправлена на согласование.')
    } else {
      navigate(`/tasks/${taskType}/${taskId}/reports`)
      return
    }
  }

  return (
    <div style={{ maxWidth: 420 }}>
      <h1>
        {isEditMode ? 'Правка сводки' : 'Сводка за смену'} —{' '}
        {taskType === 'drilling'
          ? `скважина №${drillingTask?.well_number ?? '…'}`
          : 'описание керна'}
      </h1>

      {loadingTask ? (
        <p>Загрузка задания…</p>
      ) : (
        <form style={{ display: 'grid', gap: 10 }}>
          <label>
            Дата
            <input
              type="date"
              value={reportDate}
              onChange={(e) => setReportDate(e.target.value)}
              required
            />
          </label>

          {shiftsApply && (
            <label>
              Смена
              <select
                value={shiftNumber}
                onChange={(e) => setShiftNumber(e.target.value as '1' | '2')}
              >
                <option value="1">1-я</option>
                <option value="2">2-я</option>
              </select>
            </label>
          )}

          <label>
            Часы работы
            <input
              type="number"
              step="any"
              value={hoursWorked}
              onChange={(e) => setHoursWorked(e.target.value)}
            />
          </label>

          {taskType === 'drilling' && (
            <label>
              Метраж бурения за смену, м
              <input
                type="number"
                step="any"
                value={drillingMeters}
                onChange={(e) => setDrillingMeters(e.target.value)}
              />
            </label>
          )}

          {taskType === 'core-description' && (
            <>
              <fieldset>
                <legend>Описание керна, интервал</legend>
                <input
                  type="number"
                  step="any"
                  placeholder="от"
                  value={coreFrom}
                  readOnly
                  title="Подставляется автоматически из предыдущей сводки"
                  style={{ width: 80, opacity: 0.7 }}
                />
                <input
                  type="number"
                  step="any"
                  placeholder="до"
                  value={coreTo}
                  onChange={(e) => setCoreTo(e.target.value)}
                  style={{ width: 80 }}
                />
              </fieldset>
              <fieldset>
                <legend>Фотофиксация керна, интервал</legend>
                <input
                  type="number"
                  step="any"
                  placeholder="от"
                  value={photoFrom}
                  readOnly
                  title="Подставляется автоматически из предыдущей сводки"
                  style={{ width: 80, opacity: 0.7 }}
                />
                <input
                  type="number"
                  step="any"
                  placeholder="до"
                  value={photoTo}
                  onChange={(e) => setPhotoTo(e.target.value)}
                  style={{ width: 80 }}
                />
              </fieldset>
            </>
          )}

          <CostRowsEditor
            rows={costRows}
            categories={categories}
            onChange={setCostRows}
          />

          {error && <p style={{ color: '#c0392b' }}>{error}</p>}
          {successMsg && <p style={{ color: '#2e7d32' }}>{successMsg}</p>}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              disabled={submitting !== null}
              onClick={(e) => handleSubmit(e, 'draft')}
            >
              {submitting === 'draft' ? 'Сохраняем…' : 'Сохранить черновик'}
            </button>
            <button
              type="button"
              disabled={submitting !== null}
              onClick={(e) => handleSubmit(e, 'submit')}
            >
              {submitting === 'submit'
                ? 'Отправляем…'
                : 'Отправить на согласование'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
