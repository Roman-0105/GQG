import { motion } from 'framer-motion'

// Простой график темпа во времени (25.09.2026, фаза 3 редизайна) —
// библиотеку графиков сознательно не добавляли (см. дорожную карту:
// "расширять свои компоненты"), это тот же самописный inline-SVG подход,
// что и ProgressBar/CircularProgress/WellboreProgress, просто для ряда
// точек по датам вместо одного значения факт/план. Не претендует на
// полноценный чарт (без осей/тултипов) — это именно "спарклайн":
// быстрый визуальный тренд, не аналитический инструмент.
interface TrendPoint {
  date: string
  value: number
}

export default function TrendSparkline({
  data,
  unit = 'м',
  height = 90,
  color = 'var(--color-primary)',
}: {
  data: TrendPoint[]
  unit?: string
  height?: number
  color?: string
}) {
  if (data.length === 0) {
    return <p className="text-muted" style={{ fontSize: 13 }}>Нет данных за период.</p>
  }

  const width = 600
  const padX = 4
  const padY = 10
  const max = Math.max(...data.map((d) => d.value), 1)
  const stepX = data.length > 1 ? (width - padX * 2) / (data.length - 1) : 0

  const points = data.map((d, i) => {
    const x = padX + i * stepX
    const y = padY + (1 - d.value / max) * (height - padY * 2)
    return { x, y, ...d }
  })

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const areaPath = `${linePath} L${points[points.length - 1].x.toFixed(1)},${height - padY} L${points[0].x.toFixed(1)},${height - padY} Z`

  const total = data.reduce((s, d) => s + d.value, 0)
  const best = points.reduce((m, p) => (p.value > m.value ? p : m), points[0])

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>
          {data[0].date} — {data[data.length - 1].date}
        </span>
        <span className="num" style={{ fontSize: 13, fontWeight: 600 }}>
          Σ {total.toFixed(1)} {unit}
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none">
        <defs>
          <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <motion.path
          d={areaPath}
          fill="url(#trend-fill)"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
        />
        <motion.path
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        />
        {best.value > 0 && (
          <circle cx={best.x} cy={best.y} r={3} fill={color} />
        )}
      </svg>
    </div>
  )
}
