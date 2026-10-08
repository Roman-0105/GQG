import { drillDiameterMm } from '../../lib/drillDiameters'
import { round2 } from '../../lib/taskProgress'

export interface DiagramSegment {
  id: string
  s: number
  e: number
  color: string
  changed: boolean
  error: boolean
  label: string
}

interface Props {
  segments: DiagramSegment[]
  intervals: { code: string; from: number; to: number }[]
  casings: { code: string; depth: number }[]
  projectedDepth: number | null
  newEnd: number
  origEnd: number
  selectedId: string | null
  onPick: (id: string) => void
}

const W = 300
const H = 720
const TOP = 30
const BOTTOM = 680
const CX = 150
const MONO = 'var(--font-mono)'

// Схема скважины для экрана исправления сводок: тот же вид, что на дашбордах
// (синяя колонка по диаметрам, серая обсадка, оранжевый забой, линия проекта),
// слева цветная полоса смен по мастерам. Изменённые смены — штриховка, ошибки — красная рамка.
export default function CorrectionWellDiagram({ segments, intervals, casings, projectedDepth, newEnd, origEnd, selectedId, onPick }: Props) {
  const maxDepth = Math.max(1, newEnd, origEnd, projectedDepth ?? 0, ...casings.map((c) => c.depth))
  const y = (d: number) => TOP + (Math.max(0, Math.min(maxDepth, d)) / maxDepth) * (BOTTOM - TOP)
  const mm = (code: string) => drillDiameterMm(code) ?? 70
  const wOf = (code: string) => 30 + ((mm(code) - 46) / (114 - 46)) * 54
  const stepOptions = [10, 20, 50, 100, 200, 250, 500, 1000]
  const step = stepOptions.find((s) => maxDepth / s <= 10) ?? 1000
  const ticks: number[] = []
  for (let d = 0; d <= maxDepth; d += step) ticks.push(d)

  // подписи диаметров без наложений
  const used: number[] = []
  const labels = intervals.map((iv) => {
    let yy = Math.max(TOP + 10, Math.min(BOTTOM - 10, y((iv.from + iv.to) / 2)))
    for (let g = 0; g < 20; g++) {
      const hit = used.find((u) => Math.abs(u - yy) < 26)
      if (hit === undefined) break
      yy = hit + 26
    }
    used.push(yy)
    return { y: yy, iv }
  })

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="corr-diagram" role="img" fontFamily={MONO}>
      <title>Схема скважины</title>
      <desc>Колонка по диаметрам, обсадка, забой и полоса смен по мастерам</desc>
      <defs>
        <pattern id="cd-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="#c9691f" strokeWidth="2" />
        </pattern>
      </defs>

      {/* шкала глубины */}
      <line x1={34} x2={34} y1={TOP} y2={BOTTOM} stroke="var(--color-border-strong)" />
      {ticks.map((d) => (
        <g key={d}>
          <line x1={30} x2={34} y1={y(d)} y2={y(d)} stroke="var(--color-border-strong)" />
          <text x={27} y={y(d) + 3} textAnchor="end" fontSize={9} fill="var(--color-text-muted)">{d}</text>
        </g>
      ))}
      <text x={34} y={TOP - 10} textAnchor="middle" fontSize={9} fill="var(--color-text-muted)">м</text>

      {/* обсадка */}
      {casings.map((c) => {
        const w = wOf(c.code) + 14
        return <rect key={c.code} x={CX - w / 2} y={TOP} width={w} height={Math.max(1, y(c.depth) - TOP)} fill="#d6dadd" stroke="#7d868c" strokeWidth={1.6} />
      })}

      {/* колонка по диаметрам */}
      {intervals.map((iv, i) => (
        <rect key={i} x={CX - wOf(iv.code) / 2} y={y(iv.from)} width={wOf(iv.code)} height={Math.max(1, y(iv.to) - y(iv.from))} fill="var(--color-primary)" stroke="#fff" strokeWidth={0.6} />
      ))}

      {/* полоса смен: цвет — мастер */}
      {segments.map((sg) => {
        const h = Math.max(1.5, y(sg.e) - y(sg.s) - 0.6)
        const stroke = sg.error ? '#b03a2e' : selectedId === sg.id ? '#2a2620' : sg.changed ? '#c9691f' : 'none'
        return (
          <g key={sg.id} onClick={() => onPick(sg.id)} style={{ cursor: 'pointer' }}>
            <title>{sg.label}</title>
            <rect x={42} y={y(sg.s)} width={14} height={h} fill={sg.color} opacity={0.9} />
            {sg.changed && <rect x={42} y={y(sg.s)} width={14} height={h} fill="url(#cd-hatch)" opacity={0.75} />}
            {stroke !== 'none' && <rect x={42} y={y(sg.s)} width={14} height={h} fill="none" stroke={stroke} strokeWidth={2} />}
            <rect x={38} y={y(sg.s)} width={22} height={h} fill="transparent" />
          </g>
        )
      })}

      {/* подписи диаметров */}
      {labels.map(({ y: yy, iv }, i) => (
        <g key={i}>
          <line x1={CX + wOf(iv.code) / 2 + 2} x2={CX + 58} y1={y((iv.from + iv.to) / 2)} y2={yy} stroke="#9aa3a8" strokeWidth={0.7} />
          <text x={CX + 62} y={yy - 2} fontSize={10} fontWeight={700} fill="var(--color-text)">{iv.code} · {mm(iv.code)} мм</text>
          <text x={CX + 62} y={yy + 9} fontSize={9} fill="var(--color-text-muted)">{round2(iv.from)}–{round2(iv.to)} м</text>
        </g>
      ))}
      {casings.map((c) => (
        <text key={c.code} x={CX + 62} y={y(c.depth) + 3} fontSize={9} fill="#5b646a" fontWeight={700}>обс. {c.code} {round2(c.depth)} м</text>
      ))}

      {/* было / стало */}
      {Math.abs(newEnd - origEnd) > 0.005 && (
        <g>
          <line x1={34} x2={W - 8} y1={y(origEnd)} y2={y(origEnd)} stroke="#7d868c" strokeDasharray="4 3" />
          <text x={W - 8} y={y(origEnd) - 3} textAnchor="end" fontSize={9} fill="#6b747a">было {round2(origEnd)} м</text>
        </g>
      )}
      <line x1={34} x2={W - 8} y1={y(newEnd)} y2={y(newEnd)} stroke="var(--color-accent)" strokeWidth={1.6} />
      <text x={W - 8} y={y(newEnd) + (Math.abs(newEnd - origEnd) > 0.005 && newEnd < origEnd ? -3 : 11)} textAnchor="end" fontSize={10} fontWeight={700} fill="var(--color-accent)">Забой {round2(newEnd)} м</text>
      {projectedDepth != null && projectedDepth > 0 && (
        <g>
          <line x1={34} x2={W - 8} y1={y(projectedDepth)} y2={y(projectedDepth)} stroke="var(--color-text)" strokeWidth={2} />
          <text x={W - 8} y={y(projectedDepth) + 12} textAnchor="end" fontSize={10} fontWeight={700} fill="var(--color-text)">Проект {round2(projectedDepth)} м</text>
        </g>
      )}
    </svg>
  )
}
