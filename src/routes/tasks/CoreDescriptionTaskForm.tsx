import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { Layers, ChevronLeft } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { isManagement } from '../../types/roles'
import type { DocumentationType, DrillingOrganization, DrillingTask, Profile } from '../../types/database'
import DiameterIntervalsEditor, {
  emptyDiameterRow,
  type DiameterRow,
} from '../../components/DiameterIntervalsEditor'

type WellSource = 'own' | 'external'

// Развилка "своя скважина / скважина подрядчика" — см. ТЗ раздел 8 (v0.6).
// Поля скважины подрядчика — те же, что у Drilling Task, но без персонала.
// taskId в URL — режим правки (см. отзыв 17.09.2026).
export default function CoreDescriptionTaskForm() {
  const { siteId, taskId } = useParams<{ siteId: string; taskId?: string }>()
  const isEditMode = Boolean(taskId)
  const { session, profile, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  const [wellSource, setWellSource] = useState<WellSource>('own')
  const [documentationType, setDocumentationType] = useState<DocumentationType>('geological')
  const [shiftEnabled, setShiftEnabled] = useState(true)
  const [loadingTask, setLoadingTask] = useState(isEditMode)

  const [ownDrillingTasks, setOwnDrillingTasks] = useState<DrillingTask[]>([])
  const [selectedDrillingTaskId, setSelectedDrillingTaskId] = useState('')

  const [organizations, setOrganizations] = useState<DrillingOrganization[]>([])
  const [extWellNumber, setExtWellNumber] = useState('')
  const [extOrgId, setExtOrgId] = useState('')
  const [extLat, setExtLat] = useState('')
  const [extLon, setExtLon] = useState('')
  const [extX, setExtX] = useState('')
  const [extY, setExtY] = useState('')
  const [extElevation, setExtElevation] = useState('')
  const [extProjectedDepth, setExtProjectedDepth] = useState('')
  const [extAngle, setExtAngle] = useState('')
  const [extAzimuth, setExtAzimuth] = useState('')
  const [extDiameters, setExtDiameters] = useState<DiameterRow[]>([
    emptyDiameterRow(),
  ])
  const [partyChiefs, setPartyChiefs] = useState<Profile[]>([])
  const [assignedPartyChiefId, setAssignedPartyChiefId] = useState('')
  const [description, setDescription] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!session || !siteId) return
    async function loadRefs() {
      const [tasksRes, orgsRes, chiefsRes] = await Promise.all([
        supabase
          .from('drilling_tasks')
          .select('*')
          .eq('site_id', siteId)
          .order('well_number'),
        supabase.from('drilling_organizations').select('*').order('name'),
        supabase
          .from('profiles')
          .select('*')
          .eq('role', 'party_chief')
          .order('full_name'),
      ])
      if (tasksRes.data) setOwnDrillingTasks(tasksRes.data)
      if (orgsRes.data) setOrganizations(orgsRes.data)
      if (chiefsRes.data) setPartyChiefs(chiefsRes.data)
    }
    loadRefs()
  }, [session, siteId])

  useEffect(() => {
    if (!session || !taskId) return
    async function loadTask() {
      setLoadingTask(true)
      const { data: t } = await supabase
        .from('core_description_tasks')
        .select('*')
        .eq('id', taskId)
        .single()
      if (t) {
        setWellSource(t.drilling_task_id ? 'own' : 'external')
        setDocumentationType(t.documentation_type)
        setShiftEnabled(t.shift_enabled)
        setDescription(t.description ?? '')
        if (t.drilling_task_id) {
          setSelectedDrillingTaskId(t.drilling_task_id)
        } else {
          setExtWellNumber(t.external_well_number ?? '')
          setExtOrgId(t.external_drilling_org_id ?? '')
          setExtLat(t.external_coord_wgs84_lat != null ? String(t.external_coord_wgs84_lat) : '')
          setExtLon(t.external_coord_wgs84_lon != null ? String(t.external_coord_wgs84_lon) : '')
          setExtX(t.external_coord_local_x != null ? String(t.external_coord_local_x) : '')
          setExtY(t.external_coord_local_y != null ? String(t.external_coord_local_y) : '')
          setExtElevation(t.external_wellhead_elevation != null ? String(t.external_wellhead_elevation) : '')
          setExtProjectedDepth(t.external_projected_depth != null ? String(t.external_projected_depth) : '')
          setExtAngle(t.external_angle != null ? String(t.external_angle) : '')
          setExtAzimuth(t.external_azimuth != null ? String(t.external_azimuth) : '')
          setAssignedPartyChiefId(t.assigned_party_chief_id ?? '')

          const { data: diamRows } = await supabase
            .from('core_description_external_diameters')
            .select('*')
            .eq('core_description_task_id', taskId)
          if (diamRows && diamRows.length > 0) {
            setExtDiameters(
              diamRows.map((d) => ({
                depth_from: String(d.depth_from),
                depth_to: String(d.depth_to),
                diameter: String(d.diameter),
              })),
            )
          }
        }
      }
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

    interface SavePayload {
      site_id: string
      shift_enabled: boolean
      documentation_type: DocumentationType
      description: string | null
      created_by?: string
      drilling_task_id: string | null
      external_well_number: string | null
      external_drilling_org_id: string | null
      external_coord_wgs84_lat: number | null
      external_coord_wgs84_lon: number | null
      external_coord_local_x: number | null
      external_coord_local_y: number | null
      external_wellhead_elevation: number | null
      external_projected_depth: number | null
      external_angle: number | null
      external_azimuth: number | null
      assigned_party_chief_id: string | null
    }

    const basePayload = {
      site_id: siteId as string,
      shift_enabled: shiftEnabled,
      documentation_type: documentationType,
      description: description.trim() || null,
      ...(isEditMode ? {} : { created_by: profile.id }),
    }

    const payload: SavePayload =
      wellSource === 'own'
        ? {
            ...basePayload,
            drilling_task_id: selectedDrillingTaskId,
            external_well_number: null,
            external_drilling_org_id: null,
            external_coord_wgs84_lat: null,
            external_coord_wgs84_lon: null,
            external_coord_local_x: null,
            external_coord_local_y: null,
            external_wellhead_elevation: null,
            external_projected_depth: null,
            external_angle: null,
            external_azimuth: null,
            assigned_party_chief_id: null,
          }
        : {
            ...basePayload,
            drilling_task_id: null,
            external_well_number: extWellNumber,
            external_drilling_org_id: extOrgId || null,
            external_coord_wgs84_lat: extLat ? Number(extLat) : null,
            external_coord_wgs84_lon: extLon ? Number(extLon) : null,
            external_coord_local_x: extX ? Number(extX) : null,
            external_coord_local_y: extY ? Number(extY) : null,
            external_wellhead_elevation: extElevation
              ? Number(extElevation)
              : null,
            external_projected_depth: extProjectedDepth
              ? Number(extProjectedDepth)
              : null,
            external_angle: extAngle ? Number(extAngle) : null,
            external_azimuth: extAzimuth ? Number(extAzimuth) : null,
            assigned_party_chief_id: assignedPartyChiefId,
          }

    const { data: task, error: saveError } = isEditMode
      ? await supabase.from('core_description_tasks').update(payload).eq('id', taskId).select().single()
      : await supabase.from('core_description_tasks').insert(payload).select().single()

    if (saveError || !task) {
      setError(saveError?.message ?? 'Не удалось сохранить задание')
      setSubmitting(false)
      return
    }

    if (wellSource === 'external') {
      if (isEditMode) {
        const { error: deleteError } = await supabase
          .from('core_description_external_diameters')
          .delete()
          .eq('core_description_task_id', task.id)
        if (deleteError) {
          setError(`Задание сохранено, но не удалось обновить диаметры: ${deleteError.message}`)
          setSubmitting(false)
          return
        }
      }
      const validDiameters = extDiameters.filter(
        (d) => d.depth_from && d.depth_to && d.diameter,
      )
      if (validDiameters.length > 0) {
        const { error: diamError } = await supabase
          .from('core_description_external_diameters')
          .insert(
            validDiameters.map((d) => ({
              core_description_task_id: task.id,
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
    }

    setSubmitting(false)
    navigate(`/sites/${siteId}`)
  }

  return (
    <div style={{ maxWidth: 460 }}>
      <Link to={`/sites/${siteId}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13.5, marginBottom: 10 }}>
        <ChevronLeft size={15} /> Участок
      </Link>
      <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Layers size={24} className="text-muted" /> {isEditMode ? 'Правка задания: описание керна' : 'Новое задание: описание керна'}
      </h1>
      {loadingTask ? (
        <p>Загрузка задания…</p>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 10 }}>
          <fieldset>
            <legend>Скважина</legend>
            <label style={{ display: 'block' }}>
              <input
                type="radio"
                checked={wellSource === 'own'}
                onChange={() => setWellSource('own')}
              />{' '}
              Своя скважина (есть задание на бурение в системе)
            </label>
            <label style={{ display: 'block' }}>
              <input
                type="radio"
                checked={wellSource === 'external'}
                onChange={() => setWellSource('external')}
              />{' '}
              Скважина подрядчика (вручную)
            </label>
          </fieldset>

          <fieldset>
            <legend>Тип документации</legend>
            <label style={{ display: 'block' }}>
              <input
                type="radio"
                checked={documentationType === 'geological'}
                onChange={() => setDocumentationType('geological')}
              />{' '}
              Геологическая
            </label>
            <label style={{ display: 'block' }}>
              <input
                type="radio"
                checked={documentationType === 'geotechnical'}
                onChange={() => setDocumentationType('geotechnical')}
              />{' '}
              Геотехническая
            </label>
            <p className="text-muted" style={{ fontSize: 12.5, margin: '6px 0 0' }}>
              Идут по одной скважине независимо — если нужны обе, заведите два задания.
            </p>
          </fieldset>

          {wellSource === 'own' ? (
            <label>
              Выбор скважины
              <select
                required
                value={selectedDrillingTaskId}
                onChange={(e) => setSelectedDrillingTaskId(e.target.value)}
              >
                <option value="">— выбрать —</option>
                {ownDrillingTasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    Скважина №{t.well_number}
                  </option>
                ))}
              </select>
              {ownDrillingTasks.length === 0 && (
                <p className="text-muted" style={{ fontSize: 13 }}>
                  На этом участке пока нет заданий на бурение — сначала создайте
                  их, либо выберите "скважина подрядчика".
                </p>
              )}
            </label>
          ) : (
            <>
              <label>
                Номер скважины
                <input
                  required
                  value={extWellNumber}
                  onChange={(e) => setExtWellNumber(e.target.value)}
                />
              </label>
              <label>
                Организация-подрядчик
                <select
                  value={extOrgId}
                  onChange={(e) => setExtOrgId(e.target.value)}
                >
                  <option value="">— выбрать —</option>
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </select>
              </label>

              <fieldset>
                <legend>Координаты WGS-84</legend>
                <input
                  type="number"
                  step="any"
                  placeholder="широта"
                  value={extLat}
                  onChange={(e) => setExtLat(e.target.value)}
                />
                <input
                  type="number"
                  step="any"
                  placeholder="долгота"
                  value={extLon}
                  onChange={(e) => setExtLon(e.target.value)}
                />
              </fieldset>

              <fieldset>
                <legend>Местные координаты</legend>
                <input
                  type="number"
                  step="any"
                  placeholder="X"
                  value={extX}
                  onChange={(e) => setExtX(e.target.value)}
                />
                <input
                  type="number"
                  step="any"
                  placeholder="Y"
                  value={extY}
                  onChange={(e) => setExtY(e.target.value)}
                />
              </fieldset>

              <label>
                Абсолютная отметка устья, м
                <input
                  type="number"
                  step="any"
                  value={extElevation}
                  onChange={(e) => setExtElevation(e.target.value)}
                />
              </label>
              <label>
                Проектная глубина, м
                <input
                  type="number"
                  step="any"
                  value={extProjectedDepth}
                  onChange={(e) => setExtProjectedDepth(e.target.value)}
                />
              </label>
              <label>
                Угол бурения, °
                <input
                  type="number"
                  step="any"
                  value={extAngle}
                  onChange={(e) => setExtAngle(e.target.value)}
                />
              </label>
              <label>
                Азимут бурения, °
                <input
                  type="number"
                  step="any"
                  value={extAzimuth}
                  onChange={(e) => setExtAzimuth(e.target.value)}
                />
              </label>

              <DiameterIntervalsEditor
                rows={extDiameters}
                onChange={setExtDiameters}
              />

              <label>
                Ответственный (вносит сводки по этой скважине)
                <select
                  required
                  value={assignedPartyChiefId}
                  onChange={(e) => setAssignedPartyChiefId(e.target.value)}
                >
                  <option value="">— выбрать —</option>
                  {partyChiefs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          <label>
            <input
              type="checkbox"
              checked={shiftEnabled}
              onChange={(e) => setShiftEnabled(e.target.checked)}
            />{' '}
            Работа по сменам (для бурения — всегда; для описания керна —
            настраивается, см. ТЗ)
          </label>

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
      )}
    </div>
  )
}
