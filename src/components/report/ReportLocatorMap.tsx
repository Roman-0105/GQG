import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export type LocatorBase = 'sat' | 'osm'

const TILES: Record<LocatorBase, { url: string; attribution: string; maxZoom: number }> = {
  osm: { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '© OpenStreetMap', maxZoom: 19 },
  sat: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Esri, Maxar, Earthstar Geographics',
    maxZoom: 18,
  },
}

interface Props {
  base: LocatorBase
  boundary: [number, number][] | null
  wells: { id: string; number: string; lat: number; lon: number }[]
  currentId: string
  height?: number
}

// Неинтерактивная карта-врезка для печатного отчёта: контур участка, соседние
// скважины точками, текущая скважина выделена и подписана. Подложка — спутник
// или схема (переключатель на панели отчёта). Без интернета рисуются только
// контур и точки на нейтральном фоне.
export default function ReportLocatorMap({ base, boundary, wells, currentId, height = 210 }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return
    const map = L.map(ref.current, {
      zoomControl: false,
      attributionControl: true,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      touchZoom: false,
    })
    L.tileLayer(TILES[base].url, { attribution: TILES[base].attribution, maxZoom: TILES[base].maxZoom }).addTo(map)

    const pts: [number, number][] = []
    if (boundary && boundary.length > 2) {
      L.polygon(boundary, { color: '#ff8a2a', weight: 3, dashArray: '8 5', fillColor: '#ff8a2a', fillOpacity: 0.14 }).addTo(map)
      pts.push(...boundary)
    }
    for (const w of wells) {
      if (w.id === currentId) continue
      L.circleMarker([w.lat, w.lon], { radius: 3.5, color: '#fff', weight: 1, fillColor: '#2a3a46', fillOpacity: 0.9 }).addTo(map)
      pts.push([w.lat, w.lon])
    }
    const cur = wells.find((w) => w.id === currentId)
    if (cur) {
      L.circleMarker([cur.lat, cur.lon], { radius: 8, color: '#fff', weight: 2.5, fillColor: '#b03a2e', fillOpacity: 1 })
        .bindTooltip(`№${cur.number}`, { permanent: true, direction: 'right', offset: [10, 0], className: 'rp-map-label' })
        .addTo(map)
      pts.push([cur.lat, cur.lon])
    }

    const fit = () => {
      map.invalidateSize()
      if (pts.length === 0) map.setView([49.0, 63.0], 5)
      else if (pts.length === 1) map.setView(pts[0], 15)
      else map.fitBounds(L.latLngBounds(pts), { padding: [24, 24], maxZoom: 16 })
    }
    fit()
    // контейнер может получить размер уже после монтирования (масштаб страницы) — подгоняем ещё раз
    const timers = [window.setTimeout(fit, 80), window.setTimeout(fit, 500)]
    L.control.scale({ metric: true, imperial: false, position: 'bottomleft' }).addTo(map)

    return () => {
      timers.forEach((t) => window.clearTimeout(t))
      map.remove()
    }
  }, [base, boundary, wells, currentId])

  return <div ref={ref} className="rp-map" style={{ height, width: '100%', background: '#e8e4d6' }} />
}
