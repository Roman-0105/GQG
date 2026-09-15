import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { isManagement } from '../../types/roles'
import type { DrillingOrganization, Profile } from '../../types/database'
import DiameterIntervalsEditor, {
  emptyDiameterRow,
  type DiameterRow,
} from '../../components/DiameterIntervalsEditor'

// Поля — см. ТЗ, раздел 3 (первоначальное задание) + раздел 3/v0.7
// (диаметры по интервалам, бригадир из списка).
export default function DrillingTaskForm() {
  const { siteId } = useParams<{ siteId: string }>()
  const { session, profile, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  const [organizations, setOrganizations] = useState<DrillingOrganization[]>([])
  const [foremen, setForemen] = useState<Profile[]>([])

  const [wellNumber, setWellNumber] = useState('')
  const [rigNumber, setRigNumber] = useState('')
  const [drillingOrgId, setDrillingOrgId] = useState('')
  const [coordLat, setCoordLat] = useState('')
  const [coordLon, setCoordLon] = useState('')
  const [coordX, setCoordX] = useState('')
  const [coordY, setCoordY] = useState('')
  const [elevation, setElevation] = useState('')
  const [foremanId, setForemanId] = useState('')
  const [startDate, setStartDate] = useState('')
  const [projectedDepth, setProjectedDepth] = useState('')
  const [angle, setAngle] = useState('')
  const [azimuth, setAzimuth] = useState('')
  const [diameters, setDiameters] = useState<DiameterRow[]>([emptyDiameterRow()])

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!session) return
    async function loadRefs() {
      const [orgsRes, foremenRes] = await Promise.all([
        supabase.from('drilling_organizations').select('*').order('name'),
        supabase
          .from('profiles')
          .select('*')
          .eq('role', 'party_chief')
          .order('full_name'),
      ])
      if (orgsRes.data) setOrganizations(orgsRes.data)
      if (foremenRes.data) setForemen(foremenRes.data)
    }
    loadRefs()
  }, [session])

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

    const validDiameters = diameters.filter(
      (d) => d.depth_from && d.depth_to && d.diameter,
    )

    const { data: task, error: insertError } = await supabase
      .from('drilling_tasks')
      .insert({
        site_id: siteId,
        well_number: wellNumber,
        rig_number: rigNumber || null,
        drilling_org_id: drillingOrgId,
        coord_wgs84_lat: coordLat ? Number(coordLat) : null,
        coord_wgs84_lon: coordLon ? Number(coordLon) : null,
        coord_local_x: coordX ? Number(coordX) : null,
        coord_local_y: coordY ? Number(coordY) : null,
        wellhead_elevation: elevation ? Number(elevation) : null,
        foreman_id: foremanId,
        start_date: startDate || null,
        projected_depth: projectedDepth ? Number(projectedDepth) : null,
        angle: angle ? Number(angle) : null,
        azimuth: azimuth ? Number(azimuth) : null,
        created_by: profile.id,
      })
      .select()
      .single()

    if (insertError || !task) {
      setError(insertError?.message ?? 'Не удалось создать задание')
      setSubmitting(false)
      return
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
          `Задание создано, но не удалось сохранить диаметры: ${diamError.message}`,
        )
        setSubmitting(false)
        return
      }
    }

    setSubmitting(false)
    navigate(`/sites/${siteId}`)
  }

  return (
    <div style={{ maxWidth: 420 }}>
      <h1>Новое задание: бурение скважины</h1>
      <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 10 }}>
        <label>
          Номер скважины
          <input
            required
            value={wellNumber}
            onChange={(e) => setWellNumber(e.target.value)}
          />
        </label>
        <label>
          Номер бурового станка
          <input value={rigNumber} onChange={(e) => setRigNumber(e.target.value)} />
        </label>
        <label>
          Организация бурения
          <select
            required
            value={drillingOrgId}
            onChange={(e) => setDrillingOrgId(e.target.value)}
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

        {error && <p style={{ color: '#c0392b' }}>{error}</p>}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Создаём…' : 'Создать задание'}
        </button>
      </form>
    </div>
  )
}
