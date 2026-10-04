import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Check, Layers, Map as MapIcon, Pencil, Satellite, Trash2, Undo2, X } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { isManagement } from '../../types/roles'
import { round2 } from '../../lib/taskProgress'
import WellMapCard from '../../components/WellMapCard'
import type { WellProgressInfo } from '../../components/WellMapCard'
import { TaskStatusBadge } from '../../components/StatusBadge'
import type { DrillingChartRow } from '../../components/DrillingProgressChart'
import type { DrillingTask, Profile, Site } from '../../types/database'

// Карта участков (03.10.2026, переработана 04.10.2026). Слева — карта (точки
// скважин по WGS-84, контур участка, две подложки), справа на ПК — панель:
// без выбора — сводка и список скважин, при клике на точку или строку — карточка
// скважины с графиком проходки. На телефоне карточка — нижняя шторка.
// Клик по точке не уводит на дашборд: переход — кнопкой в карточке.
// Скважины «в работе» пульсируют на карте. Офлайн-карты — отдельный этап.

type LatLon = [number, number]
type BaseLayer = 'osm' | 'sat'

const TILE_LAYERS: Record<BaseLayer, { url: string; attribution: string; maxZoom: number }> = {
  osm: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© участники OpenStreetMap',
    maxZoom: 19,
  },
  sat: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Снимки © Esri, Maxar, Earthstar Geographics',
    maxZoom: 19,
  },
}

const HATCH_ID = 'gqg-boundary-hatch'

