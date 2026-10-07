import { round2 } from '../lib/taskProgress'
import { drillDiameterMm } from '../lib/drillDiameters'

export interface WellboreDiameter {
  depth_from: number
  depth_to: number
  diameter: number
  // Готовая подпись (для фактических интервалов — буквенный размер штанги).
  label?: string
}

interface Props {
  projectedDepth: number | null
  approvedDepth: number
  pendingDepth?: number
  diameters?: WellboreDiameter[]
  // Обсадка: код размера + глубина «до» (от устья).
  casings?: { code: string; depth: number }[]
}

const VB_W = 300
const TOP = 34
const BOTTOM = 354
const H = BOTTOM - TOP
const AXIS_X = 38
const CENTER_X = 96
const MIN_W = 30
const MAX_W = 62
const LABEL_X = 140

const fmt = (n: number) => String(round2(n)).replace('.', ',')

// Схематичная конструкция скважины (06.10.2026, выбрана владельцем из трёх
// эскизов): плоская ступенчатая колонна по интервалам диаметров бурения,
// слева ось глубины, справа подписи диаметров, оранжевая отметка забоя с
// метражом и линия проектной глубины. Заливка — подтверждённый факт,
// штриховка — «на согласовании». Без заданных диаметров колонна рисуется
// одним сегментом.
export default function WellboreProgress({ projectedDepth, approvedDepth, pendingDepth = 0, diameters = [], casings = [] }: Props) {
  if (!projectedDepth || projectedDepth <= 0) {
    return (
      <p className="text-muted" style={{ fontSize: 13 }}>
        Проектная глубина не указана — ствол скважины не отрисовать. Факт:{' '}
        <span className="num">{round2(approvedDepth)}</span> м.
      </p>
    )
  }

  const yOf = (depth: number) => TOP + (Math.max(0, Math.min(projectedDepth, depth)) / projectedDepth) * H
  const knownDepth = approvedDepth + pendingDepth
  const tipY = yOf(knownDepth)
  const percent = round2((approvedDepth / projectedDepth) * 100)

  // Сегменты колонны: каждый тянется до начала следующего, последний — до проекта.
  const sorted = [...diameters].filter((d) => d.depth_to > d.depth_from).sort((a, b) => a.depth_from - b.depth_from)
  const casingList = casings
    .map((c) => ({ ...c, mm: drillDiameterMm(c.code) ?? 0 }))
    .filter((c) => c.depth > 0 && c.mm > 0)
    .sort((a, b) => b.mm - a.mm)
  const mms = [...sorted.map((d) => d.diameter), ...casingList.map((c) => c.mm)]
  const dMin = Math.min(...mms)
  const dMax = Math.max(...mms)
  const widthOf = (dia: number) => (mms.length === 0 || dMax === dMin ? 46 : MIN_W + ((dia - dMin) / (dMax - dMin)) * (MAX_W - MIN_W))
  const segments =
    sorted.length > 0
      ? sorted.map((d, i) => ({
          from: i === 0 ? 0 : d.depth_from,
          to: i === sorted.length - 1 ? Math.max(projectedDepth, d.depth_to) : sorted[i + 1].depth_from,
          width: widthOf(d.diameter),
          label: `${d.label ?? `Ø${round2(d.diameter)}`} · ${round2(d.depth_from)}–${round2(d.depth_to)} м`,
          mid: (d.depth_from + d.depth_to) / 2,
        }))
      : [{ from: 0, to: projectedDepth, width: 46, label: '', mid: 0 }]

  // Подписи диаметров: у середины своего интервала, но не поверх забоя/проекта
  // и не друг на друга.
  const placed: number[] = [tipY, BOTTOM]
  const casingLabels = casingList.map((c) => ({ y: 0, text: 'Обсадка ' + c.code + ' · 0–' + round2(c.depth) + ' м', depth: c.depth }))
  const labels = [
    ...segments.filter((s) => s.label).map((s) => ({ label: s.label, mid: s.mid })),
    ...casingLabels.map((c) => ({ label: c.text, mid: c.depth })),
  ]
    .map((s) => {
      let y = Math.min(BOTTOM - 16, Math.max(TOP + 8, yOf(s.mid)))
      for (let guard = 0; guard < 12; guard++) {
        const hit = placed.find((p) => Math.abs(p - y) < 14)
        if (hit === undefined) break
        y = hit + 14
      }
      placed.push(y)
      return { y, text: s.label }
    })

  const stepOptions = [10, 20, 50, 100, 200, 250, 500, 1000]
  const step = stepOptions.find((s) => projectedDepth / s <= 7) ?? 1000
  const ticks: number[] = []
  for (let d = 0; d <= projectedDepth; d += step) ticks.push(d)

  const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0))

  return (
    <svg viewBox={`0 0 ${VB_W} 410`} style={{ width: '100%', maxWidth: 300, display: 'block', margin: '0 auto' }}>
      <defs>
        <pattern id="wb-hatch" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill="var(--color-accent-soft)" />
          <line x1="0" y1="0" x2="0" y2="6" stroke="var(--color-accent)" strokeWidth={1.4} strokeOpacity={0.6} />
        </pattern>
      </defs>

      <text x={AXIS_X - 4} y={16} fontSize={13} fontWeight={700} fontFamily="var(--font-mono)" fill="var(--color-text)">
        {String(Math.round(percent * 10) / 10).replace(".", ",")}% проекта
      </text>

      {/* ось глубины */}
      <line x1={AXIS_X} y1={TOP} x2={AXIS_X} y2={BOTTOM} stroke="var(--color-border-strong)" strokeWidth={1} />
      {ticks.map((d) => (
        <g key={d}>
          <line x1={AXIS_X - 4} y1={yOf(d)} x2={AXIS_X} y2={yOf(d)} stroke="var(--color-border-strong)" />
          <text x={AXIS_X - 7} y={yOf(d) + 3.5} textAnchor="end" fontSize={10} fontFamily="var(--font-mono)" fill="var(--color-text-muted)">
            {d}
          </text>
        </g>
      ))}

      {/* обсадка: стальная «рубашка» от устья до глубины обсадки */}
      {casingList.map((c) => {
        const w = widthOf(c.mm) + 10
        return (
          <rect
            key={c.code}
            x={CENTER_X - w / 2}
            y={TOP}
            width={w}
            height={yOf(c.depth) - TOP}
            fill="#d6dadd"
            stroke="#7d868c"
            strokeWidth={2}
          />
        )
      })}

      {/* колонна по диаметрам */}
      {segments.map((s, i) => {
        const x = CENTER_X - s.width / 2
        const y0 = yOf(s.from)
        const y1 = yOf(s.to)
        const aH = (overlap(s.from, s.to, 0, approvedDepth) / projectedDepth) * H
        const pH = (overlap(s.from, s.to, approvedDepth, knownDepth) / projectedDepth) * H
        return (
          <g key={i}>
            <rect x={x} y={y0} width={s.width} height={y1 - y0} fill="var(--color-surface-muted)" stroke="var(--color-border-strong)" strokeWidth={1.2} />
            {aH > 0 && <rect x={x} y={y0} width={s.width} height={aH} fill="var(--color-primary)" />}
            {pH > 0 && <rect x={x} y={y0 + aH} width={s.width} height={pH} fill="url(#wb-hatch)" />}
            <rect x={x} y={y0} width={s.width} height={y1 - y0} fill="none" stroke="var(--color-border-strong)" strokeWidth={1.2} />
          </g>
        )
      })}

      {/* подписи диаметров */}
      {labels.map((l) => (
        <text key={l.text} x={LABEL_X} y={l.y + 3.5} fontSize={10.5} fontFamily="var(--font-mono)" fill="var(--color-text-muted)">
          {l.text}
        </text>
      ))}

      {/* забой */}
      {knownDepth > 0 && (
        <g>
          <line x1={AXIS_X} y1={tipY} x2={VB_W - 6} y2={tipY} stroke="var(--color-accent)" strokeWidth={1.6} />
          <polygon points={`${CENTER_X + MAX_W / 2 + 4},${tipY} ${CENTER_X + MAX_W / 2 + 12},${tipY - 4} ${CENTER_X + MAX_W / 2 + 12},${tipY + 4}`} fill="var(--color-accent)" />
          <text x={LABEL_X} y={tipY - 5} fontSize={11.5} fontWeight={700} fontFamily="var(--font-mono)" fill="var(--color-accent)">
            Забой {fmt(knownDepth)} м
          </text>
        </g>
      )}

      {/* проект */}
      <line x1={AXIS_X} y1={BOTTOM} x2={VB_W - 6} y2={BOTTOM} stroke="var(--color-text)" strokeWidth={2} />
      <text x={LABEL_X} y={BOTTOM + 15} fontSize={11.5} fontWeight={700} fontFamily="var(--font-mono)" fill="var(--color-text)">
        Проект {fmt(projectedDepth)} м
      </text>

      {pendingDepth > 0 && (
        <g>
          <rect x={AXIS_X - 4} y={386} width={16} height={10} fill="url(#wb-hatch)" stroke="var(--color-accent)" strokeOpacity={0.6} />
          <text x={AXIS_X + 18} y={395} fontSize={11} fontFamily="var(--font-mono)" fill="var(--color-text-muted)">
            на согласовании +{fmt(pendingDepth)} м
          </text>
        </g>
      )}
    </svg>
  )
}
