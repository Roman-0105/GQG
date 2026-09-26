import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import WellboreProgress from './WellboreProgress'
import DrillingProgressChart, { type DrillingChartRow } from './DrillingProgressChart'
import DrillingCrewStrip from './DrillingCrewStrip'
import { round2 } from '../lib/taskProgress'

export type { DrillingChartRow }

interface Props {
  taskId: string
  projectedDepth: number | null
  approvedDepth: number
  pendingDepth: number
  paceRate: number
  forecastLabel: string | null
  daysElapsed: number
  shiftsCount: number
  rows: DrillingChartRow[]
  headerRight?: ReactNode
  planEditor?: ReactNode
}

// Панель "Проходка скважины" (25.09.2026) — редизайн по эскизам,
// одобренным владельцем платформы (Design-канвас "Проходка скважины —
// варианты": итоговый вариант — комбинация 3-х показанных концепций).
// Слева — круговая диаграмма + показатели (темп/прогноз/с начала/смен),
// сохранены по прямому требованию владельца ("не убирая круговую
// диаграмму и информацию под ней"); посередине — тот же WellboreProgress,
// что и раньше (визуально доработан отдельно); справа — график по сменам
// и состав бригады, сворачиваемые кнопкой (идея из одного из эскизов).
export default function DrillingProgressPanel({
  taskId,
  projectedDepth,
  approvedDepth,
  pendingDepth,
  paceRate,
  forecastLabel,
  daysElapsed,
  shiftsCount,
  rows,
  headerRight,
  planEditor,
}: Props) {
  const [expanded, setExpanded] = useState(true)

  const gaugeR = 52
  const circumference = 2 * Math.PI * gaugeR
  const frac = projectedDepth ? Math.max(0, Math.min(1, approvedDepth / projectedDepth)) : 0
  const gaugeDash = `${circumference * frac} ${circumference * (1 - frac)}`
  const percent = projectedDepth ? round2((approvedDepth / projectedDepth) * 100) : null

  const approvedFrac = projectedDepth ? Math.max(0, Math.min(1, approvedDepth / projectedDepth)) : 0
  const pendingFrac = projectedDepth
    ? Math.max(0, Math.min(1, (approvedDepth + pendingDepth) / projectedDepth) - approvedFrac)
    : 0

  return (
    <div className="card" style={{ padding: 24, marginBottom: 24 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: 10,
          marginBottom: 18,
        }}
      >
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 18 }}>Проходка скважины</div>
        {headerRight && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{headerRight}</div>}
      </div>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {projectedDepth != null && (
          <div style={{ width: 190, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' }}>
            <svg width={130} height={130} viewBox="0 0 130 130">
              <circle cx={65} cy={65} r={gaugeR} fill="none" stroke="var(--color-surface-muted)" strokeWidth={13} />
              <circle
                cx={65}
                cy={65}
                r={gaugeR}
                fill="none"
                stroke="var(--color-primary)"
                strokeWidth={13}
                strokeLinecap="round"
                strokeDasharray={gaugeDash}
                transform="rotate(-90 65 65)"
              />
              <text x={65} y={62} textAnchor="middle" fontFamily="var(--font-display)" fontWeight={700} fontSize={26} fill="var(--color-text)">
                {percent != null ? `${percent.toFixed(0)}%` : '—'}
              </text>
              <text x={65} y={80} textAnchor="middle" fontSize={10.5} fill="var(--color-text-muted)">
                плана
              </text>
            </svg>

            <div style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 4 }}>
                <span className="num">{round2(approvedDepth)} м</span>
                <span className="num">{round2(projectedDepth)} м</span>
              </div>
              <div
                style={{
                  height: 10,
                  borderRadius: 'var(--radius-full)',
                  background: 'var(--color-surface-muted)',
                  overflow: 'hidden',
                  display: 'flex',
                }}
              >
                <div style={{ width: `${approvedFrac * 100}%`, background: 'var(--color-primary)' }} />
                <div style={{ width: `${pendingFrac * 100}%`, background: 'var(--color-accent-soft)' }} />
              </div>
            </div>

            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 9 }}>
              <StatRow label="Темп" value={`${paceRate.toFixed(1)} м/сут`} />
              <StatRow label="Прогноз" value={forecastLabel ?? '—'} />
              <StatRow label="С начала" value={`${daysElapsed} дн.`} />
              <StatRow label="Смен" value={String(shiftsCount)} />
            </div>
          </div>
        )}

        <div style={{ flexShrink: 0 }}>
          <WellboreProgress projectedDepth={projectedDepth} approvedDepth={approvedDepth} pendingDepth={pendingDepth} />
        </div>

        <div style={{ flex: 1, minWidth: 260 }}>
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            style={{
              all: 'unset',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              width: '100%',
              boxSizing: 'border-box',
              padding: 12,
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-surface-muted)',
              color: 'var(--color-primary)',
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            {expanded ? 'Свернуть график и бригаду' : 'Показать график и бригаду'}
            <ChevronDown size={15} style={{ transform: `rotate(${expanded ? 180 : 0}deg)`, transition: 'transform .2s' }} />
          </button>

          {expanded && (
            <div style={{ marginTop: 14 }}>
              <DrillingProgressChart rows={rows} />
              <div style={{ borderTop: '1px solid var(--color-border)', marginTop: 14, paddingTop: 14 }}>
                <DrillingCrewStrip taskId={taskId} />
              </div>
            </div>
          )}
        </div>
      </div>

      {planEditor && <div style={{ marginTop: 16 }}>{planEditor}</div>}
    </div>
  )
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span className="eyebrow">{label}</span>
      <span className="num" style={{ fontWeight: 700 }}>
        {value}
      </span>
    </div>
  )
}
