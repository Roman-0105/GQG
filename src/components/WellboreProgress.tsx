import { motion } from 'framer-motion'
import { round2 } from '../lib/taskProgress'

interface Props {
  projectedDepth: number | null
  approvedDepth: number
  pendingDepth?: number
}

const TOP = 36
const BOTTOM = 356
const TUBE_H = BOTTOM - TOP
const TUBE_X = 70
const TUBE_W = 60

// Схематичный ствол скважины: труба сверху вниз, залив — фактическая
// глубина по подтверждённым сводкам, штрих — ещё не согласованный остаток,
// пунктирная линия — проектная глубина (если задание уже её достигло или
// перегнало, это будет видно по вылезающему за пунктир заливу). Тонкие
// горизонтальные линии внутри залива — стилизация под керн/породу, не
// декор ради декора: сразу считывается как "ствол", а не абстрактный бар.
//
// 25.09.2026 — визуально доработан по одобренному эскизу (Design-канвас
// "Проходка скважины — варианты", концепция 1): блик (sheen) поверх
// залива для объёма, штрихованная (не сплошная) заливка "на
// согласовании" вместо плоского цвета, пульсирующая метка текущего забоя
// и деление насечек на крупные (подписаны) и мелкие — тот же ствол, тот
// же интерфейс пропсов, просто "живее". Логика заливки/анимации не
// менялась.
export default function WellboreProgress({
  projectedDepth,
  approvedDepth,
  pendingDepth = 0,
}: Props) {
  if (!projectedDepth || projectedDepth <= 0) {
    return (
      <p className="text-muted" style={{ fontSize: 13.5 }}>
        Проектная глубина не указана — ствол скважины не отрисовать. Факт:{' '}
        <span className="num">{round2(approvedDepth)}</span> м.
      </p>
    )
  }

  const clampFrac = (v: number) => Math.max(0, Math.min(1, v / projectedDepth))
  const approvedFrac = clampFrac(approvedDepth)
  const pendingFrac = clampFrac(approvedDepth + pendingDepth) - approvedFrac

  const approvedH = TUBE_H * approvedFrac
  const pendingH = TUBE_H * pendingFrac
  const tipY = TOP + approvedH + pendingH

  const majorTicks = Array.from({ length: 6 }, (_, i) => i / 5)
  const minorTicks = Array.from({ length: 5 }, (_, i) => i / 5 + 0.1)

  const stripeCount = Math.max(0, Math.round((approvedH + pendingH) / 16))

  return (
    <svg viewBox="0 0 260 400" style={{ width: '100%', maxWidth: 220, display: 'block', margin: '0 auto' }}>
      <defs>
        <linearGradient id="wellbore-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3c5c4d" />
          <stop offset="100%" stopColor="var(--color-primary)" />
        </linearGradient>
        <linearGradient id="wellbore-sheen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="30%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="46%" stopColor="#ffffff" stopOpacity="0.16" />
          <stop offset="60%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <pattern id="wellbore-hatch" width="6" height="6" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill="var(--color-accent-soft)" />
          <line x1="0" y1="0" x2="0" y2="6" stroke="var(--color-accent)" strokeWidth={1.4} strokeOpacity={0.5} />
        </pattern>
        <clipPath id="wellbore-clip">
          <rect x={TUBE_X} y={TOP} width={TUBE_W} height={TUBE_H} rx={6} />
        </clipPath>
      </defs>

      {/* устье */}
      <rect x={TUBE_X - 16} y={TOP - 14} width={TUBE_W + 32} height={14} rx={3} fill="var(--color-border-strong)" />

      {/* труба (фон) */}
      <rect x={TUBE_X} y={TOP} width={TUBE_W} height={TUBE_H} rx={6} fill="var(--color-surface-muted)" stroke="var(--color-border-strong)" strokeWidth={1.5} />

      <g clipPath="url(#wellbore-clip)">
        {/* факт: подтверждено */}
        <motion.rect
          x={TUBE_X}
          width={TUBE_W}
          fill="url(#wellbore-fill)"
          initial={{ y: BOTTOM, height: 0 }}
          animate={{ y: TOP, height: approvedH }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        />
        {/* факт: на согласовании — штриховка, а не плоский цвет: сразу
            читается как "предварительно", не путается с подтверждённым */}
        {pendingH > 0 && (
          <motion.rect
            x={TUBE_X}
            width={TUBE_W}
            fill="url(#wellbore-hatch)"
            initial={{ y: BOTTOM, height: 0 }}
            animate={{ y: TOP + approvedH, height: pendingH }}
            transition={{ duration: 0.8, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          />
        )}
        {/* блик — стилизация под влажную породу: помогает читать залив как
            объёмную трубу, а не плоский бар */}
        <motion.rect
          x={TUBE_X}
          width={TUBE_W}
          fill="url(#wellbore-sheen)"
          initial={{ y: BOTTOM, height: 0 }}
          animate={{ y: TOP, height: approvedH + pendingH }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        />
        {/* керновые полосы — визуальная стилизация под породу */}
        {Array.from({ length: stripeCount }).map((_, i) => (
          <rect
            key={i}
            x={TUBE_X}
            y={BOTTOM - (i + 1) * 16}
            width={TUBE_W}
            height={1}
            fill="rgba(0,0,0,0.06)"
          />
        ))}
      </g>

      {/* пульсирующая метка текущего забоя */}
      <circle cx={TUBE_X + TUBE_W / 2} cy={tipY} r={4.5} fill="var(--color-accent)">
        <animate attributeName="r" values="4.5;8;4.5" dur="2.2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="1;.25;1" dur="2.2s" repeatCount="indefinite" />
      </circle>
      <circle cx={TUBE_X + TUBE_W / 2} cy={tipY} r={2.6} fill="var(--color-accent)" />

      {/* насечки глубины: крупные — подписаны, мелкие — просто деления */}
      {majorTicks.map((t) => {
        const y = TOP + TUBE_H * t
        const depth = Math.round(projectedDepth * t)
        return (
          <g key={`major-${t}`}>
            <line x1={TUBE_X - 8} y1={y} x2={TUBE_X + TUBE_W + 8} y2={y} stroke="var(--color-border)" strokeWidth={1.3} />
            <text
              x={TUBE_X + TUBE_W + 14}
              y={y + 4}
              fontSize={11}
              fontWeight={700}
              fontFamily="var(--font-mono)"
              fill="var(--color-text)"
            >
              {depth}м
            </text>
          </g>
        )
      })}
      {minorTicks.map((t) => {
        const y = TOP + TUBE_H * t
        return (
          <line
            key={`minor-${t}`}
            x1={TUBE_X - 4}
            y1={y}
            x2={TUBE_X + TUBE_W + 4}
            y2={y}
            stroke="var(--color-border)"
            strokeWidth={0.8}
          />
        )
      })}

      {/* долото на конце факта */}
      <polygon
        points={`${TUBE_X},${tipY} ${TUBE_X + TUBE_W},${tipY} ${TUBE_X + TUBE_W / 2},${tipY + 14}`}
        fill={pendingH > 0 ? 'var(--color-accent-soft)' : 'var(--color-primary)'}
      />
      <ellipse cx={TUBE_X + TUBE_W / 2} cy={tipY + 15.5} rx={17} ry={3.4} fill="rgba(42,38,32,.10)" />

      {/* низ ствола (план) */}
      <line x1={TUBE_X - 10} y1={BOTTOM} x2={TUBE_X + TUBE_W + 10} y2={BOTTOM} stroke="var(--color-text-faint)" strokeDasharray="3 3" strokeWidth={1.5} />

      <text
        x={TUBE_X + TUBE_W / 2}
        y={TOP - 18}
        textAnchor="middle"
        fontSize={13}
        fontWeight={700}
        fontFamily="var(--font-mono)"
        fill="var(--color-text)"
      >
        {round2(approvedDepth)}{pendingDepth > 0 ? `(+${round2(pendingDepth)})` : ''} / {round2(projectedDepth)} м
      </text>
    </svg>
  )
}
