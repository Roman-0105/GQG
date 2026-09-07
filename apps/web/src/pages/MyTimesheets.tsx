import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { getSessionUser } from '../lib/session';
import { listQueue, QueuedTimesheet } from '../lib/offlineQueue';
import { STATUS_LABEL, STATUS_TONE, WORK_TYPE_LABEL } from '../lib/labels';
import { describeApiError } from '../lib/apiError';
import { PageHeader } from '../components/PageHeader';
import { Badge, Button, Card, EmptyState, ErrorState, ListRow } from '../components/ui';
import { IconPlus, IconTimesheetList, IconWifiOff } from '../components/icons';
import { useNavigate } from 'react-router-dom';

interface ServerTimesheet {
  id: string;
  workDate: string;
  workType: string;
  regularHours: string;
  overtimeHours: string;
  nightHours: string;
  status: string;
  employee: { fullName: string };
  crew: { name: string };
  site: { name: string };
  approvedBy: { fullName: string } | null;
  rejectionReason: string | null;
}

/**
 * "Мои табели" — что уже реально дошло до сервера (с настоящим
 * статусом согласования) плюс то, что ещё лежит в офлайн-очереди на
 * этом устройстве и туда не попало (docs/project-plan.md, раздел 4).
 */
export function MyTimesheets() {
  const navigate = useNavigate();
  const sessionUser = getSessionUser();
  const [timesheets, setTimesheets] = useState<ServerTimesheet[] | null>(null);
  const [queued, setQueued] = useState<QueuedTimesheet[]>([]);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    setLoadError(null);
    apiFetch<ServerTimesheet[]>('/timesheets').then(setTimesheets).catch(setLoadError);
    if (sessionUser) setQueued(listQueue(sessionUser.id));
  }

  useEffect(load, []);

  async function handleSubmit(id: string) {
    setBusyId(id);
    setActionError(null);
    try {
      await apiFetch(`/timesheets/${id}/submit`, { method: 'POST' });
      load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Не удалось отправить на согласование');
    } finally {
      setBusyId(null);
    }
  }

  if (!sessionUser) {
    return <p className="text-crit">Сессия не найдена — войдите заново.</p>;
  }

  return (
    <div className="max-w-2xl">
      <PageHeader
        crumbs={[{ label: 'Полевая работа' }]}
        title="Мои табели"
        action={
          <Button onClick={() => navigate('/timesheets/new')}>
            <IconPlus size={16} /> Внести табель
          </Button>
        }
      />

      {queued.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-warn">
            <IconWifiOff size={14} /> Ждут синхронизации (только на этом устройстве)
          </h2>
          <Card className="overflow-hidden">
            {queued.map((q) => (
              <ListRow key={q.localId} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="font-medium text-ink">{q.employeeName}</span>
                  <span className="ml-2 text-sm text-ink-muted">
                    {q.crewName} · {q.siteName} · {q.workDate}
                  </span>
                </div>
                <Badge tone="warn">не синхронизировано</Badge>
              </ListRow>
            ))}
          </Card>
        </div>
      )}

      {actionError && <p className="mb-3 text-sm text-crit">{actionError}</p>}

      <Card className="overflow-hidden">
        {loadError ? (
          <ErrorState {...describeApiError(loadError)} onRetry={load} />
        ) : timesheets === null ? (
          <p className="p-5 text-sm text-ink-muted">Загрузка…</p>
        ) : timesheets.length === 0 ? (
          <EmptyState icon={IconTimesheetList} title="Пока нет ни одного отправленного табеля" description="Внесите первую смену кнопкой выше." />
        ) : (
          timesheets.map((t) => (
            <ListRow key={t.id}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="font-medium text-ink">{t.employee.fullName}</span>
                  <span className="ml-2 text-sm text-ink-muted">
                    {t.crew.name} · {t.site.name} · {new Date(t.workDate).toLocaleDateString('ru-RU')} ·{' '}
                    {WORK_TYPE_LABEL[t.workType] ?? t.workType} · {Number(t.regularHours)} ч
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Badge tone={STATUS_TONE[t.status] ?? 'neutral'}>{STATUS_LABEL[t.status] ?? t.status}</Badge>
                  {/* Тот же переход обслуживает и первую отправку (draft),
                      и повторную после возврата на исправление (rejected) —
                      см. ALLOWED_TRANSITIONS в timesheets.service.ts. Раньше
                      кнопка показывалась только для draft, и отклонённый
                      табель оставался в интерфейсе без единого доступного
                      действия (найдено docs-writer при подготовке Этапа 06). */}
                  {(t.status === 'draft' || t.status === 'rejected') && (
                    <Button size="sm" variant="ghost" onClick={() => handleSubmit(t.id)} disabled={busyId === t.id}>
                      {t.status === 'rejected' ? 'Отправить повторно' : 'На согласование'}
                    </Button>
                  )}
                </div>
              </div>
              {t.status === 'rejected' && t.rejectionReason && (
                <p className="mt-2 rounded-md bg-crit/10 p-2 text-xs text-crit">
                  Что исправить: {t.rejectionReason}
                </p>
              )}
            </ListRow>
          ))
        )}
      </Card>
    </div>
  );
}
