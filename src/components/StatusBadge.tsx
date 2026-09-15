import type { ReactNode } from 'react'
import type { ApprovalStatus, TaskStatus } from '../types/database'

type Variant = 'neutral' | 'primary' | 'success' | 'danger' | 'warning'

const APPROVAL_CONFIG: Record<ApprovalStatus, { label: string; variant: Variant }> = {
  draft: { label: 'Черновик', variant: 'neutral' },
  submitted: { label: 'На согласовании', variant: 'primary' },
  approved: { label: 'Одобрено', variant: 'success' },
  rejected: { label: 'Отклонено', variant: 'danger' },
}

const TASK_STATUS_CONFIG: Record<TaskStatus, { label: string; variant: Variant }> = {
  planned: { label: 'Запланировано', variant: 'neutral' },
  in_progress: { label: 'В работе', variant: 'primary' },
  suspended: { label: 'Приостановлено', variant: 'warning' },
  completed: { label: 'Завершено', variant: 'success' },
}

export function ApprovalBadge({ status }: { status: ApprovalStatus }) {
  const { label, variant } = APPROVAL_CONFIG[status]
  return <Badge variant={variant}>{label}</Badge>
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const { label, variant } = TASK_STATUS_CONFIG[status]
  return <Badge variant={variant}>{label}</Badge>
}

function Badge({ variant, children }: { variant: Variant; children: ReactNode }) {
  return <span className={`badge badge-${variant}`}>{children}</span>
}
