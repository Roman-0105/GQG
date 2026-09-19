import type { CSSProperties } from 'react'

interface Props {
  size?: number | string
  strokeWidth?: number
  className?: string
  color?: string
  style?: CSSProperties
}

// Кастомная иконка буровой вышки — заменяет lucide `Drill` (отзыв
// 17.09.2026: "не нравится значок бурения", выглядел как ручная дрель, а
// не буровая установка). Нарисована в стилистике lucide (24×24, stroke,
// currentColor), чтобы не выбиваться из остальных иконок интерфейса.
export default function DerrickIcon({ size = 20, strokeWidth = 2.2, className, color = 'currentColor', style }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
    >
      <path d="M12 2 L5.5 21" />
      <path d="M12 2 L18.5 21" />
      <path d="M9.3 4.6 L14.7 4.6" />
      <path d="M8 9 L16 9" />
      <path d="M7 14 L17 14" />
      <path d="M8 9 L16 14" />
      <path d="M16 9 L8 14" />
      <path d="M4 21 L20 21" />
    </svg>
  )
}
