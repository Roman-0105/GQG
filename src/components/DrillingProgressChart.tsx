export interface DrillingChartRow {
  date: string
  shift1: number | null
  shift1Approved: boolean
  shift2: number | null
  shift2Approved: boolean
  cumApproved: number
  cumKnown: number
  plannedCumulative: number | null
}

interface Props {
  rows: DrillingChartRow[]
}

const SLOT = 46
const BAR_W = 16
const MARGIN_L = 40
const MARGIN_R = 40
const TOP = 10
const BOTTOM = 176
const LABEL_Y = 194
const PLOT_H = BOTTOM - TOP

function shortDate(iso: string) {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}`
}

function toPoly(pts: (readonly [number, number])[]) {
  return pts.map((p) => p.join(',')).join(' ')
}

// Дневной график проходки (25.09.2026, панель "Проходка скважины",
// одобренный дизайн — Design-канвас "Проходка скважины — варианты",
// комбинация вариантов 2+3): столбики метража по каждой смене (левая шкала)
// + линия накопленного факта (правая шкала) — сплошная там, где сводки уже
// подтверждены, пунктирная на "хвосте" из ещё не согласованных. Плановая
// линия — только если на задании задан темп (planned_daily_meters).
// Ширина фиксирована на смену (SLOT), не сжимается под контейнер — при
// длинной истории график просто шире контейнера, обёртка скроллится
// по горизонтали (см. родительский DrillingProgressPanel.tsx).
export default function DrillingProgressChart({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <p className="text-muted" style={{ fontSize: 13 }}>
        Пока нет сводок для графика.
      </p>
    )
  }

  const barMax = Math.max(1, ...rows.flatMap((r) => [r.shift1 ?? 0, r.shift2 ?? 0])) * 1.15
  const cumMax = Math.max(1, ...rows.flatMap((r) => [r.cumKnown, r.plannedCumulative ?? 0])) * 1.08

  const width = MARGIN_L + rows.length * SLOT + MARGIN_R
  const yBar = (v: number) => TOP + PLOT_H - (v / barMax) * PLOT_H
  const yCum = (v: number) => TOP + PLOT_H - (v / cumMax) * PLOT_H

  const points = rows.map((r, i) => {
    const cx = MARGIN_L + i * SLOT + SLOT / 2
    const x0 = MARGIN_L + i * SLOT + (SLOT - (BAR_W * 2 + 2)) / 2
    return { ...r, i, cx, x0 }
  })

  const approvedPts = points.map((p) => [p.cx, yCum(p.cumApproved)] as const)
  const lastApprovedValue = points[points.length - 1]?.cumApproved ?? 0
  let tailStart = points.length - 1
  while (tailStart > 0 && points[tailStart - 1].cumApproved === lastApprovedValue) tailStart--
  const pendingPts = points.slice(tailStart).map((p) => [p.cx, yCum(p.cumKnown)] as const)

  const hasPlan = points.every((p) => p.plannedCumulative != null)
  const planPts = hasPlan ? points.map((p) => [p.cx, yCum(p.plannedCumulative ?? 0)] as const) : []

  const gridLines = [0, 1, 2, 3, 4].map((i) => {
    const y = TOP + PLOT_H - (i / 4) * PLOT_H
    return {
      key: i,
      y,
      leftLabel: Math.round((i / 4) * barMax),
      rightLabel: Math.round((i / 4) * cumMax),
    }
  })

  return (
    <div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 6, fontSize: 11, color: 'var(--color-text-muted)' }}>
        <LegendSwatch color="var(--color-primary)" label="Смена 1" />
        <LegendSwatch color="#6f9280" label="Смена 2" />
        <LegendLine color="var(--color-accent)" label="Накопл. факт" />
        {hasPlan && <LegendLine color="var(--color-text-faint)" dashed label="План" />}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <svg width={width} height={210} viewBox={`0 0 ${width} 210`} style={{ display: 'block' }}>
          {gridLines.map((g) => (
            <g key={g.key}>
              <line x1={MARGIN_L - 6} y1={g.y} x2={width - MARGIN_R + 6} y2={g.y} stroke="var(--color-border)" strokeWidth={1} />
              <text x={MARGIN_L - 10} y={g.y + 3} textAnchor="end" fontSize={9.5} fontFamily="var(--font-mono)" fill="var(--color-text-faint)">
                {g.leftLabel}
              </text>
              <text x={width - MARGIN_R + 10} y={g.y + 3} fontSize={9.5} fontFamily="var(--font-mono)" fill="var(--color-text-faint)">
                {g.rightLabel}
              </text>
            </g>
          ))}

          {points.map((p) => (
            <g key={p.i}>
              {p.shift1 != null && (
                <rect
                  x={p.x0}
                  y={yBar(p.shift1)}
                  width={BAR_W}
                  height={Math.max(0, BOTTOM - yBar(p.shift1))}
                  rx={2}
                  fill={p.shift1Approved ? 'var(--color-primary)' : 'var(--color-accent-soft)'}
                />
              )}
              {p.shift2 != null && (
                <rect
                  x={p.x0 + BAR_W + 2}
                  y={yBar(p.shift2)}
                  width={BAR_W}
                  height={Math.max(0, BOTTOM - yBar(p.shift2))}
                  rx={2}
                  fill={p.shift2Approved ? '#6f9280' : 'var(--color-accent-soft)'}
                />
              )}
              <text x={p.cx} y={LABEL_Y} textAnchor="middle" fontSize={9.5} fontFamily="var(--font-mono)" fill="var(--color-text-faint)">
                {shortDate(p.date)}
              </text>
            </g>
          ))}

          {hasPlan && (
            <polyline points={toPoly(planPts)} fill="none" stroke="var(--color-text-faint)" strokeWidth={1.6} strokeDasharray="4 3" />
          )}
          <polyline points={toPoly(approvedPts)} fill="none" stroke="var(--color-accent)" strokeWidth={2.4} />
          {pendingPts.length > 1 && (
            <polyline
              points={toPoly(pendingPts)}
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth={2.4}
              strokeDasharray="3 3"
              opacity={0.7}
            />
          )}
          {approvedPts.map(([x, y], i) => (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={i === approvedPts.length - 1 && pendingPts.length <= 1 ? 4 : 2.5}
              fill="var(--color-accent)"
            />
          ))}
        </svg>
      </div>
    </div>
  )
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 9, height: 9, borderRadius: 2, background: color, display: 'inline-block' }} />
      {label}
    </span>
  )
}

function LegendLine({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span
        style={{
          width: 16,
          height: 0,
          display: 'inline-block',
          borderTop: `2px ${dashed ? 'dashed' : 'solid'} ${color}`,
        }}
      />
      {label}
    </span>
  )
}
