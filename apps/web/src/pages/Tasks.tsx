import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { Card, EmptyState, ListRow } from '../components/ui';
import { IconTimesheetNew } from '../components/icons';

interface TaskSummary {
  id: string;
  wellName: string;
  dailyPlan: string;
  hasNightShift: boolean;
  site: { id: string; name: string };
  crew: { id: string; name: string };
}

/**
 * "Задания" — вкладка бригадира (раздел «Полевая работа»): здесь
 * появляется карточка сразу после того, как начальник участка создал
 * задание и назначил его бригадиром (см. TasksSection.tsx на странице
 * участка). Открыв задание, бригадир видит план и распределяет свою
 * бригаду по сменам (см. TaskDetail.tsx).
 */
export function Tasks() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<TaskSummary[] | null>(null);

  useEffect(() => {
    apiFetch<TaskSummary[]>('/tasks/mine').then(setTasks).catch(() => setTasks([]));
  }, []);

  return (
    <div className="max-w-2xl">
      <PageHeader crumbs={[{ label: 'Полевая работа' }]} title="Задания" description="Поставленные вам задания по бригаде." />

      {tasks === null ? (
        <p className="text-sm text-ink-muted">Загрузка…</p>
      ) : tasks.length === 0 ? (
        <EmptyState icon={IconTimesheetNew} title="Пока нет поставленных заданий" description="Обратитесь к начальнику участка." />
      ) : (
        <Card className="overflow-hidden">
          {tasks.map((t) => (
            <ListRow key={t.id} className="transition-colors hover:bg-surface-2">
              <button type="button" onClick={() => navigate(`/tasks/${t.id}`)} className="flex w-full items-center justify-between text-left">
                <div className="min-w-0">
                  <span className="font-medium text-ink">{t.wellName}</span>
                  <span className="ml-2 text-xs text-ink-muted">
                    {t.site.name} · {t.crew.name} · план {Number(t.dailyPlan)} м/сут{t.hasNightShift ? ' · с ночной сменой' : ''}
                  </span>
                </div>
              </button>
            </ListRow>
          ))}
        </Card>
      )}
    </div>
  );
}
