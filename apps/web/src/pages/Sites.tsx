import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';

interface Site {
  id: string;
  name: string;
  code: string;
  workType: string;
  status: string;
}

const WORK_TYPE_LABEL: Record<string, string> = {
  geology: 'Геология',
  geotech: 'Геотехника',
  drilling: 'Бурение',
  mixed: 'Смешанный',
};

const STATUS_LABEL: Record<string, string> = {
  planned: 'Планируется',
  active: 'Активен',
  paused: 'Приостановлен',
  closed: 'Закрыт',
};

export function Sites() {
  const [sites, setSites] = useState<Site[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Site[]>('/sites')
      .then(setSites)
      .catch((err) => setError(err instanceof Error ? err.message : 'Не удалось загрузить участки'));
  }, []);

  return (
    <div className="min-h-screen bg-bg p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-ink">Участки</h1>
        <Link to="/sites/new" className="text-sm font-medium text-white bg-accent px-4 py-2 rounded">
          + Новый участок
        </Link>
      </div>

      {error && <p className="text-crit mb-4">{error}</p>}

      {!error && sites.length === 0 && (
        <p className="text-ink-muted">Пока нет ни одного участка — добавьте первый кнопкой выше.</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl">
        {sites.map((site) => (
          <Link key={site.id} to={`/sites/${site.id}`} className="block bg-surface border border-line rounded-lg p-5 hover:border-accent transition-colors">
            <div className="flex items-baseline justify-between mb-1">
              <h2 className="font-medium text-ink">{site.name}</h2>
              <span className="text-xs font-mono text-ink-muted">{site.code}</span>
            </div>
            <p className="text-sm text-ink-muted">
              {WORK_TYPE_LABEL[site.workType] ?? site.workType} · {STATUS_LABEL[site.status] ?? site.status}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
