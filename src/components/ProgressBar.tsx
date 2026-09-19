import { motion } from 'framer-motion'

interface Props {
  label: string
  approved: number
  pending?: number
  plan: number | null
  unit?: string
}

// Полоса прогресса "план/факт" с двумя сегментами: тёмный — подтверждённый
// факт (approved-сводки), светлый — то, что уже отправлено, но ещё не
// согласовано (submitted). Не пишем процент, если план не задан —
// показываем голый факт, чтобы не изобретать план из воздуха.
export default function ProgressBar({
  label,
  approved,
  pending = 0,
  plan,
  unit = 'м',
}: Props) {
  const hasPlan = plan != null && plan > 0
  const approvedPct = hasPlan ? Math.min(100, (approved / plan) * 100) : 0
  const pendingPct = hasPlan
    ? Math.min(100 - approvedPct, (pending / plan) * 100)
    : 0

  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 12.5,
          fontWeight: 600,
          color: 'var(--color-text-muted)',
          marginBottom: 5,
        }}
      >
        <span>{label}</span>
        <span className="num" style={{ color: 'var(--color-text)' }}>
          {approved}
          {hasPlan ? ` / ${plan}` : ''} {unit}
          {hasPlan && (
            <span style={{ color: 'var(--color-text-muted)' }}>
              {' '}
              ({Math.round(approvedPct)}%)
            </span>
          )}
        </span>
      </div>
      <div
        style={{
          height: 7,
          borderRadius: 4,
          background: 'var(--color-border)',
          overflow: 'hidden',
          display: 'flex',
        }}
      >
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${hasPlan ? approvedPct : 100}%` }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          style={{ background: 'var(--color-primary)', borderRadius: 4 }}
        />
        {hasPlan && pendingPct > 0 && (
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pendingPct}%` }}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            style={{ background: 'var(--color-accent-soft)' }}
          />
        )}
      </div>
    </div>
  )
}
