import { Link } from 'react-router-dom'
import { ArrowRight, X } from 'lucide-react'
import DrillingProgressPanel from './DrillingProgressPanel'
import DrillingProgressChart from './DrillingProgressChart'
import type { DrillingChartRow } from './DrillingProgressChart'
import { TaskStatusBadge } from './StatusBadge'
import { round2 } from '../lib/taskProgress'
import { CLOSED_REASON_LABELS } from '../types/database'
import type { DrillingTask } from '../types/database'

export interface WellProgressInfo {
  approved: number
  submitted: number
  // число сводок по скважине; -1 — неизвестно (чужая скважина, сводок не видно)
  shifts: number
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function daysBetween(fromIso: string, toIso: string) {
  const a = Date.parse(`${fromIso}T00:00:00Z`)
  const b = Date.parse(`${toIso}T00:00:00Z`)
  return Math.round((b - a) / 86_400_000)
}

function fmtDate(iso: string) {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`
}

// Карточка скважины на карте (03.10.2026): краткое описание и прогресс
// бурения — как на дашборде задания, но без графика по сменам и списка
// бригады. Кнопка внизу ведёт на полный дашборд задания.
export default function WellMapCard({
  well,
  progress,
  orgName,
  rigNumber,
  foremanName,
  chartRows = [],
  createdByName = null,
  onClose,
}: {
  well: DrillingTask
  progress: WellProgressInfo
  orgName: string | null
  rigNumber: string | null
  foremanName: string | null
  // Данные графика по сменам (пусто — скрыт, например у чужой скважины)
  chartRows?: DrillingChartRow[]
  // Кто создал/запланировал скважину (виден руководству)
  createdByName?: string | null
  onClose: () => void
}) {
  const today = todayIso()
  const end = well.closed_at ?? today
  const daysElapsed = well.start_date ? Math.max(1, daysBetween(well.start_date, end) + 1) : 1
  const paceRate = well.start_date ? round2(progress.approved / daysElapsed) : 0

  let forecast: string | null = null
  if (well.projected_depth != null) {
    const remaining = round2(well.projected_depth - progress.approved)
    if (remaining <= 0) forecast = 'готово'
    else if (well.status === 'in_progress' && paceRate > 0) {
      const d = new Date(Date.now() + Math.ceil(remaining / paceRate) * 86_400_000)
      forecast = `≈ ${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`
    }
  }

  const rows: [string, string][] = []
  if (orgName) rows.push(['Организация', orgName])
  if (rigNumber) rows.push(['Станок', `№${rigNumber}`])
  if (foremanName) rows.push(['Бригадир', foremanName])
  const isPlanned = well.status === 'planned'
  if (isPlanned) {
    if (well.projected_depth != null) rows.push(['Проектная глубина', `${well.projected_depth} м`])
    if (well.coord_wgs84_lat != null && well.coord_wgs84_lon != null) {
      rows.push(['WGS-84', `${well.coord_wgs84_lat}; ${well.coord_wgs84_lon}`])
    }
    if (well.coord_local_x != null && well.coord_local_y != null) {
      rows.push(['Местные X; Y', `${well.coord_local_x}; ${well.coord_local_y}`])
    }
    if (well.wellhead_elevation != null) rows.push(['Отметка устья', `${well.wellhead_elevation} м`])
    rows.push(['Запланирована', `${fmtDate(well.created_at.slice(0, 10))}${createdByName ? ` · ${createdByName}` : ''}`])
  }
  if (well.start_date) rows.push(['Начало', fmtDate(well.start_date)])
  if (well.angle != null || well.azimuth != null) {
    rows.push(['Угол / азимут', `${well.angle ?? '—'}° / ${well.azimuth ?? '—'}°`])
  }

  return (
    <div className="card map-card" role="dialog" aria-label={`Скважина №${well.well_number}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <h2 style={{ margin: 0, fontSize: 18, flex: 1, minWidth: 0 }}>Скважина №{well.well_number}</h2>
        <TaskStatusBadge status={well.status} closedReason={well.closed_reason} />
        <button type="button" className="icon-btn-round" onClick={onClose} aria-label="Закрыть карточку">
          <X size={18} />
        </button>
      </div>

      {well.closed_reason && (
        <p className="text-muted" style={{ fontSize: 13, margin: '0 0 8px' }}>
          Закрыта{well.closed_at ? ` ${fmtDate(well.closed_at)}` : ''}: {CLOSED_REASON_LABELS[well.closed_reason].toLowerCase()}
          {well.closed_note ? ` — ${well.closed_note}` : ''}
        </p>
      )}

      {rows.length > 0 && (
        <dl className="map-card-facts">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      )}

      {well.description && (
        <p className="text-muted" style={{ fontSize: 13, margin: '8px 0', lineHeight: 1.4 }}>
          {well.description.length > 180 ? `${well.description.slice(0, 180)}…` : well.description}
        </p>
      )}

      {isPlanned ? (
        <p className="text-muted" style={{ fontSize: 13, margin: '10px 0 12px' }}>
          Бурение ещё не начато: станок, бригадир и дата начала не назначены.
        </p>
      ) : (
      <div style={{ margin: '10px 0 12px' }}>
        <DrillingProgressPanel
          compact
          taskId={well.id}
          projectedDepth={well.projected_depth}
          approvedDepth={progress.approved}
          pendingDepth={progress.submitted}
          paceRate={paceRate}
          forecastLabel={forecast}
          daysElapsed={daysElapsed}
          shiftsCount={progress.shifts}
          rows={[]}
        />
      </div>
      )}

      {chartRows.length > 0 && (
        <div style={{ margin: '0 0 14px' }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Проходка по сменам</div>
          <DrillingProgressChart
            rows={chartRows}
            closure={
              well.closed_reason
                ? {
                    date: well.closed_at ?? chartRows[chartRows.length - 1].date,
                    kind: well.closed_reason === 'depth_reached' ? 'depth_reached' : 'other',
                    label:
                      well.closed_reason === 'depth_reached' ? 'Глубина достигнута' : well.closed_reason === 'accident' ? 'Авария' : 'Закрыта',
                  }
                : null
            }
          />
        </div>
      )}

      <Link to={`/tasks/drilling/${well.id}/dashboard`}>
        <button type="button" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, minHeight: 44 }}>
          Открыть задание <ArrowRight size={16} />
        </button>
      </Link>
    </div>
  )
}