function cssVar(name: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

function wellColor(w: DrillingTask) {
  if (w.status === 'completed' && w.closed_reason === 'depth_reached') return cssVar('--color-success', '#3f7d4e')
  if (w.status === 'completed' && w.closed_reason) return cssVar('--color-danger', '#b3402f')
  if (w.status === 'completed') return cssVar('--color-text-muted', '#7a6f60')
  if (w.status === 'in_progress') return cssVar('--color-accent', '#c1652f')
  if (w.status === 'suspended') return '#d9a441'
  return cssVar('--color-text-faint', '#a39a8c')
}

const LEGEND: { label: string; color: string }[] = [
  { label: 'В работе', color: '--color-accent' },
  { label: 'Запланирована', color: '--color-text-faint' },
  { label: 'Приостановлена', color: '#d9a441' },
  { label: 'Закрыта: глубина', color: '--color-success' },
  { label: 'Закрыта: авария / другое', color: '--color-danger' },
]

function statusText(w: DrillingTask) {
  if (w.status === 'completed' && w.closed_reason === 'depth_reached') return 'Закрыта: глубина'
  if (w.status === 'completed' && w.closed_reason === 'accident') return 'Закрыта: авария'
  if (w.status === 'completed' && w.closed_reason) return 'Закрыта'
  if (w.status === 'completed') return 'Завершена'
  if (w.status === 'in_progress') return 'В работе'
  if (w.status === 'suspended') return 'Приостановлена'
  return 'Запланирована'
}

interface ReportRow {
  drilling_task_id: string
  report_date: string
  shift_number: number | null
  drilling_meters: number | null
  approval_status: string
}

function addDaysIso(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// График проходки скважины для карточки — те же данные, что на дашборде
// задания («по дням» -> столбики по сменам, накопленный факт, план).
function buildChartRows(well: DrillingTask, reps: ReportRow[]): DrillingChartRow[] {
  const counted = reps.filter((r) => r.approval_status === 'approved' || r.approval_status === 'submitted')
  if (counted.length === 0) return []
  const today = new Date().toISOString().slice(0, 10)
  const dates = counted.map((r) => r.report_date).sort()
  const start = well.start_date && well.start_date <= dates[0] ? well.start_date : dates[0]
  let end = dates[dates.length - 1]
  if (well.status === 'in_progress' && today > end) end = today
  if (well.closed_at && well.closed_at > end) end = well.closed_at

  const rows: DrillingChartRow[] = []
  let cumApproved = 0
  let cumKnown = 0
  for (let d = start, i = 0; d <= end && i < 400; d = addDaysIso(d, 1), i++) {
    const cell = (shift: number) => {
      const list = counted.filter((r) => r.report_date === d && r.shift_number === shift)
      if (list.length === 0) return { meters: null as number | null, approved: false }
      const approved = list.some((r) => r.approval_status === 'approved')
      const pick = list.filter((r) => r.approval_status === (approved ? 'approved' : 'submitted'))
      return { meters: round2(pick.reduce((s, r) => s + (r.drilling_meters ?? 0), 0)), approved }
    }
    const c1 = cell(1)
    const c2 = cell(2)
    const dayApproved = (c1.approved ? (c1.meters ?? 0) : 0) + (c2.approved ? (c2.meters ?? 0) : 0)
    const dayKnown = (c1.meters ?? 0) + (c2.meters ?? 0)
    cumApproved = round2(cumApproved + dayApproved)
    cumKnown = round2(cumKnown + dayKnown)
    rows.push({
      date: d,
      shift1: c1.meters,
      shift1Approved: c1.approved,
      shift2: c2.meters,
      shift2Approved: c2.approved,
      cumApproved,
      cumKnown,
      plannedCumulative:
        well.planned_daily_meters != null && well.projected_depth != null
          ? round2(Math.min(well.planned_daily_meters * (i + 1), well.projected_depth))
          : null,
    })
  }
  return rows
}

export default function SiteMap() {
  const { session, profile, loading: authLoading } = useAuth()
  const canEdit = isManagement(profile?.role)

  const [sites, setSites] = useState<Site[]>([])
  const [wells, setWells] = useState<DrillingTask[]>([])
  const [progress, setProgress] = useState<Record<string, WellProgressInfo>>({})
  const [orgs, setOrgs] = useState<Record<string, string>>({})
  const [rigs, setRigs] = useState<Record<string, string>>({})
  const [foremen, setForemen] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [siteId, setSiteId] = useState('')
  const [showPlanned, setShowPlanned] = useState(true)
  const [baseLayer, setBaseLayer] = useState<BaseLayer>('osm')
  const [selectedWellId, setSelectedWellId] = useState<string | null>(null)
  const [chartRows, setChartRows] = useState<DrillingChartRow[]>([])

  // Рисование контура
  const [drawing, setDrawing] = useState(false)
  const [drawPoints, setDrawPoints] = useState<LatLon[]>([])
  const [saving, setSaving] = useState(false)
  const drawingRef = useRef(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const tileRef = useRef<L.TileLayer | null>(null)
  const rendererRef = useRef<L.SVG | null>(null)
  const dataLayerRef = useRef<L.LayerGroup | null>(null)
  const drawLayerRef = useRef<L.LayerGroup | null>(null)
  const fitKeyRef = useRef('')

  drawingRef.current = drawing

  // ---- данные ----
  useEffect(() => {
    if (!session || !profile) return
    let cancelled = false
    async function load() {
      setLoading(true)
      const [sitesRes, wellsRes, orgsRes, rigsRes] = await Promise.all([
        supabase.from('sites').select('*').order('name'),
        supabase.from('drilling_tasks').select('*'),
        supabase.from('drilling_organizations').select('id, name'),
        supabase.from('drilling_rigs').select('id, rig_number'),
      ])
      if (cancelled) return
      if (sitesRes.error) {
        setError(sitesRes.error.message)
        setLoading(false)
        return
      }
      const siteList = (sitesRes.data ?? []) as Site[]
      const wellList = (wellsRes.data ?? []) as DrillingTask[]
      setSites(siteList)
      setWells(wellList)
      setOrgs(Object.fromEntries(((orgsRes.data ?? []) as { id: string; name: string }[]).map((o) => [o.id, o.name])))
      setRigs(Object.fromEntries(((rigsRes.data ?? []) as { id: string; rig_number: string }[]).map((r) => [r.id, r.rig_number])))

      // Прогресс бурения: свои сводки видны напрямую (руководству — все),
      // по чужим скважинам (геолог) — только итог через RPC.
      const info: Record<string, WellProgressInfo> = {}
      for (const w of wellList) info[w.id] = { approved: 0, submitted: 0, shifts: 0 }
      const { data: reps } = await supabase
        .from('reports')
        .select('drilling_task_id, drilling_meters, approval_status')
        .not('drilling_task_id', 'is', null)
      for (const r of (reps ?? []) as { drilling_task_id: string; drilling_meters: number | null; approval_status: string }[]) {
        const e = info[r.drilling_task_id]
        if (!e) continue
        e.shifts += 1
        if (r.approval_status === 'approved') e.approved += r.drilling_meters ?? 0
        else if (r.approval_status === 'submitted') e.submitted += r.drilling_meters ?? 0
      }
      if (!isManagement(profile!.role)) {
        const foreign = wellList.filter((w) => w.foreman_id !== profile!.id)
        await Promise.all(
          foreign.map(async (w) => {
            const { data } = await supabase.rpc('drilling_task_progress', { p_drilling_task_id: w.id })
            const row = Array.isArray(data) ? data[0] : data
            info[w.id] = {
              approved: row ? Number(row.approved ?? 0) : 0,
              submitted: row ? Number(row.submitted ?? 0) : 0,
              shifts: -1,
            }
          }),
        )
      }
      for (const k of Object.keys(info)) {
        info[k].approved = round2(info[k].approved)
        info[k].submitted = round2(info[k].submitted)
      }
      if (cancelled) return
      setProgress(info)

      // Имена бригадиров видны только руководству (RLS profiles)
      if (isManagement(profile!.role)) {
        const ids = [...new Set(wellList.flatMap((w) => [w.foreman_id, w.created_by]).filter((x): x is string => Boolean(x)))]
        if (ids.length > 0) {
          const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', ids)
          if (!cancelled) setForemen(Object.fromEntries(((profs ?? []) as Pick<Profile, 'id' | 'full_name'>[]).map((p) => [p.id, p.full_name])))
        }
      }
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [session, profile])

  const visibleSites = useMemo(() => (siteId ? sites.filter((s) => s.id === siteId) : sites), [sites, siteId])
  const siteWells = useMemo(
    () => wells.filter((w) => (!siteId || w.site_id === siteId) && (showPlanned || w.status !== 'planned')),
    [wells, siteId, showPlanned],
  )
  const visibleWells = useMemo(() => siteWells.filter((w) => w.coord_wgs84_lat != null && w.coord_wgs84_lon != null), [siteWells])
  const selectedWell = wells.find((w) => w.id === selectedWellId) ?? null
  const selectedSite = sites.find((s) => s.id === siteId) ?? null

  // График выбранной скважины — загружаем сводки при выборе (видны только свои)
  useEffect(() => {
    if (!selectedWell) {
      setChartRows([])
      return
    }
    let cancelled = false
    supabase
      .from('reports')
      .select('drilling_task_id, report_date, shift_number, drilling_meters, approval_status')
      .eq('drilling_task_id', selectedWell.id)
      .then(({ data }) => {
        if (cancelled) return
        setChartRows(buildChartRows(selectedWell, (data ?? []) as ReportRow[]))
      })
    return () => {
      cancelled = true
    }
  }, [selectedWell])

  // ---- инициализация карты ----
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = L.map(containerRef.current, { zoomControl: true, attributionControl: true }).setView([48, 68], 5)
    mapRef.current = map

    // SVG-рендерер с шаблоном штриховки для заливки контура участка
    const renderer = L.svg({ padding: 0.5 }).addTo(map)
    const svg = (renderer as unknown as { _container: SVGSVGElement })._container
    const accent = cssVar('--color-accent', '#c1652f')
    svg.insertAdjacentHTML(
      'afterbegin',
      `<defs><pattern id="${HATCH_ID}" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
        `<line x1="0" y1="0" x2="0" y2="9" stroke="${accent}" stroke-width="2" stroke-opacity="0.6"/></pattern></defs>`,
    )
    rendererRef.current = renderer

    dataLayerRef.current = L.layerGroup().addTo(map)
    drawLayerRef.current = L.layerGroup().addTo(map)
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (drawingRef.current) setDrawPoints((prev) => [...prev, [e.latlng.lat, e.latlng.lng]])
    })
    return () => {
      map.remove()
      mapRef.current = null
      tileRef.current = null
      rendererRef.current = null
      dataLayerRef.current = null
      drawLayerRef.current = null
    }
  }, [loading])

  // ---- подложка ----
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (tileRef.current) map.removeLayer(tileRef.current)
    const cfg = TILE_LAYERS[baseLayer]
    tileRef.current = L.tileLayer(cfg.url, { attribution: cfg.attribution, maxZoom: cfg.maxZoom }).addTo(map)
    tileRef.current.bringToBack()
  }, [baseLayer, loading])

  // Стиль контура: оранжевая пунктирная линия + заливка штриховкой
  function boundaryStyle(): L.PolylineOptions {
    return {
      color: cssVar('--color-accent', '#c1652f'),
      weight: 2.5,
      dashArray: '7 5',
      fill: true,
      fillColor: `url(#${HATCH_ID})`,
      fillOpacity: 1,
      renderer: rendererRef.current ?? undefined,
    }
  }

  // ---- контуры и точки ----
  useEffect(() => {
    const map = mapRef.current
    const layer = dataLayerRef.current
    if (!map || !layer) return
    layer.clearLayers()
    const bounds: L.LatLngTuple[] = []

    for (const s of visibleSites) {
      if (!s.boundary || (drawing && s.id === siteId)) continue
      const poly = L.polygon(s.boundary as LatLon[], boundaryStyle()).addTo(layer)
      poly.bindTooltip(s.name, { sticky: true })
      for (const pt of s.boundary as LatLon[]) bounds.push(pt)
    }

    for (const w of visibleWells) {
      const pt: L.LatLngTuple = [w.coord_wgs84_lat as number, w.coord_wgs84_lon as number]
      const color = wellColor(w)
      const active = w.status === 'in_progress'
      const selected = w.id === selectedWellId
      // Точка — div-иконка: у скважин «в работе» два расходящихся кольца
      // (CSS-анимация, отключается при prefers-reduced-motion)
      const icon = L.divIcon({
        className: 'map-well-icon',
        iconSize: [26, 26],
        iconAnchor: [13, 13],
        html:
          (active ? `<span class="map-pulse" style="--c:${color}"></span><span class="map-pulse map-pulse-2" style="--c:${color}"></span>` : '') +
          `<span class="map-dot${selected ? ' is-selected' : ''}" style="background:${color}"></span>`,
      })
      const marker = L.marker(pt, { icon, keyboard: true, title: `Скважина №${w.well_number}` }).addTo(layer)
      marker.bindTooltip(w.well_number, { permanent: true, direction: 'right', offset: [12, 0], className: 'map-well-label' })
      marker.on('click', (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e)
        if (!drawingRef.current) setSelectedWellId(w.id)
      })
      bounds.push(pt)
    }

    // Подгонка вида — один раз при смене выбранного участка / загрузке
    const key = `${siteId}|${visibleWells.length}|${visibleSites.filter((s) => s.boundary).length}`
    if (fitKeyRef.current !== key && bounds.length > 0) {
      fitKeyRef.current = key
      map.fitBounds(L.latLngBounds(bounds), { padding: [60, 60], maxZoom: 15 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleSites, visibleWells, selectedWellId, siteId, drawing, loading])

  // ---- черновик контура ----
  useEffect(() => {
    const layer = drawLayerRef.current
    if (!layer) return
    layer.clearLayers()
    if (!drawing) return
    if (drawPoints.length >= 3) {
      L.polygon(drawPoints, boundaryStyle()).addTo(layer)
    } else if (drawPoints.length >= 2) {
      L.polyline(drawPoints, { color: cssVar('--color-accent', '#c1652f'), weight: 2.5, dashArray: '7 5' }).addTo(layer)
    }
    drawPoints.forEach((pt, i) => {
      const m = L.marker(pt, {
        draggable: true,
        icon: L.divIcon({ className: 'map-vertex', iconSize: [16, 16], iconAnchor: [8, 8], html: '<span></span>' }),
      }).addTo(layer)
      m.on('dragend', () => {
        const ll = m.getLatLng()
        setDrawPoints((prev) => prev.map((p, j) => (j === i ? [ll.lat, ll.lng] : p)))
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawing, drawPoints])

  if (authLoading) return <p>Загрузка…</p>
  if (!session) return <Navigate to="/login" replace />

  function selectWell(w: DrillingTask) {
    setSelectedWellId(w.id)
    const map = mapRef.current
    if (map && w.coord_wgs84_lat != null && w.coord_wgs84_lon != null) {
      map.flyTo([w.coord_wgs84_lat, w.coord_wgs84_lon], Math.max(map.getZoom(), 15), { duration: 0.8 })
    }
  }

  function startDrawing(existing: LatLon[] | null) {
    setSelectedWellId(null)
    setDrawPoints(existing ?? [])
    setDrawing(true)
  }

  async function saveBoundary() {
    if (!selectedSite || drawPoints.length < 3) return
    setSaving(true)
    setError(null)
    const { data, error: updError } = await supabase
      .from('sites')
      .update({ boundary: drawPoints })
      .eq('id', selectedSite.id)
      .select()
    setSaving(false)
    if (updError) {
      setError(
        updError.message.includes('boundary')
          ? 'Не применена миграция 0024 (поле boundary у участков). Примените её в Supabase SQL Editor.'
          : updError.message,
      )
      return
    }
    if (!data || data.length === 0) {
      setError('Не удалось сохранить контур: нет прав на изменение участка.')
      return
    }
    setSites((prev) => prev.map((s) => (s.id === selectedSite.id ? ({ ...s, boundary: drawPoints } as Site) : s)))
    setDrawing(false)
    setDrawPoints([])
  }

  async function deleteBoundary() {
    if (!selectedSite) return
    setSaving(true)
    setError(null)
    const { data, error: updError } = await supabase
      .from('sites')
      .update({ boundary: null })
      .eq('id', selectedSite.id)
      .select()
    setSaving(false)
    if (updError || !data || data.length === 0) {
      setError(updError?.message ?? 'Не удалось удалить контур.')
      return
    }
    setSites((prev) => prev.map((s) => (s.id === selectedSite.id ? ({ ...s, boundary: null } as Site) : s)))
  }

  // Сводка для правой панели (без выбранной скважины)
  const inWork = siteWells.filter((w) => w.status === 'in_progress').length
  const closedCount = siteWells.filter((w) => w.status === 'completed').length
  const totalDrilled = round2(siteWells.reduce((s, w) => s + (progress[w.id]?.approved ?? 0), 0))
  const totalPlan = round2(siteWells.reduce((s, w) => s + (w.projected_depth ?? 0), 0))
  const sortedWells = [...siteWells].sort((a, b) => {
    const rank = (w: DrillingTask) => (w.status === 'in_progress' ? 0 : w.status === 'suspended' ? 1 : w.status === 'planned' ? 2 : 3)
    return rank(a) - rank(b) || a.well_number.localeCompare(b.well_number)
  })

  return (
    <div>
      <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 0 }}>
        <MapIcon size={24} className="text-muted" /> Карта
      </h1>

      <div className="map-toolbar">
        <select
          value={siteId}
          onChange={(e) => {
            setSiteId(e.target.value)
            setSelectedWellId(null)
            setDrawing(false)
          }}
          aria-label="Участок"
        >
          <option value="">Все участки</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <div className="map-segment" role="group" aria-label="Подложка">
          <button type="button" className={baseLayer === 'osm' ? 'is-active' : ''} onClick={() => setBaseLayer('osm')}>
            <Layers size={15} /> Схема
          </button>
          <button type="button" className={baseLayer === 'sat' ? 'is-active' : ''} onClick={() => setBaseLayer('sat')}>
            <Satellite size={15} /> Спутник
          </button>
        </div>

        <label className="map-toggle">
          <input type="checkbox" checked={showPlanned} onChange={(e) => setShowPlanned(e.target.checked)} />
          Показывать запланированные
        </label>

        {canEdit && selectedSite && !drawing && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn-outline" onClick={() => startDrawing((selectedSite.boundary as LatLon[] | null) ?? null)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Pencil size={15} /> {selectedSite.boundary ? 'Изменить контур' : 'Нарисовать контур'}
            </button>
            {selectedSite.boundary && (
              <button type="button" className="btn-outline" disabled={saving} onClick={deleteBoundary} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Trash2 size={15} /> Удалить контур
              </button>
            )}
          </div>
        )}
      </div>

      {canEdit && !siteId && (
        <p className="text-muted" style={{ fontSize: 13, margin: '0 0 8px' }}>
          Чтобы нарисовать контур, выберите участок.
        </p>
      )}

      {drawing && (
        <div className="card map-draw-panel">
          <b>Контур участка «{selectedSite?.name}»</b>
          <span className="text-muted" style={{ fontSize: 13 }}>
            Нажимайте на карту, чтобы ставить вершины; вершины можно перетаскивать. Нужно минимум 3 точки (сейчас {drawPoints.length}).
          </span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" disabled={drawPoints.length < 3 || saving} onClick={saveBoundary} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Check size={15} /> {saving ? 'Сохраняем…' : 'Сохранить контур'}
            </button>
            <button type="button" className="btn-outline" disabled={drawPoints.length === 0} onClick={() => setDrawPoints((p) => p.slice(0, -1))} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Undo2 size={15} /> Убрать точку
            </button>
            <button type="button" className="btn-outline" onClick={() => { setDrawing(false); setDrawPoints([]) }} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <X size={15} /> Отмена
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-error">{error}</p>}

      <div className="map-layout">
        <div className="map-wrap">
          {loading ? <div className="skeleton" style={{ height: '100%', borderRadius: 'var(--radius-md)' }} /> : <div ref={containerRef} className="map-canvas" />}
          <div className="map-legend" aria-label="Легенда">
            {LEGEND.map((l) => (
              <span key={l.label}>
                <i style={{ background: l.color.startsWith('--') ? `var(${l.color})` : l.color }} /> {l.label}
              </span>
            ))}
          </div>
        </div>

        <aside className="map-side" aria-label="Информация о скважинах">
          {selectedWell && !drawing ? (
            <WellMapCard
              well={selectedWell}
              progress={progress[selectedWell.id] ?? { approved: 0, submitted: 0, shifts: -1 }}
              orgName={selectedWell.drilling_org_id ? (orgs[selectedWell.drilling_org_id] ?? null) : null}
              rigNumber={selectedWell.drilling_rig_id ? (rigs[selectedWell.drilling_rig_id] ?? null) : null}
              foremanName={selectedWell.foreman_id ? (foremen[selectedWell.foreman_id] ?? null) : null}
              chartRows={chartRows}
              createdByName={foremen[selectedWell.created_by] ?? null}
              onClose={() => setSelectedWellId(null)}
            />
          ) : (
            <div className="card map-overview">
              <h2 style={{ margin: '0 0 10px', fontSize: 17 }}>{selectedSite ? selectedSite.name : 'Все участки'}</h2>
              {!loading && (
                <div className="map-kpis">
                  <div>
                    <b className="num">{siteWells.length}</b>
                    <span>скважин</span>
                  </div>
                  <div>
                    <b className="num" style={{ color: 'var(--color-accent)' }}>{inWork}</b>
                    <span>в работе</span>
                  </div>
                  <div>
                    <b className="num">{closedCount}</b>
                    <span>закрыто</span>
                  </div>
                  <div>
                    <b className="num">{totalDrilled}</b>
                    <span>{totalPlan > 0 ? `из ${totalPlan} м` : 'м пробурено'}</span>
                  </div>
                </div>
              )}

              <div className="eyebrow" style={{ margin: '14px 0 6px' }}>Скважины</div>
              {loading ? (
                <div className="skeleton" style={{ height: 120, borderRadius: 'var(--radius-md)' }} />
              ) : sortedWells.length === 0 ? (
                <p className="text-muted" style={{ margin: 0 }}>Скважин пока нет.</p>
              ) : (
                <ul className="map-well-list">
                  {sortedWells.map((w) => {
                    const pr = progress[w.id]
                    const pct = w.projected_depth ? Math.min(100, ((pr?.approved ?? 0) / w.projected_depth) * 100) : null
                    const hasCoords = w.coord_wgs84_lat != null && w.coord_wgs84_lon != null
                    return (
                      <li key={w.id}>
                        <button type="button" onClick={() => selectWell(w)} className="map-well-row">
                          <i style={{ background: wellColor(w) }} className={w.status === 'in_progress' ? 'is-live' : undefined} />
                          <span className="map-well-row-main">
                            <b>№{w.well_number}</b>
                            <span className="text-muted">
                              {statusText(w)}
                              {!hasCoords && ' · нет координат'}
                            </span>
                            {pct != null && (
                              <span className="map-well-bar">
                                <span style={{ width: `${pct}%`, background: wellColor(w) }} />
                              </span>
                            )}
                          </span>
                          <span className="num" style={{ fontSize: 13 }}>
                            {pct != null ? `${Math.round(pct)}%` : '—'}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}

              <div className="eyebrow" style={{ margin: '14px 0 6px' }}>Обозначения</div>
              <div className="map-legend-inline">
                {LEGEND.map((l) => (
                  <span key={l.label}>
                    <i style={{ background: l.color.startsWith('--') ? `var(${l.color})` : l.color }} /> {l.label}
                  </span>
                ))}
                <span>
                  <TaskStatusBadge status="in_progress" /> пульсирует на карте
                </span>
              </div>
              <p className="text-muted" style={{ fontSize: 12.5, margin: '12px 0 0' }}>
                Нажмите на точку на карте или на скважину в списке, чтобы увидеть описание и прогресс.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
