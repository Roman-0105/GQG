import { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export interface Crumb {
  label: string;
  to?: string;
}

/**
 * Единый тулбар страницы: принадлежность разделу (крошки) → заголовок →
 * основное действие. До этого на каждой странице действие лежало
 * по-своему («+ Новый участок» в углу, «+ Добавить» внизу формы и т.д.) —
 * теперь один и тот же слот у всех экранов.
 */
export function PageHeader({
  crumbs,
  title,
  description,
  action,
}: {
  crumbs?: Crumb[];
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6">
      {crumbs && crumbs.length > 0 && (
        <nav className="mb-1.5 flex items-center gap-1.5 text-xs text-ink-muted">
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-line">/</span>}
              {c.to ? (
                <Link to={c.to} className="hover:text-accent-2 transition-colors">
                  {c.label}
                </Link>
              ) : (
                <span>{c.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-sm text-ink-muted">{description}</p>}
        </div>
        {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
      </div>
    </div>
  );
}
