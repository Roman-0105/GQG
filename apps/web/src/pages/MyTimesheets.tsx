import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { getSessionUser } from '../lib/session';
import { listQueue, QueuedTimesheet } from '../lib/offlineQueue';
import { STATUS_COLOR, STATUS_LABEL, WORK_TYPE_LABEL } from '../lib/labels';

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
}

/**
 * "Мои табели" — что уже реально дошло до сервера (с настоящим
 * статусом согласования) плюс то, что ещё лежит в офлайн-очереди на
 * этом устройстве и туда не попало (docs/project-plan.md, раздел 4).
 */
export function MyTimesheets() {
  const sessionUser = getSessionUser();
  const [timesheets, setTimesheets] = useState<ServerTimesheet[]>([]);
  const [queued, setQueued] = useState<QueuedTimesheet[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    apiFetch<ServerTimesheet[]>('/timesheets')
      .then(setTimesheets)
      .catch((err) => setError(err instanceof Error ? err.message : 'Не удалось загрузить табели'));
    if (sessionUser) setQueued(listQueue(sessionUser.id));
  }

  useEffect(load, []);

  async function handleSubmit(id: string) {
    setBusyId(id);
    try {
      await apiFetch(`/timesheets/${id}/submit`, { method: 'POST' });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось отправить на согласование');
    } finally {
      setBusyId(null);
    }
  }

  if (!sessionUser) {
    return (
      <div className="min-h-screen bg-bg p-8">
        <p className="text-crit">Сессия не найдена — войдите заново.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg p-8">
      <div className="max-w-2xl mx-auto">
        <Link to="/timesheets/new" className="text-sm text-accent-2 mb-4 inline-block">← Внести табель</Link>
        <h1 className="text-2xl font-semibold text-ink mb-6">Мои табели</h1>

        {queued.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-medium text-ink-muted mb-2">Ждут синхронизации (только на этом устройстве)</h2>
            <div className="bg-surface border border-line rounded-lg overflow-hidden">
              {queued.map((q) => (
                <div key={q.localId} className="flex items-center justify-between px-5 py-3 border-b border-line last:border-b-0">
                  <div>
                    <span className="text-ink font-medium">{q.employeeName}</span>
                    <span className="text-ink-muted text-sm ml-2">{q.crewName} · {q.siteName} · {q.workDate}</span>
                  </div>
                  <span className="text-xs font-mono px-2 py-1 rounded-full bg-warn/15 text-warn">не синхронизировано</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && <p className="text-crit mb-4">{error}</p>}

        <div className="bg-surface border border-line rounded-lg overflow-hidden">
          {timesheets.length === 0 && !error && (
            <p className="p-5 text-sm text-ink-muted">Пока нет ни одного отправленного табеля.</p>
          )}
          {timesheets.map((t) => (
            <div key={t.id} className="flex items-center justify-between px-5 py-3 border-b border-line last:border-b-0">
              <div>
                <span className="text-ink font-medium">{t.employee.fullName}</span>
                <span className="text-ink-muted text-sm ml-2">
                  {t.crew.name} · {t.site.name} · {new Date(t.workDate).toLocaleDateString('ru-RU')} ·{' '}
                  {WORK_TYPE_LABEL[t.workType] ?? t.workType} · {Number(t.regularHours)} ч
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs font-mono px-2 py-1 rounded-full ${STATUS_COLOR[t.status] ?? ''}`}>
                  {STATUS_LABEL[t.status] ?? t.status}
                </span>
                {t.status === 'draft' && (
                  <button
                    onClick={() => handleSubmit(t.id)}
                    disabled={busyId === t.id}
                    className="text-sm font-medium text-accent-2 disabled:opacity-50"
                  >
                    На согласование
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
