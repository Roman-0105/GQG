export const WORK_TYPES: { value: string; label: string }[] = [
  { value: 'drilling', label: 'Бурение' },
  { value: 'standby', label: 'Дежурство' },
  { value: 'travel', label: 'Переезд' },
  { value: 'repair', label: 'Ремонт' },
  { value: 'training', label: 'Обучение' },
  { value: 'weather_down', label: 'Простой по погоде' },
];

export const WORK_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  WORK_TYPES.map((w) => [w.value, w.label]),
);

export const STATUS_LABEL: Record<string, string> = {
  draft: 'Черновик',
  submitted: 'На согласовании',
  approved: 'Подтверждён',
  rejected: 'Возвращён',
  locked: 'Заблокирован',
};

/** @deprecated используйте STATUS_TONE + компонент Badge из components/ui.tsx */
export const STATUS_COLOR: Record<string, string> = {
  draft: 'text-ink-muted bg-surface-2',
  submitted: 'text-warn bg-warn/15',
  approved: 'text-good bg-good/15',
  rejected: 'text-crit bg-crit/15',
  locked: 'text-accent-2 bg-accent-2/15',
};

/** Тон значка статуса табеля — единая точка правды для Approvals/MyTimesheets. */
export const STATUS_TONE: Record<string, 'neutral' | 'good' | 'warn' | 'crit' | 'accent'> = {
  draft: 'neutral',
  submitted: 'warn',
  approved: 'good',
  rejected: 'crit',
  locked: 'accent',
};
