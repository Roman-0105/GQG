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
  CostItem,
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

type AttachedTaskColumn = 'core_description_task_id' | 'core_sawing_task_id' | 'sampling_task_id'

interface SiblingIds {
  geo: string | null
  geotech: string | null
  sawing: string | null
  sampling: string | null
}

const EMPTY_SIBLINGS: SiblingIds = { geo: null, geotech: null, sawing: null, sampling: null }

// Строка-сиблинг может быть уже одобрена/на согласовании техдиром отдельно
// от сводки по бурению (согласование раздельное, см. комментарий ниже) —
// в этом случае RLS (reports_update_own_when_editable) её больше не даёт
// трогать. "Заблокированный" тип доп. работы показываем только для чтения
// и не пытаемся ни обновить, ни тем более вставить вторую строку рядом
// (это задвоило бы метраж/пробы после одобрения обеих строк).
interface SiblingLocked {
  geo: boolean
  geotech: boolean
  sawing: boolean
  sampling: boolean
}

const NOTHING_LOCKED: SiblingLocked = { geo: false, geotech: false, sawing: false, sampling: false }

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
//
// 19.09.2026 — керн/распиловка/опробование можно прицепить прямо к
// заданию на бурение (DrillingTaskForm, "Дополнительные работы на этой
// скважине"). Когда таких прицепленных задач у скважины taskType='drilling'
// есть — эта форма показывает для них дополнительные поля и при сохранении
// пишет ОТДЕЛЬНЫЕ строки reports (по одной на каждую прицепленную задачу,
// см. saveAttachedReport) с ТЕМИ ЖЕ датой/сменой/часами/комментарием, что
// и у самой сводки по бурению. Согласование при этом остаётся раздельным
// по каждой строке (см. обсуждение 19.09.2026) — просто ввод объединён.
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
  const [drillingRigNumber, setDrillingRigNumber] = useState<string | null>(null)
  const [coreTask, setCoreTask] = useState<CoreDescriptionTask | null>(null)
  const [sawingTask, setSawingTask] = useState<CoreSawingTask | null>(null)
  const [samplingTask, setSamplingTask] = useState<SamplingTask | null>(null)
  // Скважина, связанная через drilling_task_id — нужна для подписи
  // (распиловка всегда "своя", опробование может быть "своим").
  const [linkedDrillingTask, setLinkedDrillingTask] = useState<DrillingTask | null>(null)
  const [loadingTask, setLoadingTask] = useState(true)

  // Работы, прицепленные к ЭТОМУ заданию на бурение (taskType==='drilling'
  // только) — см. комментарий выше.
  const [attachedGeoCore, setAttachedGeoCore] = useState<CoreDescriptionTask | null>(null)
  const [attachedGeotechCore, setAttachedGeotechCore] = useState<CoreDescriptionTask | null>(null)
  const [attachedSawing, setAttachedSawing] = useState<CoreSawingTask | null>(null)
  const [attachedSampling, setAttachedSampling] = useState<SamplingTask | null>(null)
  // id уже существующих строк reports по этим прицепленным задачам за ту
  // же дату/смену, что и текущая сводка — если найдены, submit их
  // ОБНОВЛЯЕТ, а не создаёт дубликат.
  const [siblingIds, setSiblingIds] = useState<SiblingIds>(EMPTY_SIBLINGS)
  const [siblingLocked, setSiblingLocked] = useState<SiblingLocked>(NOTHING_LOCKED)

  const [categories, setCategories] = useState<CostCategory[]>([])
  const [costItems, setCostItems] = useState<CostItem[]>([])
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

  // Поля прицепленных геологической/геотехнической документации — отдельно
  // от coreFrom/coreTo/photoFrom/photoTo, т.к. на одной скважине могут быть
  // обе одновременно (см. миграцию 0007: это два разных задания).
  const [geoCoreFrom, setGeoCoreFrom] = useState('0')
  const [geoCoreTo, setGeoCoreTo] = useState('')
  const [geoPhotoFrom, setGeoPhotoFrom] = useState('0')
  const [geoPhotoTo, setGeoPhotoTo] = useState('')
  const [geotechCoreFrom, setGeotechCoreFrom] = useState('0')
  const [geotechCoreTo, setGeotechCoreTo] = useState('')
  const [geotechPhotoFrom, setGeotechPhotoFrom] = useState('0')
  const [geotechPhotoTo, setGeotechPhotoTo] = useState('')

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
  // Тот же забой, но включая ещё НЕ согласованные (submitted) смены —
  // подсказка возле поля "Метраж бурения за смену" (отзыв 20.09.2026,
  // "для понимания" — бригадиру нужно видеть актуальный забой сразу
  // после своей же отправки, не дожидаясь техдира). На WhatsApp-сообщение
  // не влияет — там принципиально только подтверждённые метры (см. выше).
  const [knownMeters, setKnownMeters] = useState(0)
  const [copied, setCopied] = useState(false)
  // Дата+смена последней успешно ОТПРАВЛЕННОЙ в этом сеансе сводки — пока
  // форма стоит на той же дате/смене, кнопки отправки заблокированы, чтобы
  // случайный повторный клик не создал вторую строку reports на то же
  // (дата, смена) (см. отзыв 20.09.2026). Меняется дата или смена —
  // разблокируется само, реактивно.
  const [lastSubmitted, setLastSubmitted] = useState<{ date: string; shift: string } | null>(null)

  const shiftsApply =
    taskType === 'drilling' || taskType === 'core-sawing'
      ? true
      : taskType === 'core-description'
        ? (coreTask?.shift_enabled ?? true)
        : false // sampling — одна запись в день, без смен

  useEffect(() => {
    if (!session || !taskId || !taskType) return

    async function findSiblingReport(column: AttachedTaskColumn, id: string, date: string, shift: number | null) {
      const query = supabase.from('reports').select('*').eq(column, id).eq('report_date', date)
      const { data } = await (shift == null ? query.is('shift_number', null) : query.eq('shift_number', shift)).maybeSingle()
      return data
    }

    // Подхватывает уже существующие строки reports по прицепленным работам
    // за ту же дату(+смену), что и текущая сводка по бурению — и заполняет
    // их поля, чтобы submit ОБНОВИЛ эти строки, а не создал дубликаты.
    // draft/edit_unlocked — то же условие, что и в RLS reports_update_own_
    // when_editable. Если сиблинг уже approved/submitted (согласуется
    // отдельно от бурения, см. шапку файла), его нельзя ни обновить (упадёт
    // с PGRST116, 0 строк), ни тем более вставить рядом вторую — задвоит
    // метраж/пробы, если обе строки потом одобрят.
    function isRowEditable(row: { approval_status: string; edit_unlocked: boolean }) {
      return row.approval_status === 'draft' || row.edit_unlocked
    }

    async function loadAttachedSiblings(
      date: string,
      shift: number | null,
      geo: CoreDescriptionTask | null,
      geotech: CoreDescriptionTask | null,
      saw: CoreSawingTask | null,
      sample: SamplingTask | null,
    ) {
      const ids: SiblingIds = { ...EMPTY_SIBLINGS }
      const locked: SiblingLocked = { ...NOTHING_LOCKED }

      if (geo) {
        const row = await findSiblingReport('core_description_task_id', geo.id, date, shift)
        if (row) {
          setGeoCoreFrom(row.core_description_interval_from != null ? String(row.core_description_interval_from) : '0')
          setGeoCoreTo(row.core_description_interval_to != null ? String(row.core_description_interval_to) : '')
          setGeoPhotoFrom(row.photofixation_interval_from != null ? String(row.photofixation_interval_from) : '0')
          setGeoPhotoTo(row.photofixation_interval_to != null ? String(row.photofixation_interval_to) : '')
          if (isRowEditable(row)) ids.geo = row.id
          else locked.geo = true
        }
      }
      if (geotech) {
        const row = await findSiblingReport('core_description_task_id', geotech.id, date, shift)
        if (row) {
          setGeotechCoreFrom(row.core_description_interval_from != null ? String(row.core_description_interval_from) : '0')
          setGeotechCoreTo(row.core_description_interval_to != null ? String(row.core_description_interval_to) : '')
          setGeotechPhotoFrom(row.photofixation_interval_from != null ? String(row.photofixation_interval_from) : '0')
          setGeotechPhotoTo(row.photofixation_interval_to != null ? String(row.photofixation_interval_to) : '')
          if (isRowEditable(row)) ids.geotech = row.id
          else locked.geotech = true
        }
      }
      if (saw) {
        const row = await findSiblingReport('core_sawing_task_id', saw.id, date, shift)
        if (row) {
          setSawnMeters(row.sawn_meters != null ? String(row.sawn_meters) : '')
          if (isRowEditable(row)) ids.sawing = row.id
          else locked.sawing = true
        }
      }
      if (sample) {
        const row = await findSiblingReport('sampling_task_id', sample.id, date, null)
        if (row) {
          setSamplesTaken(row.samples_taken != null ? String(row.samples_taken) : '')
          setSamplesSubmitted(row.samples_submitted != null ? String(row.samples_submitted) : '')
          if (isRowEditable(row)) ids.sampling = row.id
          else locked.sampling = true
        }
      }
      setSiblingIds(ids)
      setSiblingLocked(locked)
    }

    async function load() {
      setLoadingTask(true)

      const [catRes, itemsRes] = await Promise.all([
        supabase.from('cost_categories').select('*').order('name'),
        supabase.from('cost_items').select('*').order('name'),
      ])
      if (catRes.data) setCategories(catRes.data)
      if (itemsRes.data) setCostItems(itemsRes.data)

      let geo: CoreDescriptionTask | null = null
      let geotech: CoreDescriptionTask | null = null
      let saw: CoreSawingTask | null = null
      let sample: SamplingTask | null = null

      if (taskType === 'drilling') {
        const { data } = await supabase
          .from('drilling_tasks')
          .select('*')
          .eq('id', taskId)
          .single()
        setDrillingTask(data)
        if (data?.drilling_rig_id) {
          const { data: rig } = await supabase
            .from('drilling_rigs')
            .select('rig_number')
            .eq('id', data.drilling_rig_id)
            .single()
          setDrillingRigNumber(rig?.rig_number ?? null)
        }

        const { data: taskReports } = await supabase
          .from('reports')
          .select('drilling_meters, approval_status')
          .eq('drilling_task_id', taskId)
        setPriorApprovedMeters(
          (taskReports ?? [])
            .filter((r) => r.approval_status === 'approved')
            .reduce((s, r) => s + (r.drilling_meters ?? 0), 0),
        )
        setKnownMeters(
          (taskReports ?? [])
            .filter((r) => r.approval_status === 'approved' || r.approval_status === 'submitted')
            .reduce((s, r) => s + (r.drilling_meters ?? 0), 0),
        )

        const [coreRes, sawingRes, samplingRes] = await Promise.all([
          supabase.from('core_description_tasks').select('*').eq('drilling_task_id', taskId),
          supabase.from('core_sawing_tasks').select('*').eq('drilling_task_id', taskId).maybeSingle(),
          supabase.from('sampling_tasks').select('*').eq('drilling_task_id', taskId).maybeSingle(),
        ])
        geo = coreRes.data?.find((t) => t.documentation_type === 'geological') ?? null
        geotech = coreRes.data?.find((t) => t.documentation_type === 'geotechnical') ?? null
        saw = sawingRes.data ?? null
        sample = samplingRes.data ?? null
        setAttachedGeoCore(geo)
        setAttachedGeotechCore(geotech)
        setAttachedSawing(saw)
        setAttachedSampling(sample)
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

        let loadedDate = reportDate
        let loadedShift: number | null = null

        if (reportRes.data) {
          const r = reportRes.data
          loadedDate = r.report_date
          loadedShift = r.shift_number
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
              cost_category_id:
                itemsRes.data?.find((it) => it.id === c.cost_item_id)?.category_id ?? '',
              cost_item_id: c.cost_item_id,
              quantity: c.quantity != null ? String(c.quantity) : '',
            })),
          )
        }

        if (taskType === 'drilling' && reportRes.data) {
          await loadAttachedSiblings(loadedDate, loadedShift, geo, geotech, saw, sample)
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
      } else if (taskType === 'drilling') {
        // Новая сводка по бурению — автоподстановка "от" для прицепленных
        // задач керна (тот же приём, что и для самостоятельного описания
        // керна выше), плюс подхват уже поданных сиблингов на сегодня/эту
        // смену, если они как-то уже существуют.
        async function autofillCore(task: CoreDescriptionTask, setFrom: (v: string) => void, setPhotoFromFn: (v: string) => void) {
          const { data: lastReport } = await supabase
            .from('reports')
            .select('core_description_interval_to, photofixation_interval_to')
            .eq('core_description_task_id', task.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          if (lastReport) {
            setFrom(String(lastReport.core_description_interval_to ?? 0))
            setPhotoFromFn(String(lastReport.photofixation_interval_to ?? 0))
          }
        }
        if (geo) await autofillCore(geo, setGeoCoreFrom, setGeoPhotoFrom)
        if (geotech) await autofillCore(geotech, setGeotechCoreFrom, setGeotechPhotoFrom)

        const shift = shiftNumber ? Number(shiftNumber) : null
        await loadAttachedSiblings(reportDate, shift, geo, geotech, saw, sample)
      }

      setLoadingTask(false)
    }

    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Опробование можно показать в объединённой форме, только если ЭТОТ
  // пользователь — тот же ответственный, что назначен на задание (иначе
  // RLS не даст записать строку от его имени, см. reports_insert_own).
  // Если ответственный за опробование — другая бригада, они вносят его
  // сводки по-старому, через самостоятельное задание "Опробование".
  const canFillAttachedSampling =
    attachedSampling != null && attachedSampling.assigned_party_chief_id === profile?.id

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

  async function saveAttachedReport(
    column: AttachedTaskColumn,
    attachedTaskId: string,
    siblingId: string | null,
    siteId: string,
    shift: number | null,
    metricFields: Record<string, number | null>,
  ) {
    if (!profile) throw new Error('Нет профиля')
    const base = {
      drilling_task_id: null as string | null,
      core_description_task_id: null as string | null,
      core_sawing_task_id: null as string | null,
      sampling_task_id: null as string | null,
      [column]: attachedTaskId,
      site_id: siteId,
      author_id: profile.id,
      report_date: reportDate,
      shift_number: shift,
      hours_worked: hoursWorked ? Number(hoursWorked) : null,
      shift_notes: shiftNotes.trim() || null,
      approval_status: 'draft' as const,
      submitted_at: null,
      ...metricFields,
    }
    return siblingId
      ? await supabase.from('reports').update(base).eq('id', siblingId).select().single()
      : await supabase.from('reports').insert(base).select().single()
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
    // Затраты привязаны только к основной строке (бурение) — не дублируем
    // и не делим их между прицепленными работами той же смены.
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

    const validCosts = costRows.filter((c) => c.cost_item_id)
    if (validCosts.length > 0) {
      const { error: costsError } = await supabase.from('report_costs').insert(
        validCosts.map((c) => ({
          report_id: report.id,
          cost_item_id: c.cost_item_id,
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

    // Прицепленные к скважине работы (керн/распиловка/опробование) —
    // отдельные строки reports с той же датой/сменой/часами/комментарием,
    // см. комментарий в шапке файла. Пишем только те, где реально введены
    // данные (или где уже есть строка-сиблинг — тогда обновляем её, даже
    // если поля очистили до пустых).
    const newSiblingIds: SiblingIds = { ...siblingIds }
    const attachedShift = shiftNumber ? Number(shiftNumber) : null

    if (taskType === 'drilling') {
      if (attachedGeoCore && !siblingLocked.geo && (siblingIds.geo || geoCoreTo || geoPhotoTo)) {
        const res = await saveAttachedReport(
          'core_description_task_id',
          attachedGeoCore.id,
          siblingIds.geo,
          siteId,
          attachedShift,
          {
            core_description_interval_from: geoCoreTo ? Number(geoCoreFrom) : null,
            core_description_interval_to: geoCoreTo ? Number(geoCoreTo) : null,
            photofixation_interval_from: geoPhotoTo ? Number(geoPhotoFrom) : null,
            photofixation_interval_to: geoPhotoTo ? Number(geoPhotoTo) : null,
          },
        )
        if (res.error || !res.data) {
          setError(`Сводка по бурению сохранена, но не удалось сохранить керн (геологическая): ${res.error?.message ?? '—'}`)
          setSubmitting(null)
          return
        }
        newSiblingIds.geo = res.data.id
      }

      if (attachedGeotechCore && !siblingLocked.geotech && (siblingIds.geotech || geotechCoreTo || geotechPhotoTo)) {
        const res = await saveAttachedReport(
          'core_description_task_id',
          attachedGeotechCore.id,
          siblingIds.geotech,
          siteId,
          attachedShift,
          {
            core_description_interval_from: geotechCoreTo ? Number(geotechCoreFrom) : null,
            core_description_interval_to: geotechCoreTo ? Number(geotechCoreTo) : null,
            photofixation_interval_from: geotechPhotoTo ? Number(geotechPhotoFrom) : null,
            photofixation_interval_to: geotechPhotoTo ? Number(geotechPhotoTo) : null,
          },
        )
        if (res.error || !res.data) {
          setError(`Сводка по бурению сохранена, но не удалось сохранить керн (геотехническая): ${res.error?.message ?? '—'}`)
          setSubmitting(null)
          return
        }
        newSiblingIds.geotech = res.data.id
      }

      if (attachedSawing && !siblingLocked.sawing && (siblingIds.sawing || sawnMeters)) {
        const res = await saveAttachedReport(
          'core_sawing_task_id',
          attachedSawing.id,
          siblingIds.sawing,
          siteId,
          attachedShift,
          { sawn_meters: sawnMeters ? Number(sawnMeters) : null },
        )
        if (res.error || !res.data) {
          setError(`Сводка по бурению сохранена, но не удалось сохранить распиловку: ${res.error?.message ?? '—'}`)
          setSubmitting(null)
          return
        }
        newSiblingIds.sawing = res.data.id
      }

      if (
        canFillAttachedSampling &&
        attachedSampling &&
        !siblingLocked.sampling &&
        (siblingIds.sampling || samplesTaken || samplesSubmitted)
      ) {
        const res = await saveAttachedReport(
          'sampling_task_id',
          attachedSampling.id,
          siblingIds.sampling,
          siteId,
          null,
          {
            samples_taken: samplesTaken ? Number(samplesTaken) : null,
            samples_submitted: samplesSubmitted ? Number(samplesSubmitted) : null,
          },
        )
        if (res.error || !res.data) {
          setError(`Сводка по бурению сохранена, но не удалось сохранить опробование: ${res.error?.message ?? '—'}`)
          setSubmitting(null)
          return
        }
        newSiblingIds.sampling = res.data.id
      }

      setSiblingIds(newSiblingIds)
    }

    if (mode === 'submit') {
      const now = new Date().toISOString()
      const idsToSubmit = [
        report.id,
        ...(taskType === 'drilling'
          ? [newSiblingIds.geo, newSiblingIds.geotech, newSiblingIds.sawing, newSiblingIds.sampling]
          : []),
      ].filter((id): id is string => Boolean(id))

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
        .in('id', idsToSubmit)
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
      // Правка (пересдача отклонённой/уже отправленной сводки) — уходим
      // со страницы, как и при сохранении черновика: этот конкретный
      // reportId только что перестал быть редактируемым, оставаться на
      // форме незачем и рискованно (повторный клик упёрся бы в RLS,
      // см. PGRST116 выше). Новая сводка (не правка) — остаёмся и сразу
      // готовим форму под следующую смену (см. отзыв 20.09.2026).
      if (isEditMode) {
        navigate(`/tasks/${taskType}/${taskId}/reports`)
        return
      }
      if (taskType === 'drilling' && drillingMeters) {
        setKnownMeters((prev) => prev + Number(drillingMeters))
      }
      setLastSubmitted({ date: reportDate, shift: shiftNumber })
      setSuccessMsg('Сводка отправлена на согласование. Можно сразу заполнять следующую смену.')
      setHoursWorked('')
      setDrillingMeters('')
      setCoreFrom('0')
      setCoreTo('')
      setPhotoFrom('0')
      setPhotoTo('')
      setSawnMeters('')
      setSamplesTaken('')
      setSamplesSubmitted('')
      setShiftNotes('')
      setCostRows([emptyCostRow()])
      setGeoCoreFrom('0')
      setGeoCoreTo('')
      setGeoPhotoFrom('0')
      setGeoPhotoTo('')
      setGeotechCoreFrom('0')
      setGeotechCoreTo('')
      setGeotechPhotoFrom('0')
      setGeotechPhotoTo('')
      // Сиблинги (прицепленные работы) относились к ТОЛЬКО ЧТО отправленной
      // дате/смене — если бригадир сейчас поменяет дату/смену и продолжит
      // заполнять форму, это должны быть НОВЫЕ строки, а не обновление
      // уже отправленных. Без сброса второй submit тихо перезаписал бы их.
      setSiblingIds(EMPTY_SIBLINGS)
      setSiblingLocked(NOTHING_LOCKED)
    } else {
      navigate(`/tasks/${taskType}/${taskId}/reports`)
      return
    }
  }

  async function handleCopyWhatsApp() {
    const meters = drillingMeters ? Number(drillingMeters) : 0
    const coreDescriptions = []
    if (attachedGeoCore && geoCoreTo) {
      coreDescriptions.push({
        label: 'геологическая',
        from: Number(geoCoreFrom),
        to: Number(geoCoreTo),
        photoFrom: geoPhotoTo ? Number(geoPhotoFrom) : null,
        photoTo: geoPhotoTo ? Number(geoPhotoTo) : null,
      })
    }
    if (attachedGeotechCore && geotechCoreTo) {
      coreDescriptions.push({
        label: 'геотехническая',
        from: Number(geotechCoreFrom),
        to: Number(geotechCoreTo),
        photoFrom: geotechPhotoTo ? Number(geotechPhotoFrom) : null,
        photoTo: geotechPhotoTo ? Number(geotechPhotoTo) : null,
      })
    }
    const message = buildDrillingShiftMessage({
      wellNumber: drillingTask?.well_number ?? '?',
      rigNumber: drillingRigNumber,
      reportDate,
      shiftNumber: shiftsApply && shiftNumber ? Number(shiftNumber) : null,
      meters,
      bottomHole: priorApprovedMeters + meters,
      shiftNotes,
      coreDescriptions,
      sawnMeters: attachedSawing && sawnMeters ? Number(sawnMeters) : null,
      samplesTaken: canFillAttachedSampling && samplesTaken ? Number(samplesTaken) : null,
      samplesSubmitted: canFillAttachedSampling && samplesSubmitted ? Number(samplesSubmitted) : null,
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
              <span className="text-muted" style={{ fontWeight: 400 }}>
                {' '}
                (забой: {knownMeters} м
                {knownMeters !== priorApprovedMeters && (
                  <span
                    title="Включает ещё не согласованные техдиром сводки — цифра может измениться"
                    style={{
                      display: 'inline-block',
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: 'var(--color-danger)',
                      marginLeft: 5,
                      marginRight: 3,
                      verticalAlign: 'middle',
                    }}
                  />
                )}
                {knownMeters !== priorApprovedMeters && ' не согласован'}
                {drillingTask?.planned_daily_meters != null &&
                  `, план: ${drillingTask.planned_daily_meters} м/сутки`}
                )
              </span>
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

          {taskType === 'drilling' && attachedGeoCore && (
            <fieldset>
              <legend>Керн, геологическая документация — интервал</legend>
              {siblingLocked.geo && (
                <p className="text-muted" style={{ fontSize: 12.5, margin: '0 0 6px' }}>
                  Уже согласуется отдельно от бурения — правка отсюда недоступна.
                </p>
              )}
              <input
                type="number"
                step="any"
                placeholder="от"
                value={geoCoreFrom}
                readOnly
                title="Подставляется автоматически из предыдущей сводки"
                style={{ width: 80 }}
              />
              <input
                type="number"
                step="any"
                placeholder="до"
                value={geoCoreTo}
                onChange={(e) => setGeoCoreTo(e.target.value)}
                disabled={siblingLocked.geo}
                style={{ width: 80 }}
              />
              <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--color-text-muted)' }}>Фотофиксация</div>
              <input
                type="number"
                step="any"
                placeholder="от"
                value={geoPhotoFrom}
                readOnly
                style={{ width: 80 }}
              />
              <input
                type="number"
                step="any"
                placeholder="до"
                value={geoPhotoTo}
                onChange={(e) => setGeoPhotoTo(e.target.value)}
                disabled={siblingLocked.geo}
                style={{ width: 80 }}
              />
            </fieldset>
          )}

          {taskType === 'drilling' && attachedGeotechCore && (
            <fieldset>
              <legend>Керн, геотехническая документация — интервал</legend>
              {siblingLocked.geotech && (
                <p className="text-muted" style={{ fontSize: 12.5, margin: '0 0 6px' }}>
                  Уже согласуется отдельно от бурения — правка отсюда недоступна.
                </p>
              )}
              <input
                type="number"
                step="any"
                placeholder="от"
                value={geotechCoreFrom}
                readOnly
                title="Подставляется автоматически из предыдущей сводки"
                style={{ width: 80 }}
              />
              <input
                type="number"
                step="any"
                placeholder="до"
                value={geotechCoreTo}
                onChange={(e) => setGeotechCoreTo(e.target.value)}
                disabled={siblingLocked.geotech}
                style={{ width: 80 }}
              />
              <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--color-text-muted)' }}>Фотофиксация</div>
              <input
                type="number"
                step="any"
                placeholder="от"
                value={geotechPhotoFrom}
                readOnly
                style={{ width: 80 }}
              />
              <input
                type="number"
                step="any"
                placeholder="до"
                value={geotechPhotoTo}
                onChange={(e) => setGeotechPhotoTo(e.target.value)}
                disabled={siblingLocked.geotech}
                style={{ width: 80 }}
              />
            </fieldset>
          )}

          {taskType === 'drilling' && attachedSawing && (
            <label>
              Распилено за смену, м
              {siblingLocked.sawing && (
                <span className="text-muted" style={{ fontWeight: 400, fontSize: 12.5 }}>
                  {' '}
                  (уже согласуется отдельно — правка отсюда недоступна)
                </span>
              )}
              <input
                type="number"
                step="any"
                value={sawnMeters}
                onChange={(e) => setSawnMeters(e.target.value)}
                disabled={siblingLocked.sawing}
              />
            </label>
          )}

          {taskType === 'drilling' && canFillAttachedSampling && (
            <>
              {siblingLocked.sampling && (
                <p className="text-muted" style={{ fontSize: 12.5, margin: 0 }}>
                  Опробование за эту дату уже согласуется отдельно — правка отсюда недоступна.
                </p>
              )}
              <label>
                Проб отобрано
                <input
                  type="number"
                  step="1"
                  value={samplesTaken}
                  onChange={(e) => setSamplesTaken(e.target.value)}
                  disabled={siblingLocked.sampling}
                />
              </label>
              <label>
                Проб сдано в лабораторию
                <input
                  type="number"
                  step="1"
                  value={samplesSubmitted}
                  onChange={(e) => setSamplesSubmitted(e.target.value)}
                  disabled={siblingLocked.sampling}
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
            items={costItems}
            onChange={setCostRows}
          />

          {error && <p className="text-error">{error}</p>}
          {successMsg && <p className="text-success">{successMsg}</p>}

          {(() => {
            // Пока форма стоит на той же дате/смене, что уже была успешно
            // отправлена в этом сеансе, — кнопки заблокированы (иначе
            // случайный повторный клик создал бы вторую строку reports на
            // те же дату/смену, см. отзыв 20.09.2026). Смена даты или
            // смены снимает блокировку сама, реактивно.
            const alreadySubmittedHere =
              !isEditMode &&
              lastSubmitted !== null &&
              lastSubmitted.date === reportDate &&
              lastSubmitted.shift === shiftNumber
            const disabled = submitting !== null || alreadySubmittedHere
            return (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn-outline"
                  disabled={disabled}
                  onClick={(e) => handleSubmit(e, 'draft')}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  {submitting === 'draft' && <span className="spinner" style={{ marginRight: 0 }} />}
                  {submitting === 'draft' ? 'Сохраняем…' : 'Сохранить черновик'}
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={(e) => handleSubmit(e, 'submit')}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  {submitting === 'submit' && <span className="spinner" style={{ marginRight: 0 }} />}
                  {submitting === 'submit'
                    ? 'Отправляем…'
                    : alreadySubmittedHere
                      ? 'Уже отправлено — измените дату/смену'
                      : 'Отправить на согласование'}
                </button>
              </div>
            )
          })()}
        </form>
      )}
    </div>
  )
}
