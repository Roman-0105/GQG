import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { Drill, ChevronLeft } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { isManagement } from '../../types/roles'
import type {
  CoreDescriptionTask,
  CoreSawingTask,
  DrillingOrganization,
  DrillingRig,
  Profile,
  SamplingTask,
  TaskStatus,
} from '../../types/database'
import DiameterIntervalsEditor, {
  emptyDiameterRow,
  type DiameterRow,
} from '../../components/DiameterIntervalsEditor'
import AttachedCoreDescriptionCard from '../../components/AttachedCoreDescriptionCard'
import AttachedSawingCard from '../../components/AttachedSawingCard'
import AttachedSamplingCard from '../../components/AttachedSamplingCard'

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'planned', label: 'Запланировано' },
  { value: 'in_progress', label: 'В работе' },
  { value: 'suspended', label: 'Приостановлено' },
  { value: 'completed', label: 'Завершено' },
]

// Поля — см. ТЗ, раздел 3 (первоначальное задание) + раздел 3/v0.7
// (диаметры по интервалам, бригадир из списка). taskId в URL — режим
// правки (см. отзыв 17.09.2026: раньше задания можно было только создать).
export default function DrillingTaskForm() {
  const { siteId, taskId } = useParams<{ siteId: string; taskId?: string }>()
  const isEditMode = Boolean(taskId)
  const { session, profile, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  const [organizations, setOrganizations] = useState<DrillingOrganization[]>([])
  const [rigs, setRigs] = useState<DrillingRig[]>([])
  const [foremen, setForemen] = useState<Profile[]>([])
  const [loadingTask, setLoadingTask] = useState(isEditMode)

  const [wellNumber, setWellNumber] = useState('')
  const [drillingRigId, setDrillingRigId] = useState('')
  const [drillingOrgId, setDrillingOrgId] = useState('')
  const [coordLat, setCoordLat] = useState('')
  const [coordLon, setCoordLon] = useState('')
  const [coordX, setCoordX] = useState('')
  const [coordY, setCoordY] = useState('')
  const [elevation, setElevation] = useState('')
  const [foremanId, setForemanId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [projectedDepth, setProjectedDepth] = useState('')
  const [plannedDailyMeters, setPlannedDailyMeters] = useState('')
  const [angle, setAngle] = useState('')
  const [azimuth, setAzimuth] = useState('')
  const [status, setStatus] = useState<TaskStatus>('planned')
  const [description, setDescription] = useState('')
  const [diameters, setDiameters] = useState<DiameterRow[]>([emptyDiameterRow()])

  // Дополнительные работы, прицепленные к этому заданию на бурение (см.
  // отзыв 19.09.2026) — керн/распиловка/опробование той же скважины без
  // отдельного создания задания через участок.
  const [geoCoreTask, setGeoCoreTask] = useState<CoreDescriptionTask | null>(null)
  const [geotechCoreTask, setGeotechCoreTask] = useState<CoreDescriptionTask | null>(null)
  const [sawingTask, setSawingTask] = useState<CoreSawingTask | null>(null)
  const [samplingTask, setSamplingTask] = useState<SamplingTask | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!session) return
    async function loadRefs() {
      const [orgsRes, rigsRes, foremenRes] = await Promise.all([
        supabase.from('drilling_organizations').select('*').order('name'),
        supabase.from('drilling_rigs').select('*').order('rig_number'),
        supabase
          .from('profiles')
          .select('*')
          .eq('role', 'party_chief')
          .order('full_name'),
      ])
      if (orgsRes.data) setOrganizations(orgsRes.data)
      if (rigsRes.data) setRigs(rigsRes.data)
      if (foremenRes.data) setForemen(foremenRes.data)
    }
    loadRefs()
  }, [session])

  useEffect(() => {
    if (!session || !taskId) return
    async function loadTask() {
      setLoadingTask(true)
      const [taskRes, diametersRes, coreRes, sawingRes, samplingRes] = await Promise.all([
        supabase.from('drilling_tasks').select('*').eq('id', taskId).single(),
        supabase.from('drilling_task_diameters').select('*').eq('drilling_task_id', taskId),
        supabase.from('core_description_tasks').select('*').eq('drilling_task_id', taskId),
        supabase.from('core_sawing_tasks').select('*').eq('drilling_task_id', taskId).maybeSingle(),
        supabase.from('sampling_tasks').select('*').eq('drilling_task_id', taskId).maybeSingle(),
      ])
      if (taskRes.data) {
        const t = taskRes.data
        setWellNumber(t.well_number)
        setDrillingRigId(t.drilling_rig_id ?? '')
        setDrillingOrgId(t.drilling_org_id)
        setCoordLat(t.coord_wgs84_lat != null ? String(t.coord_wgs84_lat) : '')
        setCoordLon(t.coord_wgs84_lon != null ? String(t.coord_wgs84_lon) : '')
        setCoordX(t.coord_local_x != null ? String(t.coord_local_x) : '')
        setCoordY(t.coord_local_y != null ? String(t.coord_local_y) : '')
        setElevation(t.wellhead_elevation != null ? String(t.wellhead_elevation) : '')
        setForemanId(t.foreman_id)
        setStartDate(t.start_date ?? '')
        setProjectedDepth(t.projected_depth != null ? String(t.projected_depth) : '')
        setPlannedDailyMeters(t.planned_daily_meters != null ? String(t.planned_daily_meters) : '')
        setAngle(t.angle != null ? String(t.angle) : '')
        setAzimuth(t.azimuth != null ? String(t.azimuth) : '')
        setStatus(t.status)
        setDescription(t.description ?? '')
      }
      if (diametersRes.data && diametersRes.data.length > 0) {
        setDiameters(
          diametersRes.data.map((d) => ({
            depth_from: String(d.depth_from),
            depth_to: String(d.depth_to),
            diameter: String(d.diameter),
          })),
        )
      }
      setGeoCoreTask(coreRes.data?.find((t) => t.documentation_type === 'geological') ?? null)
      setGeotechCoreTask(coreRes.data?.find((t) => t.documentation_type === 'geotechnical') ?? null)
      setSawingTask(sawingRes.data ?? null)
      setSamplingTask(samplingRes.data ?? null)
      setLoadingTask(false)
    }
    loadTask()
  }, [session, taskId])

  if (authLoading) return <p>Загрузка…</p>
  if (!session) return <Navigate to="/login" replace />
  if (!siteId) return <p>Не указан участок.</p>
  if (!isManagement(profile?.role)) {
    return <p>{isEditMode ? 'Редактировать' : 'Создавать'} задания могут только гендир/техдир.</p>
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!profile) return
    setSubmitting(true)
    setError(null)

    const validDiameters = diameters.filter(
      (d) => d.depth_from && d.depth_to && d.diameter,
    )

    const commonFields = {
      site_id: siteId,
      well_number: wellNumber,
      drilling_rig_id: drillingRigId || null,
      drilling_org_id: drillingOrgId,
      coord_wgs84_lat: coordLat ? Number(coordLat) : null,
      coord_wgs84_lon: coordLon ? Number(coordLon) : null,
      coord_local_x: coordX ? Number(coordX) : null,
      coord_local_y: coordY ? Number(coordY) : null,
      wellhead_elevation: elevation ? Number(elevation) : null,
      foreman_id: foremanId,
      start_date: startDate || null,
      projected_depth: projectedDepth ? Number(projectedDepth) : null,
      planned_daily_meters: plannedDailyMeters
        ? Number(plannedDailyMeters)
        : null,
      angle: angle ? Number(angle) : null,
      azimuth: azimuth ? Number(azimuth) : null,
      description: description.trim() || null,
    }

    const { data: task, error: saveError } = isEditMode
      ? await supabase
          .from('drilling_tasks')
          .update({ ...commonFields, status })
          .eq('id', taskId)
          .select()
          .single()
      : await supabase
          .from('drilling_tasks')
          .insert({ ...commonFields, created_by: profile.id })
          .select()
          .single()

    if (saveError || !task) {
      setError(saveError?.message ?? 'Не удалось сохранить задание')
      setSubmitting(false)
      return
    }

    // Диаметры при правке — как и с затратами сводки: проще снести и
    // записать текущее состояние формы заново, чем сверять построчно.
    if (isEditMode) {
      const { error: deleteError } = await supabase
        .from('drilling_task_diameters')
        .delete()
        .eq('drilling_task_id', task.id)
      if (deleteError) {
        setError(`Задание сохранено, но не удалось обновить диаметры: ${deleteError.message}`)
        setSubmitting(false)
        return
      }
    }

    if (validDiameters.length > 0) {
      const { error: diamError } = await supabase
        .from('drilling_task_diameters')
        .insert(
          validDiameters.map((d) => ({
            drilling_task_id: task.id,
            depth_from: Number(d.depth_from),
            depth_to: Number(d.depth_to),
            diameter: Number(d.diameter),
          })),
        )
      if (diamError) {
        setError(
          `Задание сохранено, но не удалось сохранить диаметры: ${diamError.message}`,
        )
        setSubmitting(false)
        return
      }
    }

    setSubmitting(false)
    navigate(`/sites/${siteId}`)
  }

  return (
    <div style={{ maxWidth: isEditMode ? 980 : 460 }}>
      <Link to={`/sites/${siteId}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13.5, marginBottom: 10 }}>
        <ChevronLeft size={15} /> Участок
      </Link>
      <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Drill size={24} className="text-muted" /> {isEditMode ? 'Правка задания: бурение скважины' : 'Новое задание: бурение скважины'}
      </h1>
      {loadingTask ? (
        <p>Загрузка задания…</p>
      ) : (
        <div style={isEditMode ? { display: 'flex', gap: 28, alignItems: 'flex-start', flexWrap: 'wrap' } : undefined}>
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 10, flex: '1 1 420px', minWidth: 300, maxWidth: 460 }}>
          <label>
            Номер скважины
            <input
              required
              value={wellNumber}
              onChange={(e) => setWellNumber(e.target.value)}
            />
          </label>
          <label>
            Организация бурения
            <select
              required
              value={drillingOrgId}
              onChange={(e) => {
                setDrillingOrgId(e.target.value)
                setDrillingRigId('')
              }}
            >
              <option value="">— выбрать —</option>
              {organizations.map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Буровой станок
            <select
              value={drillingRigId}
              disabled={!drillingOrgId}
              onChange={(e) => setDrillingRigId(e.target.value)}
            >
              <option value="">— выбрать —</option>
              {rigs
                .filter((r) => r.organization_id === drillingOrgId)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    № {r.rig_number}
                    {r.model ? ` (${r.model})` : ''}
                  </option>
                ))}
            </select>
            {drillingOrgId && rigs.filter((r) => r.organization_id === drillingOrgId).length === 0 && (
              <span className="text-muted" style={{ fontSize: 12.5 }}>
                У этой организации пока нет станков в справочнике — добавьте на странице{' '}
                <Link to="/settings/organizations">«Организации бурения»</Link>.
              </span>
            )}
          </label>

          {isEditMode && (
            <label>
              Статус задания
              <select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          <fieldset>
            <legend>Координаты WGS-84</legend>
            <input
              type="number"
              step="any"
              placeholder="широта"
              value={coordLat}
              onChange={(e) => setCoordLat(e.target.value)}
            />
            <input
              type="number"
              step="any"
              placeholder="долгота"
              value={coordLon}
              onChange={(e) => setCoordLon(e.target.value)}
            />
          </fieldset>

          <fieldset>
            <legend>Местные координаты</legend>
            <input
              type="number"
              step="any"
              placeholder="X"
              value={coordX}
              onChange={(e) => setCoordX(e.target.value)}
            />
            <input
              type="number"
              step="any"
              placeholder="Y"
              value={coordY}
              onChange={(e) => setCoordY(e.target.value)}
            />
          </fieldset>

          <label>
            Абсолютная отметка устья, м
            <input
              type="number"
              step="any"
              value={elevation}
              onChange={(e) => setElevation(e.target.value)}
            />
          </label>

          <label>
            Бригадир
            <select
              required
              value={foremanId}
              onChange={(e) => setForemanId(e.target.value)}
            >
              <option value="">— выбрать —</option>
              {foremen.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.full_name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Дата начала бурения
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>

          <label>
            Проектная глубина, м
            <input
              type="number"
              step="any"
              value={projectedDepth}
              onChange={(e) => setProjectedDepth(e.target.value)}
            />
          </label>

          <label>
            План бурения, м/сутки
            <input
              type="number"
              step="any"
              placeholder="напр. 8"
              value={plannedDailyMeters}
              onChange={(e) => setPlannedDailyMeters(e.target.value)}
            />
          </label>

          <label>
            Угол бурения, °
            <input
              type="number"
              step="any"
              value={angle}
              onChange={(e) => setAngle(e.target.value)}
            />
          </label>

          <label>
            Азимут бурения, °
            <input
              type="number"
              step="any"
              value={azimuth}
              onChange={(e) => setAzimuth(e.target.value)}
            />
          </label>

          <DiameterIntervalsEditor rows={diameters} onChange={setDiameters} />

          <label>
            Описание задания для бригадира
            <textarea
              rows={3}
              placeholder="Что делать, на что обратить внимание"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>

          {error && <p className="text-error">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}
          >
            {submitting && <span className="spinner" style={{ marginRight: 0 }} />}
            {submitting ? 'Сохраняем…' : isEditMode ? 'Сохранить' : 'Создать задание'}
          </button>
        </form>

        {isEditMode && taskId && (
          <div style={{ flex: '1 1 300px', minWidth: 280, display: 'grid', gap: 12, alignContent: 'start' }}>
            <div>
              <h2 style={{ margin: '0 0 4px' }}>Дополнительные работы на этой скважине</h2>
              <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
                Керн, распиловка и опробование по этой же скважине — без создания
                отдельного задания. Скважина и бригадир наследуются автоматически.
              </p>
            </div>
            <AttachedCoreDescriptionCard
              siteId={siteId}
              drillingTaskId={taskId}
              documentationType="geological"
              task={geoCoreTask}
              onSaved={setGeoCoreTask}
            />
            <AttachedCoreDescriptionCard
              siteId={siteId}
              drillingTaskId={taskId}
              documentationType="geotechnical"
              task={geotechCoreTask}
              onSaved={setGeotechCoreTask}
            />
            <AttachedSawingCard siteId={siteId} drillingTaskId={taskId} task={sawingTask} onSaved={setSawingTask} />
            <AttachedSamplingCard
              siteId={siteId}
              drillingTaskId={taskId}
              defaultForemanId={foremanId}
              task={samplingTask}
              onSaved={setSamplingTask}
            />
          </div>
        )}
        </div>
      )}
    </div>
  )
}
