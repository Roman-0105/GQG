import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { CalendarClock, ChevronLeft, Table2 } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { isManagement } from '../../types/roles'

// Запланировать скважину (04.10.2026): номер, координаты WGS-84 и местные,
// абсолютная отметка устья, проектная глубина, угол, азимут и краткое описание.
// Организация, станок, бригадир, дата начала и план бурения НЕ нужны — их
// назначают позже, когда скважину запускают в бурение («Запустить бурение»).
export default function PlanWellForm() {
  const { siteId } = useParams<{ siteId: string }>()
  const navigate = useNavigate()
  const { session, profile, loading: authLoading } = useAuth()

  const [existingNumbers, setExistingNumbers] = useState<string[]>([])
  const [wellNumber, setWellNumber] = useState('')
  const [lat, setLat] = useState('')
  const [lon, setLon] = useState('')
  const [x, setX] = useState('')
  const [y, setY] = useState('')
  const [elevation, setElevation] = useState('')
  const [depth, setDepth] = useState('')
  const [angle, setAngle] = useState('')
  const [azimuth, setAzimuth] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!session || !siteId) return
    supabase
      .from('drilling_tasks')
      .select('well_number')
      .eq('site_id', siteId)
      .then(({ data }) => setExistingNumbers(((data ?? []) as { well_number: string }[]).map((d) => d.well_number.trim().toLowerCase())))
  }, [session, siteId])

  if (authLoading) return <p>Загрузка…</p>
  if (!session) return <Navigate to="/login" replace />
  if (!isManagement(profile?.role)) return <p>Планировать скважины может только руководство.</p>
  if (!siteId) return <p>Не указан участок.</p>

  const duplicate = existingNumbers.includes(wellNumber.trim().toLowerCase())

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!profile) return
    if (duplicate) {
      setError('Скважина с таким номером уже есть на этом участке.')
      return
    }
    setSaving(true)
    setError(null)
    const { error: insError } = await supabase.from('drilling_tasks').insert({
      site_id: siteId,
      well_number: wellNumber.trim(),
      coord_wgs84_lat: Number(lat),
      coord_wgs84_lon: Number(lon),
      coord_local_x: Number(x),
      coord_local_y: Number(y),
      wellhead_elevation: Number(elevation),
      projected_depth: Number(depth),
      angle: Number(angle),
      azimuth: Number(azimuth),
      description: description.trim(),
      status: 'planned',
      created_by: profile.id,
    })
    setSaving(false)
    if (insError) {
      setError(
        insError.message.includes('drilling_tasks_assigned_when_started') || insError.message.includes('null value')
          ? 'Не применена миграция 0026 (запланированные скважины). Примените её в Supabase SQL Editor.'
          : insError.message,
      )
      return
    }
    navigate(`/sites/${siteId}?filter=planned`)
  }

  const num = (v: string, set: (s: string) => void, label: string, placeholder?: string) => (
    <label>
      {label}
      <input required type="number" step="any" inputMode="decimal" placeholder={placeholder} value={v} onChange={(e) => set(e.target.value)} />
    </label>
  )

  return (
    <div style={{ maxWidth: 900 }}>
      <Link to={`/sites/${siteId}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, marginBottom: 10 }}>
        <ChevronLeft size={15} /> Участок
      </Link>
      <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <CalendarClock size={24} className="text-muted" /> Запланировать скважину
      </h1>
      <p className="text-muted" style={{ marginTop: -6 }}>
        Организацию, станок, бригадира и дату начала бурения назначите позже, когда запустите бурение.{' '}
        <Link to={`/sites/${siteId}/tasks/drilling/plan-bulk`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Table2 size={14} /> Запланировать списком
        </Link>
      </p>

      <form onSubmit={handleSubmit} className="task-form-grid card" style={{ padding: 18 }}>
        <label>
          Номер скважины
          <input required value={wellNumber} onChange={(e) => setWellNumber(e.target.value)} />
          {duplicate && <span className="text-error" style={{ fontSize: 12 }}>Такой номер уже есть на участке</span>}
        </label>
        <div />
        {num(lat, setLat, 'Широта (WGS-84)', 'например 47.5123')}
        {num(lon, setLon, 'Долгота (WGS-84)', 'например 70.1234')}
        {num(x, setX, 'Местная координата X')}
        {num(y, setY, 'Местная координата Y')}
        {num(elevation, setElevation, 'Абсолютная отметка устья, м')}
        {num(depth, setDepth, 'Проектная глубина, м')}
        {num(angle, setAngle, 'Угол бурения, °')}
        {num(azimuth, setAzimuth, 'Азимут бурения, °')}
        <label className="span-2">
          Краткое описание
          <textarea required rows={3} placeholder="Назначение скважины, особенности" value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        {error && <p className="text-error span-2" style={{ margin: 0 }}>{error}</p>}
        <button type="submit" className="span-2" disabled={saving || duplicate}>
          {saving ? 'Сохраняем…' : 'Запланировать скважину'}
        </button>
      </form>
    </div>
  )
}
