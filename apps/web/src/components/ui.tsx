import { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes, forwardRef } from 'react';
import { IconAlertTriangle, IconCheck, IconChevronDown } from './icons';

/**
 * Общий язык форм, карточек и состояний платформы КЕРН — используется
 * на всех страницах вместо самодельной вёрстки под каждый экран.
 * Touch-цели рассчитаны на работу в перчатках/на морозе (раздел 6
 * проектного плана): минимум ~44px по высоте у интерактивных элементов.
 */

// ---------- Кнопки ----------

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'md' | 'sm';

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-2 focus-visible:ring-offset-2 focus-visible:ring-offset-bg';

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white hover:brightness-110',
  secondary: 'bg-surface-2 text-ink border border-line hover:border-accent-2',
  ghost: 'text-accent-2 hover:bg-surface-2',
  danger: 'bg-surface-2 text-crit border border-line hover:border-crit',
};

const BUTTON_SIZE: Record<ButtonSize, string> = {
  md: 'h-11 px-5 text-sm',
  sm: 'h-9 px-3.5 text-xs',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', className = '', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`${BUTTON_BASE} ${BUTTON_VARIANT[variant]} ${BUTTON_SIZE[size]} ${className}`}
      {...rest}
    />
  );
});

export function IconButton({
  label,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={`inline-flex h-11 w-11 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2 hover:text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-2 ${className}`}
      {...rest}
    />
  );
}

// ---------- Карточки ----------

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`bg-surface border border-line rounded-lg ${className}`}>{children}</div>;
}

/** Строка внутри карточки-списка — единый паттерн для перечней сущностей. */
export function ListRow({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`px-5 py-3.5 border-b border-line last:border-b-0 ${className}`}>{children}</div>;
}

// ---------- Значки статуса ----------

export type Tone = 'neutral' | 'good' | 'warn' | 'crit' | 'accent';

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-ink-muted',
  good: 'bg-good/15 text-good',
  warn: 'bg-warn/15 text-warn',
  crit: 'bg-crit/15 text-crit',
  accent: 'bg-accent-2/15 text-accent-2',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${TONE_CLASS[tone]}`}>
      {children}
    </span>
  );
}

// ---------- Поля форм ----------

export function Field({
  label,
  hint,
  error,
  className = '',
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium uppercase tracking-wide text-ink-muted mb-1.5">{label}</label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
      {error && <p className="mt-1 text-xs text-crit">{error}</p>}
    </div>
  );
}

const CONTROL_CLASS =
  'w-full h-11 px-3.5 rounded-md border border-line bg-surface-2 text-ink text-sm placeholder:text-ink-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-2 focus-visible:border-accent-2 disabled:opacity-50 transition-colors';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className = '', ...rest },
  ref,
) {
  return <input ref={ref} className={`${CONTROL_CLASS} ${className}`} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className = '', ...rest }, ref) {
    return <textarea ref={ref} className={`${CONTROL_CLASS} h-auto py-2.5 min-h-[5.5rem] resize-y ${className}`} {...rest} />;
  },
);

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /** Классы на сам `<select>` (высота, размер шрифта и т.п.) — по умолчанию как у остальных полей. */
  className?: string;
  /**
   * Классы на внешний контейнер — нужны, когда select стоит в ряду
   * (flex) и должен занять свою долю ширины (`flex-1`) или не
   * растягиваться на всю ширину (`w-auto`). Без этого `w-full` у
   * `<select>` бессмысленно упирается в авто-ширину обёртки.
   */
  wrapperClassName?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className = '', wrapperClassName = 'w-full', children, ...rest },
  ref,
) {
  return (
    <div className={`relative ${wrapperClassName}`}>
      <select ref={ref} className={`${CONTROL_CLASS} appearance-none pr-10 ${className}`} {...rest}>
        {children}
      </select>
      <IconChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted" size={16} />
    </div>
  );
});

// ---------- Индикатор прогресса ----------

const PROGRESS_FILL_CLASS: Record<Tone, string> = {
  neutral: 'bg-ink-muted',
  good: 'bg-good',
  warn: 'bg-warn',
  crit: 'bg-crit',
  accent: 'bg-accent',
};

/** Тонкая горизонтальная полоса заполнения — единый паттерн для метрик "факт/план". */
export function ProgressBar({
  value,
  tone = 'accent',
  marker,
  markerLabel,
  className = '',
}: {
  /** 0–100, значения вне диапазона обрезаются. */
  value: number;
  tone?: Tone;
  /** Необязательная отметка (0–100) поверх полосы — например, "план на сегодня". */
  marker?: number;
  markerLabel?: string;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={`relative h-2.5 w-full overflow-visible rounded-full bg-surface-2 ${className}`}>
      <div
        className={`h-full rounded-full transition-[width] duration-300 ${PROGRESS_FILL_CLASS[tone]}`}
        style={{ width: `${pct}%` }}
      />
      {marker != null && (
        <div
          title={markerLabel}
          className="absolute -top-0.5 h-3.5 w-0.5 -translate-x-1/2 rounded-full bg-ink/60"
          style={{ left: `${Math.max(0, Math.min(100, marker))}%` }}
        />
      )}
    </div>
  );
}

// ---------- Чекбокс ----------

export function Checkbox({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={`inline-flex items-center gap-2.5 py-2 select-none ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      <span
        className={`relative inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border transition-colors ${
          checked ? 'bg-accent border-accent' : 'bg-surface-2 border-line'
        }`}
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
        {checked && <IconCheck className="text-white" size={14} strokeWidth={2.5} />}
      </span>
      <span className="text-sm text-ink">{label}</span>
    </label>
  );
}

// ---------- Сегментированный переключатель (замена разномастных "таб-кнопок") ----------

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-lg bg-surface-2 p-1 border border-line">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          className={`h-9 px-3.5 rounded-md text-sm font-medium transition-colors ${
            value === opt.value ? 'bg-accent text-white' : 'text-ink-muted hover:text-ink'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ---------- Пустые/ошибочные состояния ----------

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: (props: { size?: number; className?: string }) => JSX.Element;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-ink-muted">
        <Icon size={22} />
      </span>
      <div>
        <p className="text-sm font-medium text-ink">{title}</p>
        {description && <p className="mx-auto mt-1 max-w-sm text-sm text-ink-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({
  title,
  description,
  onRetry,
}: {
  title: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-crit/15 text-crit">
        <IconAlertTriangle size={22} />
      </span>
      <div>
        <p className="text-sm font-medium text-ink">{title}</p>
        {description && <p className="mx-auto mt-1 max-w-sm text-sm text-ink-muted">{description}</p>}
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Повторить
        </Button>
      )}
    </div>
  );
}
