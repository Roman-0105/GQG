import { motion } from 'framer-motion'

interface Props {
  percent: number
  size?: number
  strokeWidth?: number
  color?: string
  label?: string
}

// Компактная круговая диаграмма готовности — дополняет линейный
// ProgressBar там, где важно считать долю "на глаз" (карточка участка на
// дашборде), а не точные метры. См. отзыв 17.09.2026.
export default function CircularProgress({
  percent,
  size = 44,
  strokeWidth = 4.5,
  color = 'var(--color-primary)',
  label,
}: Props) {
  const clamped = Math.max(0, Math.min(100, percent))
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={strokeWidth}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - clamped / 100) }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <span
        className="num"
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: size <= 44 ? 11 : 13,
          fontWeight: 700,
          color: 'var(--color-text)',
        }}
      >
        {label ?? `${Math.round(clamped)}%`}
      </span>
    </div>
  )
}
