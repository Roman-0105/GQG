import { useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { Tile } from '../components/Tile';
import { Button, Badge, EmptyState, ErrorState, Tone } from '../components/ui';
import { IconPlus, IconSites } from '../components/icons';
import { apiFetch } from '../lib/api';
import { describeApiError } from '../lib/apiError';
import { useNavigate } from 'react-router-dom';

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

const STATUS_TONE: Record<string, Tone> = {
  planned: 'accent',
  active: 'good',
  paused: 'warn',
  closed: 'neutral',
};

export function Sites() {
  const navigate = useNavigate();
  const [sites, setSites] = useState<Site[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  function load() {
    setError(null);
    apiFetch<Site[]>('/sites').then(setSites).catch(setError);
  }

  useEffect(load, []);

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'Администрирование' }]}
        title="Участки"
        description="Объекты компании, их бригады и сотрудники."
        action={
          <Button onClick={() => navigate('/sites/new')}>
            <IconPlus size={16} /> Новый участок
          </Button>
        }
      />

      {error ? (
        <ErrorState {...describeApiError(error)} onRetry={load} />
      ) : sites === null ? (
        <p className="text-sm text-ink-muted">Загрузка…</p>
      ) : sites.length === 0 ? (
        <EmptyState
          icon={IconSites}
          title="Пока нет ни одного участка"
          description="Добавьте первый объект — после этого можно будет завести на нём бригады и сотрудников."
          action={
            <Button onClick={() => navigate('/sites/new')}>
              <IconPlus size={16} /> Новый участок
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {sites.map((site) => (
            <Tile
              key={site.id}
              to={`/sites/${site.id}`}
              icon={IconSites}
              title={site.name}
              description={WORK_TYPE_LABEL[site.workType] ?? site.workType}
              meta={
                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-mono text-xs text-ink-muted">{site.code}</span>
                  <Badge tone={STATUS_TONE[site.status] ?? 'neutral'}>{STATUS_LABEL[site.status] ?? site.status}</Badge>
                </div>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
