import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Layers, Map as MapIcon, Pencil, Satellite, Trash2, Undo2, X, Check } from 'lucide-react'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { isManagement } from '../../types/roles'
import WellMapCard from '../../components/WellMapCard'
import type { WellProgressInfo } from '../../components/WellMapCard'
import type { DrillingTask, Profile, Site } from '../../types/database'

// Карта участков (03.10.2026). Точки скважин (WGS-84 из заданий на бурение),
// контур каждого участка (рисует и правит руководство), две подложки:
// схема (OpenStreetMap) и спутник (Esri World Imagery). Клик по точке не
// уводит на дашборд, а открывает карточку скважины с кратким описанием и
// прогрессом; из карточки есть переход на дашборд задания.
// Офлайн-карты (предзагрузка участка) — отдельный следующий этап.

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
  const [baseLayer, setBaseLayer] = useState<BaseLayer>('osm')
  const [selectedWellId, setSelectedWellId] = useState<string | null>(null)

  // Рисование контура
  const [drawing, setDrawing] = useState(false)
  const [drawPoints, setDrawPoints] = useState<LatLon[]>([])
  const [saving, setSaving] = useState(false)
  const drawingRef = useRef(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const tileRef = useRef<L.TileLayer | null>(null)
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
      if (cancelled) return
      setProgress(info)

      // Имена бригадиров видны только руководству (RLS profiles)
      if (isManagement(profile!.role)) {
        const ids = [...new Set(wellList.map((w) => w.foreman_id))]
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
  const visibleWells = useMemo(
    () => wells.filter((w) => (!siteId || w.site_id === siteId) && w.coord_wgs84_lat != null && w.coord_wgs84_lon != null),
    [wells, siteId],
  )
  const withoutCoords = useMemo(
    () => wells.filter((w) => (!siteId || w.site_id === siteId) && (w.coord_wgs84_lat == null || w.coord_wgs84_lon == null)),
    [wells, siteId],
  )
  const selectedWell = wells.find((w) => w.id === selectedWellId) ?? null
  const selectedSite = sites.find((s) => s.id === siteId) ?? null

  // ---- инициализация карты ----
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = L.map(containerRef.current, { zoomControl: true, attributionControl: true }).setView([48, 68], 5)
    mapRef.current = map
    dataLayerRef.current = L.layerGroup().addTo(map)
    drawLayerRef.current = L.layerGroup().addTo(map)
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (drawingRef.current) setDrawPoints((prev) => [...prev, [e.latlng.lat, e.latlng.lng]])
    })
    return () => {
      map.remove()
      mapRef.current = null
      tileRef.current = null
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

  // ---- контуры и точки ----
  useEffect(() => {
    const map = mapRef.current
    const layer = dataLayerRef.current
    if (!map || !layer) return
    layer.clearLayers()
    const bounds: L.LatLngTuple[] = []

    for (const s of visibleSites) {
      if (!s.boundary || (drawing && s.id === siteId)) continue
      const poly = L.polygon(s.boundary as LatLon[], {
        color: cssVar('--color-primary', '#2f4a3e'),
        weight: 2.5,
        fillOpacity: 0.1,
      }).addTo(layer)
      poly.bindTooltip(s.name, { sticky: true })
      for (const pt of s.boundary as LatLon[]) bounds.push(pt)
    }

    for (const w of visibleWells) {
      const pt: L.LatLngTuple = [w.coord_wgs84_lat as number, w.coord_wgs84_lon as number]
      const marker = L.circleMarker(pt, {
        radius: w.id === selectedWellId ? 13 : 10,
        color: '#ffffff',
        weight: 3,
        fillColor: wellColor(w),
        fillOpacity: 1,
      }).addTo(layer)
      marker.bindTooltip(w.well_number, { permanent: true, direction: 'right', offset: [10, 0], className: 'map-well-label' })
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
      map.fitBounds(L.latLngBounds(bounds), { padding: [50, 50], maxZoom: 15 })
    }
  }, [visibleSites, visibleWells, selectedWellId, siteId, drawing, loading])

  // ---- черновик контура ----
  useEffect(() => {
    const layer = drawLayerRef.current
    if (!layer) return
    layer.clearLayers()
    if (!drawing) return
    const color = cssVar('--color-accent', '#c1652f')
    if (drawPoints.length >= 3) {
      L.polygon(drawPoints, { color, weight: 2.5, dashArray: '6 4', fillOpacity: 0.12 }).addTo(layer)
    } else if (drawPoints.length >= 2) {
      L.polyline(drawPoints, { color, weight: 2.5, dashArray: '6 4' }).addTo(layer)
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
  }, [drawing, drawPoints])

  if (authLoading) return <p>Загрузка…</p>
  if (!session) return <Navigate to="/login" replace />

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

  return (
    <div>
      <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 0 }}>
        <MapIcon size={24} className="text-muted" /> Карта
      </h1>

      <div className="map-toolbar">
        <select value={siteId} onChange={(e) => { setSiteId(e.target.value); setSelectedWellId(null); setDrawing(false) }} aria-label="Участок">
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

      <div className="map-wrap">
        {loading ? <div className="skeleton" style={{ height: '100%', borderRadius: 'var(--radius-md)' }} /> : <div ref={containerRef} className="map-canvas" />}

        {selectedWell && !drawing && (
          <WellMapCard
            well={selectedWell}
            progress={progress[selectedWell.id] ?? { approved: 0, submitted: 0, shifts: -1 }}
            orgName={orgs[selectedWell.drilling_org_id] ?? null}
            rigNumber={selectedWell.drilling_rig_id ? (rigs[selectedWell.drilling_rig_id] ?? null) : null}
            foremanName={foremen[selectedWell.foreman_id] ?? null}
            onClose={() => setSelectedWellId(null)}
          />
        )}

        <div className="map-legend" aria-label="Легенда">
          {LEGEND.map((l) => (
            <span key={l.label}>
              <i style={{ background: l.color.startsWith('--') ? `var(${l.color})` : l.color }} /> {l.label}
            </span>
          ))}
        </div>
      </div>

      {!loading && withoutCoords.length > 0 && (
        <p className="text-muted" style={{ fontSize: 13, marginTop: 10 }}>
          Без координат WGS-84 (на карте не показаны): {withoutCoords.map((w) => `№${w.well_number}`).join(', ')}.
          {canEdit ? ' Укажите широту и долготу в настройках задания.' : ''}
        </p>
      )}
      {!loading && visibleWells.length === 0 && withoutCoords.length === 0 && <p className="text-muted">Скважин пока нет.</p>}
    </div>
  )
}
