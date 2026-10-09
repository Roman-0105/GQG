import type { ReactNode } from 'react'
import { shortName } from '../../lib/shortName'
import { drillDiameterMm } from '../../lib/drillDiameters'
import { round2 } from '../../lib/taskProgress'
import type { DayRow, WellReportData } from '../../lib/wellReportData'

// Графики для вкладки «Отчёты» и PDF-отчёта по скважине. Всё — inline-SVG/HTML
// без библиотек, шрифт общий (JetBrains Mono), чтобы печать была векторной.

export const MASTER_COLORS = ['#0b3a5a', '#c9691f', '#3c7a52', '#6f96b8', '#8a5a9e', '#b09a2e', '#b03a2e']

const MONO = 'var(--font-mono)'
const fmtDM = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`

function niceMax(v: number) {
  if (v <= 0) return 10
  const pow = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / pow
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10
  return step * pow
}

// ---------------------------------------------------------------- Темп бурения
// Столбики по дням (смена 1 + смена 2 стопкой), линия среднего за 7 дней,
// накопленная проходка (правая шкала) и план. Заменяет прежний спарклайн.
export function DailyBarsChart({
  days,
  markers = [],
  projectedDepth,
  width = 720,
  height = 260,
}: {
  days: DayRow[]
  markers?: { date: string; label: string }[]
  projectedDepth?: number | null
  width?: number
  height?: number
}) {
  if (days.length === 0) return <p className="text-muted">Нет данных за период.</p>
  const L = 38
  const R = 44
  const T = 16
  const B = 52
  const pw = width - L - R
  const ph = height - T - B
  const n = days.length
  const band = pw / n
  const maxDay = niceMax(Math.max(...days.map((d) => d.total), 1))
  const maxCum = niceMax(Math.max(...days.map((d) => Math.max(d.cum, d.plan ?? 0)), projectedDepth ?? 0, 1))
  const x = (i: number) => L + band * i + band / 2
  const yD = (v: number) => T + ph - (v / maxDay) * ph
  const yC = (v: number) => T + ph - (v / maxCum) * ph
  const bw = Math.max(2, Math.min(18, band * 0.62))
  const ma = days.map((_, i) => {
    const slice = days.slice(Math.max(0, i - 6), i + 1)
    return slice.reduce((s, d) => s + d.total, 0) / slice.length
  })
  const hasPlan = days.every((d) => d.plan != null)
  const labelStep = Math.max(1, Math.ceil(n / 12))
  const ticks = [0, 0.25, 0.5, 0.75, 1]

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block' }} fontFamily={MONO}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={L + pw} y1={T + ph - t * ph} y2={T + ph - t * ph} stroke="var(--color-border)" strokeWidth={0.8} />
          <text x={L - 5} y={T + ph - t * ph + 3} textAnchor="end" fontSize={9} fill="var(--color-text-muted)">
            {round2(maxDay * t)}
          </text>
          <text x={L + pw + 5} y={T + ph - t * ph + 3} fontSize={9} fill="var(--color-accent)">
            {round2(maxCum * t)}
          </text>
        </g>
      ))}
      <text x={L - 5} y={T - 5} textAnchor="end" fontSize={9} fill="var(--color-text-muted)">м/сут</text>
      <text x={L + pw + 5} y={T - 5} fontSize={9} fill="var(--color-accent)">накопл., м</text>

      {days.map((d, i) => {
        const h1 = ((d.s1 ?? 0) / maxDay) * ph
        const h2 = ((d.s2 ?? 0) / maxDay) * ph
        return (
          <g key={d.date}>
            {h1 > 0 && <rect x={x(i) - bw / 2} y={T + ph - h1} width={bw} height={h1} fill="var(--color-primary)" />}
            {h2 > 0 && <rect x={x(i) - bw / 2} y={T + ph - h1 - h2} width={bw} height={h2} fill="#6f96b8" />}
            {i % labelStep === 0 && (
              <text x={x(i)} y={T + ph + 13} textAnchor="middle" fontSize={8.5} fill="var(--color-text-muted)">
                {fmtDM(d.date)}
              </text>
            )}
          </g>
        )
      })}

      {markers.map((m, i) => {
        const idx = days.findIndex((d) => d.date === m.date)
        if (idx < 0) return null
        return (
          <g key={i}>
            <line x1={x(idx)} x2={x(idx)} y1={T} y2={T + ph} stroke="#7d868c" strokeDasharray="2 3" strokeWidth={0.9} />
            <text x={x(idx)} y={T + ph + 26} textAnchor="middle" fontSize={8.5} fontWeight={700} fill="var(--color-text)">
              {m.label}
            </text>
          </g>
        )
      })}

      {hasPlan && (
        <polyline fill="none" stroke="#7d868c" strokeWidth={1.4} strokeDasharray="4 3" points={days.map((d, i) => `${x(i)},${yC(d.plan ?? 0)}`).join(' ')} />
      )}
      <polyline fill="none" stroke="var(--color-accent)" strokeWidth={2} points={days.map((d, i) => `${x(i)},${yC(d.cum)}`).join(' ')} />
      <polyline fill="none" stroke="#3c7a52" strokeWidth={1.6} points={ma.map((v, i) => `${x(i)},${yD(v)}`).join(' ')} />

      {/* легенда */}
      <g fontSize={9} fill="var(--color-text)">
        <rect x={L} y={height - 11} width={8} height={8} fill="var(--color-primary)" />
        <text x={L + 12} y={height - 4}>смена 1</text>
        <rect x={L + 66} y={height - 11} width={8} height={8} fill="#6f96b8" />
        <text x={L + 78} y={height - 4}>смена 2</text>
        <line x1={L + 136} x2={L + 150} y1={height - 7} y2={height - 7} stroke="#3c7a52" strokeWidth={2} />
        <text x={L + 154} y={height - 4}>среднее за 7 дн.</text>
        <line x1={L + 262} x2={L + 276} y1={height - 7} y2={height - 7} stroke="var(--color-accent)" strokeWidth={2} />
        <text x={L + 280} y={height - 4}>накопленная</text>
        {hasPlan && (
          <>
            <line x1={L + 356} x2={L + 370} y1={height - 7} y2={height - 7} stroke="#7d868c" strokeWidth={1.6} strokeDasharray="4 3" />
            <text x={L + 374} y={height - 4}>план</text>
          </>
        )}
      </g>
    </svg>
  )
}

// ---------------------------------------------------------------- Кольцо / доли
export interface Slice {
  label: string
  value: number
  color: string
}

export function Donut({ slices, size = 150, center, sub }: { slices: Slice[]; size?: number; center?: ReactNode; sub?: string }) {
  const total = slices.reduce((s, x) => s + x.value, 0)
  const r = size / 2 - 14
  const c = 2 * Math.PI * r
  let acc = 0
  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size, display: 'block' }} fontFamily={MONO}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-surface-muted)" strokeWidth={16} />
      {total > 0 &&
        slices.map((s, i) => {
          const len = (s.value / total) * c
          const el = (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={16}
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-acc}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          )
          acc += len
          return el
        })}
      {center != null && (
        <text x={size / 2} y={size / 2 + (sub ? 0 : 5)} textAnchor="middle" fontSize={20} fontWeight={700} fill="var(--color-text)">
          {center}
        </text>
      )}
      {sub && (
        <text x={size / 2} y={size / 2 + 15} textAnchor="middle" fontSize={9} fill="var(--color-text-muted)">
          {sub}
        </text>
      )}
    </svg>
  )
}

export function Legend({ slices, unit = 'м' }: { slices: Slice[]; unit?: string }) {
  const total = slices.reduce((s, x) => s + x.value, 0)
  return (
    <div style={{ display: 'grid', gap: 5, fontSize: 12 }}>
      {slices.map((s) => (
        <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 10, height: 10, background: s.color, flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 0 }}>{s.label}</span>
          <span className="num">
            {round2(s.value)} {unit}
            {total > 0 ? ` · ${round2((s.value / total) * 100)}%` : ''}
          </span>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- Горизонтальные столбики
export function HBars({ items, unit = 'м' }: { items: { label: string; value: number; color: string; note?: string }[]; unit?: string }) {
  const max = Math.max(...items.map((i) => i.value), 1)
  return (
    <div style={{ display: 'grid', gap: 9 }}>
      {items.map((it) => (
        <div key={it.label}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, marginBottom: 3 }}>
            <span>{it.label}</span>
            <span className="num">
              {round2(it.value)} {unit}
              {it.note ? ` · ${it.note}` : ''}
            </span>
          </div>
          <div style={{ height: 10, background: 'var(--color-surface-muted)' }}>
            <div style={{ width: `${(it.value / max) * 100}%`, height: '100%', background: it.color }} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- Календарь смен (heatmap)
export function ShiftHeatmap({ days }: { days: DayRow[] }) {
  const max = Math.max(...days.flatMap((d) => [d.s1 ?? 0, d.s2 ?? 0]), 1)
  const cell = (v: number | null, key: string, title: string) => {
    const bg = v == null ? 'var(--color-surface-muted)' : v === 0 ? '#e9e4d3' : `color-mix(in srgb, var(--color-primary) ${Math.round(18 + (v / max) * 82)}%, #fff)`
    return <span key={key} title={title} style={{ display: 'block', width: 16, height: 16, background: bg }} />
  }
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
        {days.map((d) => (
          <div key={d.date} style={{ display: 'grid', gap: 2 }}>
            {cell(d.s1, d.date + 's1', `${fmtDM(d.date)}, смена 1: ${d.s1 ?? '—'} м`)}
            {cell(d.s2, d.date + 's2', `${fmtDM(d.date)}, смена 2: ${d.s2 ?? '—'} м`)}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 11, color: 'var(--color-text-muted)' }}>
        <span style={{ display: 'inline-block', width: 12, height: 12, background: 'var(--color-surface-muted)' }} /> не работали
        <span style={{ display: 'inline-block', width: 12, height: 12, background: '#e9e4d3' }} /> 0 м
        <span style={{ display: 'inline-block', width: 40, height: 12, background: 'linear-gradient(90deg, color-mix(in srgb, var(--color-primary) 18%, #fff), var(--color-primary))' }} /> больше метров
        <span>· верхняя строка — смена 1, нижняя — смена 2</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Конструкция скважины
export function StructureDiagram({ data, colorOf }: { data: WellReportData; colorOf: (id: string) => string }) {
  const W = 620
  const H = 640
  const TOP = 56
  const BOTTOM = 590
  const CX = 150
  const { task, intervals, masterSegments, casings, reamings, totals } = data
  const projected = task.projected_depth ?? 0
  const maxDepth = Math.max(projected, totals.meters, ...casings.map((c) => c.depth), 1)
  const y = (d: number) => TOP + (Math.max(0, Math.min(maxDepth, d)) / maxDepth) * (BOTTOM - TOP)
  const mmOf = (code: string) => drillDiameterMm(code) ?? 0
  const allMm = [...intervals.map((i) => mmOf(i.code)), ...casings.map((c) => mmOf(c.code))].filter((v) => v > 0)
  const dMin = Math.min(...allMm, 46)
  const dMax = Math.max(...allMm, 114)
  const wOf = (mm: number) => (mm > 0 ? 38 + ((mm - dMin) / Math.max(1, dMax - dMin)) * 62 : 56)
  const stepOptions = [10, 20, 50, 100, 200, 250, 500, 1000]
  const step = stepOptions.find((s) => maxDepth / s <= 9) ?? 1000
  const ticks: number[] = []
  for (let d = 0; d <= maxDepth; d += step) ticks.push(d)

  // Подписи справа без наложения: каждая запись просит место по своей высоте.
  const placed: { y: number; h: number }[] = []
  const labelY = (wanted: number, h: number) => {
    let yy = Math.min(BOTTOM - 8, Math.max(TOP + 10, wanted))
    for (let g = 0; g < 40; g++) {
      const hit = placed.find((p) => yy < p.y + p.h + 4 && yy + h + 4 > p.y)
      if (!hit) break
      yy = hit.y + hit.h + 6
    }
    placed.push({ y: yy, h })
    return yy
  }
  const restM = projected > totals.meters ? round2(projected - totals.meters) : 0
  const entries: { y: number; kind: 'iv' | 'cas' | 'ream' | 'rest'; i: number }[] = [
    ...intervals.map((iv, i) => ({ y: y((iv.from + iv.to) / 2), kind: 'iv' as const, i })),
    ...casings.map((c, i) => ({ y: y(c.depth), kind: 'cas' as const, i })),
    ...reamings.map((r, i) => ({ y: y((r.from + r.to) / 2), kind: 'ream' as const, i })),
    ...(restM > 0 ? [{ y: y((totals.meters + projected) / 2), kind: 'rest' as const, i: 0 }] : []),
  ].sort((p, q) => p.y - q.y)
  const slot = new Map<string, number>()
  for (const e of entries) {
    const h = e.kind === 'iv' ? 30 + Math.min(3, intervals[e.i].masters.length) * 11 : e.kind === 'rest' ? 26 : 14
    slot.set(e.kind + e.i, labelY(e.y - 8, h))
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} fontFamily={MONO}>
      {/* шкала глубины */}
      <line x1={46} x2={46} y1={TOP} y2={BOTTOM} stroke="var(--color-border-strong)" />
      {ticks.map((d) => (
        <g key={d}>
          <line x1={42} x2={46} y1={y(d)} y2={y(d)} stroke="var(--color-border-strong)" />
          <text x={39} y={y(d) + 3} textAnchor="end" fontSize={9.5} fill="var(--color-text-muted)">{d}</text>
        </g>
      ))}
      <text x={46} y={TOP - 14} textAnchor="middle" fontSize={9.5} fill="var(--color-text-muted)">м</text>

      <defs>
        <pattern id="st-rock" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <rect width="9" height="9" fill="#efe9d6" />
          <line x1="0" y1="0" x2="0" y2="9" stroke="#cdbf9a" strokeWidth="1" />
        </pattern>
        <pattern id="st-rest" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="#fbfaf4" />
          <line x1="0" y1="0" x2="0" y2="6" stroke="#9aa3a8" strokeWidth="1" />
        </pattern>
        <linearGradient id="st-void" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#dfe6ea" />
          <stop offset="0.5" stopColor="#ffffff" />
          <stop offset="1" stopColor="#dfe6ea" />
        </linearGradient>
        <linearGradient id="st-steel" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#8e979d" />
          <stop offset="0.5" stopColor="#d3d8db" />
          <stop offset="1" stopColor="#8e979d" />
        </linearGradient>
      </defs>

      {/* горная порода вокруг ствола */}
      <rect x={CX - 104} y={TOP} width={208} height={BOTTOM - TOP} fill="url(#st-rock)" stroke="#cdbf9a" strokeWidth={0.8} />
      {/* устье */}
      <rect x={CX - 70} y={TOP - 7} width={140} height={7} fill="#5b646a" />

      {/* остаток до проектной глубины: тоньше, штриховка, пунктирные стенки */}
      {projected > totals.meters && (() => {
        const last = intervals[intervals.length - 1]
        const w = Math.max(24, wOf(last ? mmOf(last.code) : 0) * 0.78)
        const y0 = y(totals.meters)
        const y1 = y(projected)
        return (
          <g>
            <rect x={CX - w / 2} y={y0} width={w} height={y1 - y0} fill="url(#st-rest)" stroke="#6b747a" strokeWidth={1.6} strokeDasharray="5 4" />
            <line x1={CX} x2={CX} y1={y0} y2={y1} stroke="#9aa3a8" strokeWidth={0.8} strokeDasharray="2 4" />
          </g>
        )
      })()}

      {/* обсадка: стальные стенки (полая труба), тянется от устья до глубины обсадки */}
      {casings.map((c) => {
        const w = wOf(mmOf(c.code)) + 16
        const wall = 6
        const h = y(c.depth) - TOP
        return (
          <g key={c.code}>
            <rect x={CX - w / 2} y={TOP} width={wall} height={h} fill="url(#st-steel)" stroke="#5b646a" strokeWidth={1} />
            <rect x={CX + w / 2 - wall} y={TOP} width={wall} height={h} fill="url(#st-steel)" stroke="#5b646a" strokeWidth={1} />
            <polygon points={`${CX - w / 2},${TOP + h} ${CX - w / 2 + wall + 3},${TOP + h} ${CX - w / 2},${TOP + h + 6}`} fill="#5b646a" />
            <polygon points={`${CX + w / 2},${TOP + h} ${CX + w / 2 - wall - 3},${TOP + h} ${CX + w / 2},${TOP + h + 6}`} fill="#5b646a" />
          </g>
        )
      })}

      {/* пробуренный ствол: стенки (тёмные), центр полый; уступы между диаметрами */}
      {intervals.map((iv, i) => {
        const w = wOf(mmOf(iv.code))
        const wall = Math.max(4, Math.min(9, w * 0.14))
        const y0 = y(iv.from)
        const h = Math.max(1, y(iv.to) - y0)
        return (
          <g key={i}>
            <rect x={CX - w / 2} y={y0} width={w} height={h} fill="url(#st-void)" />
            <rect x={CX - w / 2} y={y0} width={wall} height={h} fill="var(--color-primary)" />
            <rect x={CX + w / 2 - wall} y={y0} width={wall} height={h} fill="var(--color-primary)" />
            <line x1={CX - w / 2} x2={CX + w / 2} y1={y0} y2={y0} stroke="var(--color-primary)" strokeWidth={1.4} />
          </g>
        )
      })}
      {/* ось ствола */}
      {totals.meters > 0 && <line x1={CX} x2={CX} y1={TOP} y2={y(totals.meters)} stroke="#9aa3a8" strokeWidth={0.7} strokeDasharray="2 4" />}
      {/* коронка на забое */}
      {intervals.length > 0 && (() => {
        const last = intervals[intervals.length - 1]
        const w = wOf(mmOf(last.code))
        const yb = y(totals.meters)
        return (
          <g>
            <rect x={CX - w / 2} y={yb - 4} width={w} height={4} fill="var(--color-primary)" />
            {Array.from({ length: Math.max(3, Math.floor(w / 9)) }).map((_, k, arr) => (
              <polygon key={k} points={`${CX - w / 2 + (k * w) / arr.length},${yb} ${CX - w / 2 + ((k + 1) * w) / arr.length},${yb} ${CX - w / 2 + ((k + 0.5) * w) / arr.length},${yb + 4}`} fill="var(--color-primary)" />
            ))}
          </g>
        )
      })()}

      {/* полоса мастеров слева от колонны */}
      {masterSegments.map((m, i) => (
        <rect key={i} x={CX - 100} y={y(m.from)} width={9} height={Math.max(1, y(m.to) - y(m.from))} fill={colorOf(m.id)} />
      ))}

      {/* расширения: красная отметка на стенке */}
      {reamings.map((r, i) => (
        <g key={i}>
          <line x1={CX + 96} x2={CX + 96} y1={y(r.from)} y2={y(r.to)} stroke="#b03a2e" strokeWidth={3} />
          <line x1={CX + 92} x2={CX + 100} y1={y(r.from)} y2={y(r.from)} stroke="#b03a2e" strokeWidth={1.5} />
          <line x1={CX + 92} x2={CX + 100} y1={y(r.to)} y2={y(r.to)} stroke="#b03a2e" strokeWidth={1.5} />
        </g>
      ))}

      {/* забой */}
      <line x1={46} x2={W - 14} y1={y(totals.meters)} y2={y(totals.meters)} stroke="var(--color-accent)" strokeWidth={1.6} />
      <text x={W - 14} y={y(totals.meters) - 5} textAnchor="end" fontSize={11} fontWeight={700} fill="var(--color-accent)">
        Забой {round2(totals.meters)} м
      </text>
      {projected > 0 && (
        <>
          <line x1={46} x2={W - 14} y1={y(projected)} y2={y(projected)} stroke="var(--color-text)" strokeWidth={2} />
          <text x={W - 14} y={y(projected) + 14} textAnchor="end" fontSize={11} fontWeight={700} fill="var(--color-text)">
            Проект {round2(projected)} м
          </text>
        </>
      )}

      {/* подписи справа */}
      {intervals.map((iv, i) => {
        const mid = y((iv.from + iv.to) / 2)
        const ly = (slot.get('iv' + i) ?? mid) + 8
        const mm = mmOf(iv.code)
        return (
          <g key={`l${i}`}>
            <line x1={CX + wOf(mm) / 2 + 2} x2={268} y1={mid} y2={ly - 3} stroke="#9aa3a8" strokeWidth={0.8} />
            <text x={272} y={ly} fontSize={11} fontWeight={700} fill="var(--color-text)">
              {iv.code ? `${iv.code}${mm ? ` · ${mm} мм` : ''}` : 'диаметр не указан'}
            </text>
            <text x={272} y={ly + 12} fontSize={10} fill="var(--color-text-muted)">
              {round2(iv.from)}–{round2(iv.to)} м · пробурено {round2(iv.meters)} м
            </text>
            {iv.masters.slice(0, 3).map((m, j) => (
              <text key={m.id} x={272} y={ly + 24 + j * 11} fontSize={9.5} fill={colorOf(m.id)} fontWeight={600}>
                {shortName(m.name)}: {round2(m.meters)} м
              </text>
            ))}
          </g>
        )
      })}
      {casings.map((c, i) => {
        const ly = (slot.get('cas' + i) ?? y(c.depth)) + 8
        return (
          <g key={c.code}>
            <line x1={CX + wOf(mmOf(c.code)) / 2 + 8} x2={268} y1={y(c.depth)} y2={ly - 3} stroke="#7d868c" strokeWidth={0.8} strokeDasharray="2 2" />
            <text x={272} y={ly} fontSize={10} fontWeight={700} fill="#5b646a">
              обсадка {c.code} до {round2(c.depth)} м
            </text>
          </g>
        )
      })}
      {restM > 0 && (() => {
        const ly = (slot.get('rest0') ?? y(totals.meters)) + 8
        return (
          <g>
            <text x={272} y={ly} fontSize={10.5} fontWeight={700} fill="#5b646a">
              остаток бурения
            </text>
            <text x={272} y={ly + 12} fontSize={10} fill="var(--color-text-muted)">
              {round2(totals.meters)}–{round2(projected)} м · {restM} м до проекта
            </text>
          </g>
        )
      })()}
      {reamings.map((r, i) => {
        const ly = (slot.get('ream' + i) ?? y((r.from + r.to) / 2)) + 8
        return (
          <text key={`r${i}`} x={272} y={ly} fontSize={10} fill="#b03a2e" fontWeight={700}>
            расширение {r.code} {r.from}–{r.to} м
          </text>
        )
      })}
      {/* условные обозначения */}
      <g fontSize={9} fill="var(--color-text-muted)">
        <rect x={46} y={H - 24} width={10} height={10} fill="url(#st-rock)" stroke="#cdbf9a" />
        <text x={60} y={H - 15}>порода</text>
        <rect x={112} y={H - 24} width={10} height={10} fill="var(--color-primary)" />
        <text x={126} y={H - 15}>стенка ствола</text>
        <rect x={212} y={H - 24} width={10} height={10} fill="url(#st-steel)" stroke="#5b646a" />
        <text x={226} y={H - 15}>обсадная труба</text>
        <rect x={322} y={H - 24} width={10} height={10} fill="url(#st-rest)" stroke="#6b747a" strokeDasharray="2 2" />
        <text x={336} y={H - 15}>остаток до проекта</text>
        <line x1={440} x2={450} y1={H - 19} y2={H - 19} stroke="#b03a2e" strokeWidth={3} />
        <text x={454} y={H - 15}>расширение</text>
      </g>
    </svg>
  )
}

export { shortName }
