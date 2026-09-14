import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { describeApiError } from '../lib/apiError';
import { SHIFT_PATTERN_LABEL } from '../lib/labels';
import { PageHeader } from '../components/PageHeader';
import { Card, EmptyState, ErrorState } from '../components/ui';
import { IconTeam } from '../components/icons';
import { TimesheetPeriodsSection } from '../components/TimesheetPeriodsSection';

interface Position {
  id: string;
  name: string;
}

interface Member {
  id: string;
  fullName: string;
  position: Position;
}

interface MyCrewData {
  id: string;
  name: string;
  shiftPattern: string | null;
  site: { id: string; name: string; code: string };
  members: Member[];
}

/**
 * Бригадир заходит сюда, чтобы увидеть состав своей бригады и завести
 * табель за период (кнопка "+ Добавить табель" — см. TimesheetPeriodsSection).
 * Раньше у бригадира не было ни одного экрана со своей бригадой целиком —
 * только форма одиночной записи и список уже отправленных табелей.
 */
export function MyCrew() {
  const [crews, setCrews] = useState<MyCrewData[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  function load() {
    setError(null);
    apiFetch<MyCrewData[]>('/crews/mine').then(setCrews).catch(setError);
  }

  useEffect(load, []);

  if (error) {
    return (
      <div>
        <PageHeader crumbs={[{ label: 'Полевая работа' }]} title="Моя бригада" />
        <ErrorState {...describeApiError(error)} onRetry={load} />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <PageHeader crumbs={[{ label: 'Полевая работа' }]} title="Моя бригада" description="Состав бригады и табели за период." />

      {crews === null ? (
        <p className="text-sm text-ink-muted">Загрузка…</p>
      ) : crews.length === 0 ? (
        <EmptyState icon={IconTeam} title="Вы пока не назначены бригадиром ни одной бригады" description="Обратитесь к владельцу компании." />
      ) : (
        <div className="space-y-4">
          {crews.map((crew) => (
            <Card key={crew.id} className="p-5">
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <h3 className="font-medium text-ink">{crew.name}</h3>
                <span className="text-xs text-ink-muted">
                  {crew.shiftPattern ? SHIFT_PATTERN_LABEL[crew.shiftPattern] ?? crew.shiftPattern : 'график не задан'}
                </span>
              </div>
              <p className="mb-3 text-sm text-ink-muted">{crew.site.name}</p>

              {crew.members.length > 0 && (
                <ul className="space-y-1.5">
                  {crew.members.map((m) => (
                    <li key={m.id} className="flex justify-between text-sm text-ink">
                      <span>{m.fullName}</span>
                      <span className="text-ink-muted">{m.position.name}</span>
                    </li>
                  ))}
                </ul>
              )}

              <TimesheetPeriodsSection crewId={crew.id} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
