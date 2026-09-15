import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { isManagement } from '../../types/roles'
import type { DrillingOrganization, DrillingTask, Profile } from '../../types/database'
import DiameterIntervalsEditor, {
  emptyDiameterRow,
  type DiameterRow,
} from '../../components/DiameterIntervalsEditor'

type WellSource = 'own' | 'external'

// Развилка "своя скважина / скважина подрядчика" — см. ТЗ раздел 8 (v0.6).
// Поля скважины подрядчика — те же, что у Drilling Task, но без персонала.
export default function CoreDescriptionTaskForm() {
  const { siteId } = useParams<{ siteId: string }>()
  const { session, profile, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  const [wellSource, setWellSource] = useState<WellSource>('own')
  const [shiftEnabled, setShiftEnabled] = useState(true)

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

  if (authLoading) return <p>Загрузка…</p>
  if (!session) return <Navigate to="/login" replace />
  if (!siteId) return <p>Не указан участок.</p>
  if (!isManagement(profile?.role)) {
    return <p>Создавать задания могут только гендир/техдир.</p>
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!profile) return
    setSubmitting(true)
    setError(null)

    interface InsertPayload {
      site_id: string
      shift_enabled: boolean
      created_by: string
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
      created_by: profile.id,
    }

    const payload: InsertPayload =
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

    const { data: task, error: insertError } = await supabase
      .from('core_description_tasks')
      .insert(payload)
      .select()
      .single()

    if (insertError || !task) {
      setError(insertError?.message ?? 'Не удалось создать задание')
      setSubmitting(false)
      return
    }

    if (wellSource === 'external') {
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
            `Задание создано, но не удалось сохранить диаметры: ${diamError.message}`,
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
    <div style={{ maxWidth: 420 }}>
      <h1>Новое задание: описание керна</h1>
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
              <p style={{ fontSize: 13, opacity: 0.7 }}>
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
              Ответственный начальник партии (вносит сводки по этой скважине)
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

        {error && <p style={{ color: '#c0392b' }}>{error}</p>}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Создаём…' : 'Создать задание'}
        </button>
      </form>
    </div>
  )
}
