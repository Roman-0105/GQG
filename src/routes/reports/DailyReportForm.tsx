import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ChevronLeft, MessageCircle, Check } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { buildDrillingShiftMessage } from '../../lib/whatsappMessage'
import { TASK_TYPE_REPORT_COLUMN, type TaskType } from '../../types/taskType'
import type {
  CoreDescriptionTask,
  CoreSawingTask,
  CostCategory,
  DrillingTask,
  SamplingTask,
} from '../../types/database'
import CostRowsEditor, {
  emptyCostRow,
  type CostRow,
} from '../../components/CostRowsEditor'

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

// Посменная сводка — см. ТЗ v0.7, раздел 3-4. Суточная сводка отдельно
// НЕ заполняется, считается на фронтенде агрегацией посменных (позже,
// на экране просмотра — этот PR закрывает только ввод/правку).
// reportId в URL — режим редактирования (только для черновиков/
// разблокированных сводок, см. RLS reports_update_own_when_editable).
//
// Распиловка керна (core-sawing) и опробование (sampling) добавлены
// 17.09.2026 по разбору реального отчёта заказчику — см. миграцию 0007
// и CLAUDE.md. У распиловки смены называются "День"/"Ночь", а не "1-я"/
// "2-я" — те же shift_number 1/2, просто другая подпись. У опробования
// смен нет вообще (одна запись в день).
export default function DailyReportForm() {
  const { taskType, taskId, reportId } = useParams<{
    taskType: TaskType
    taskId: string
    reportId?: string
  }>()
  const isEditMode = Boolean(reportId)
  const { session, profile, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [drillingTask, setDrillingTask] = useState<DrillingTask | null>(null)
  const [coreTask, setCoreTask] = useState<CoreDescriptionTask | null>(null)
  const [sawingTask, setSawingTask] = useState<CoreSawingTask | null>(null)
  const [samplingTask, setSamplingTask] = useState<SamplingTask | null>(null)
  // Скважина, связанная через drilling_task_id — нужна для подписи
  // (распиловка всегда "своя", опробование может быть "своим").
  const [linkedDrillingTask, setLinkedDrillingTask] = useState<DrillingTask | null>(null)
  const [loadingTask, setLoadingTask] = useState(true)

  const [categories, setCategories] = useState<CostCategory[]>([])
  const [costRows, setCostRows] = useState<CostRow[]>([emptyCostRow()])

  const [shiftNotes, setShiftNotes] = useState('')
  const [reportDate, setReportDate] = useState(todayIso())
  const shiftFromQuery = searchParams.get('shift')
  const [shiftNumber, setShiftNumber] = useState<'1' | '2' | ''>(
    shiftFromQuery === '2' ? '2' : '1',
  )
  const [hoursWorked, setHoursWorked] = useState('')
  const [drillingMeters, setDrillingMeters] = useState('')
  const [coreFrom, setCoreFrom] = useState('0')
  const [coreTo, setCoreTo] = useState('')
  const [photoFrom, setPhotoFrom] = useState('0')
  const [photoTo, setPhotoTo] = useState('')
  const [sawnMeters, setSawnMeters] = useState('')
  const [samplesTaken, setSamplesTaken] = useState('')
  const [samplesSubmitted, setSamplesSubmitted] = useState('')

  const [submitting, setSubmitting] = useState<'draft' | 'submit' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  // React обновляет disabled на кнопке асинхронно — на быстрый повторный
  // тап/клик (типично на телефоне в поле) это не успевает среагировать,
  // и handleSubmit запускается дважды параллельно. Второй запуск после
  // того, как первый уже перевёл сводку в submitted (edit_unlocked снят),
  // не проходит RLS при апдейте и падает с "Cannot coerce the result to
  // a single JSON object" (0 строк). Синхронный ref — реальная защита от
  // повторного запуска, а не только визуальная.
  const submittingRef = useRef(false)

  // Забой (метраж, накопленный к текущей смене) для сообщения в WhatsApp —
  // сумма уже ПОДТВЕРЖДЁННЫХ смен по заданию, без учёта текущей формы
  // (см. отзыв 17.09.2026 — бригадиры дублируют сводку в рабочий чат).
  const [priorApprovedMeters, setPriorApprovedMeters] = useState(0)
  const [copied, setCopied] = useState(false)

  const shiftsApply =
    taskType === 'drilling' || taskType === 'core-sawing'
      ? true
      : taskType === 'core-description'
        ? (coreTask?.shift_enabled ?? true)
        : false // sampling — одна запись в день, без смен

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

        const { data: approvedRows } = await supabase
          .from('reports')
          .select('drilling_meters')
          .eq('drilling_task_id', taskId)
          .eq('approval_status', 'approved')
        setPriorApprovedMeters(
          (approvedRows ?? []).reduce((s, r) => s + (r.drilling_meters ?? 0), 0),
        )
      } else if (taskType === 'core-description') {
        const { data } = await supabase
          .from('core_description_tasks')
          .select('*')
          .eq('id', taskId)
          .single()
        setCoreTask(data)
      } else if (taskType === 'core-sawing') {
        const { data } = await supabase
          .from('core_sawing_tasks')
          .select('*')
          .eq('id', taskId)
          .single()
        setSawingTask(data)
        if (data?.drilling_task_id) {
          const { data: linked } = await supabase
            .from('drilling_tasks')
            .select('*')
            .eq('id', data.drilling_task_id)
            .single()
          setLinkedDrillingTask(linked)
        }
      } else if (taskType === 'sampling') {
        const { data } = await supabase
          .from('sampling_tasks')
          .select('*')
          .eq('id', taskId)
          .single()
        setSamplingTask(data)
        if (data?.drilling_task_id) {
          const { data: linked } = await supabase
            .from('drilling_tasks')
            .select('*')
            .eq('id', data.drilling_task_id)
            .single()
          setLinkedDrillingTask(linked)
        }
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
          setSawnMeters(r.sawn_meters != null ? String(r.sawn_meters) : '')
          setSamplesTaken(r.samples_taken != null ? String(r.samples_taken) : '')
          setSamplesSubmitted(
            r.samples_submitted != null ? String(r.samples_submitted) : '',
          )
          setShiftNotes(r.shift_notes ?? '')
        }
        if (costsRes.data && costsRes.data.length > 0) {
          setCostRows(
            costsRes.data.map((c) => ({
              cost_category_id: c.cost_category_id,
              quantity: c.quantity != null ? String(c.quantity) : '',
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

  const description =
    drillingTask?.description ??
    coreTask?.description ??
    sawingTask?.description ??
    samplingTask?.description

  const wellLabel =
    taskType === 'drilling'
      ? `скважина №${drillingTask?.well_number ?? '…'}`
      : taskType === 'core-sawing'
        ? `скважина №${linkedDrillingTask?.well_number ?? '…'}`
        : taskType === 'sampling'
          ? samplingTask?.drilling_task_id
            ? `своя скважина №${linkedDrillingTask?.well_number ?? '…'}`
            : `скважина подрядчика №${samplingTask?.external_well_number ?? '…'}`
          : 'описание керна'

  async function handleSubmit(e: FormEvent, mode: 'draft' | 'submit') {
    e.preventDefault()
    if (!profile || !taskId || !taskType) return
    if (submittingRef.current) return
    submittingRef.current = true
    setSubmitting(mode)
    setError(null)
    setSuccessMsg(null)

    try {
      await doSubmit(mode)
    } finally {
      submittingRef.current = false
    }
  }

  async function doSubmit(mode: 'draft' | 'submit') {
    if (!profile || !taskId || !taskType) return
    const siteId =
      drillingTask?.site_id ?? coreTask?.site_id ?? sawingTask?.site_id ?? samplingTask?.site_id
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
      drilling_task_id: null as string | null,
      core_description_task_id: null as string | null,
      core_sawing_task_id: null as string | null,
      sampling_task_id: null as string | null,
      [TASK_TYPE_REPORT_COLUMN[taskType]]: taskId,
      site_id: siteId,
      author_id: profile.id,
      report_date: reportDate,
      shift_number: shiftsApply && shiftNumber ? Number(shiftNumber) : null,
      hours_worked: hoursWorked ? Number(hoursWorked) : null,
      drilling_meters:
        taskType === 'drilling' && drillingMeters ? Number(drillingMeters) : null,
      core_description_interval_from:
        taskType === 'core-description' && coreTo ? Number(coreFrom) : null,
      core_description_interval_to:
        taskType === 'core-description' && coreTo ? Number(coreTo) : null,
      photofixation_interval_from:
        taskType === 'core-description' && photoTo ? Number(photoFrom) : null,
      photofixation_interval_to:
        taskType === 'core-description' && photoTo ? Number(photoTo) : null,
      sawn_meters: taskType === 'core-sawing' && sawnMeters ? Number(sawnMeters) : null,
      samples_taken: taskType === 'sampling' && samplesTaken ? Number(samplesTaken) : null,
      samples_submitted:
        taskType === 'sampling' && samplesSubmitted ? Number(samplesSubmitted) : null,
      shift_notes: shiftNotes.trim() || null,
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
      // PGRST116 здесь означает, что UPDATE не задел ни одной строки — RLS
      // больше не считает сводку редактируемой (например, статус успели
      // поменять в другом месте, пока эта вкладка была открыта).
      setError(
        saveError?.code === 'PGRST116'
          ? 'Не удалось сохранить: сводка больше не редактируется (статус уже изменился). Обновите страницу и проверьте её текущее состояние.'
          : (saveError?.message ?? 'Не удалось сохранить сводку'),
      )
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
        .update({
          approval_status: 'submitted',
          submitted_at: now,
          // Сброс следов прошлого отклонения при повторной отправке —
          // иначе старый комментарий и разблокировка "зависли" бы навсегда.
          edit_unlocked: false,
          review_comment: null,
        })
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

  async function handleCopyWhatsApp() {
    const meters = drillingMeters ? Number(drillingMeters) : 0
    const message = buildDrillingShiftMessage({
      wellNumber: drillingTask?.well_number ?? '?',
      rigNumber: drillingTask?.rig_number ?? null,
      reportDate,
      shiftNumber: shiftsApply && shiftNumber ? Number(shiftNumber) : null,
      meters,
      bottomHole: priorApprovedMeters + meters,
      shiftNotes,
    })
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Не удалось скопировать — скопируйте текст вручную.')
    }
  }

  return (
    <div style={{ maxWidth: 420 }}>
      <Link
        to={`/tasks/${taskType}/${taskId}/reports`}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13.5, marginBottom: 10 }}
      >
        <ChevronLeft size={15} /> Все сводки
      </Link>
      <h1>
        {isEditMode ? 'Правка сводки' : 'Сводка за смену'} — {wellLabel}
      </h1>

      {!loadingTask && description && (
        <p
          className="text-muted"
          style={{
            background: 'var(--color-surface-muted)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            padding: 12,
            fontSize: 14,
            marginBottom: 14,
          }}
        >
          {description}
        </p>
      )}

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
                {taskType === 'core-sawing' ? (
                  <>
                    <option value="1">День</option>
                    <option value="2">Ночь</option>
                  </>
                ) : (
                  <>
                    <option value="1">1-я</option>
                    <option value="2">2-я</option>
                  </>
                )}
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
              {drillingTask?.planned_daily_meters != null && (
                <span className="text-muted" style={{ fontWeight: 400 }}>
                  {' '}
                  (план: {drillingTask.planned_daily_meters} м/сутки)
                </span>
              )}
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
                  style={{ width: 80 }}
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
                  style={{ width: 80 }}
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

          {taskType === 'core-sawing' && (
            <label>
              Распилено за смену, м
              <input
                type="number"
                step="any"
                value={sawnMeters}
                onChange={(e) => setSawnMeters(e.target.value)}
              />
            </label>
          )}

          {taskType === 'sampling' && (
            <>
              <label>
                Проб отобрано
                <input
                  type="number"
                  step="1"
                  value={samplesTaken}
                  onChange={(e) => setSamplesTaken(e.target.value)}
                />
              </label>
              <label>
                Проб сдано в лабораторию
                <input
                  type="number"
                  step="1"
                  value={samplesSubmitted}
                  onChange={(e) => setSamplesSubmitted(e.target.value)}
                />
              </label>
            </>
          )}

          <label>
            Что сделано за смену
            <textarea
              rows={3}
              placeholder="Например: метраж 5 из 10 по плану — отставание из-за замены коронки и подъёма снаряда"
              value={shiftNotes}
              onChange={(e) => setShiftNotes(e.target.value)}
            />
          </label>

          {taskType === 'drilling' && (
            <button
              type="button"
              className="btn-outline"
              onClick={handleCopyWhatsApp}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}
            >
              {copied ? <Check size={16} /> : <MessageCircle size={16} />}
              {copied ? 'Скопировано' : 'Скопировать для WhatsApp'}
            </button>
          )}

          <CostRowsEditor
            rows={costRows}
            categories={categories}
            onChange={setCostRows}
          />

          {error && <p className="text-error">{error}</p>}
          {successMsg && <p className="text-success">{successMsg}</p>}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-outline"
              disabled={submitting !== null}
              onClick={(e) => handleSubmit(e, 'draft')}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {submitting === 'draft' && <span className="spinner" style={{ marginRight: 0 }} />}
              {submitting === 'draft' ? 'Сохраняем…' : 'Сохранить черновик'}
            </button>
            <button
              type="button"
              disabled={submitting !== null}
              onClick={(e) => handleSubmit(e, 'submit')}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {submitting === 'submit' && <span className="spinner" style={{ marginRight: 0 }} />}
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
