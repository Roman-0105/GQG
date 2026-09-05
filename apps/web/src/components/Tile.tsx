import { ComponentType, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { IconProps } from './icons';

/**
 * Плитка-ссылка на раздел/сущность — единый паттерн вместо того, чтобы
 * каждая страница (Панель, Участки, ...) рисовала карточку по-своему.
 */
export function Tile({
  to,
  icon: Icon,
  title,
  description,
  meta,
}: {
  to: string;
  icon?: ComponentType<IconProps>;
  title: string;
  description?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <Link
      to={to}
      className="group flex items-start gap-3 rounded-lg border border-line bg-surface p-4 transition-colors hover:border-accent-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-2"
    >
      {Icon && (
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-surface-2 text-ink-muted group-hover:text-accent-2">
          <Icon size={18} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-medium text-ink">{title}</h3>
          {meta}
        </div>
        {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
      </div>
    </Link>
  );
}
