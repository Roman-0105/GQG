import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { STATUS_COLOR, STATUS_LABEL, WORK_TYPE_LABEL } from '../lib/labels';

interface ReviewTimesheet {
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
  submittedBy: { fullName: string } | null;
}

/**
 * Согласование табелей руководителем участка (docs/project-plan.md,
 * раздел 4): submitted → approved/rejected → locked. Показывает все
 * табели в scope пользователя (own_sites/company), не только
 * ожидающие — иначе руководитель не увидел бы, что уже подтвердил и
 * готово к блокировке периода.
 */
export function Approvals() {
  const [timesheets, setTimesheets] = useState<ReviewTimesheet[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'submitted' | 'approved' | 'all'>('submitted');

  function load() {
    const query = filter === 'all' ? '' : `?status=${filter}`;
    apiFetch<ReviewTimesheet[]>(`/timesheets${query}`)
      .then(setTimesheets)
      .catch((err) => setError(err instanceof Error ? err.message : 'Не удалось загрузить табели'));
  }

  useEffect(load, [filter]);

  async function act(id: string, action: 'approve' | 'reject' | 'lock') {
    setBusyId(id);
    setError(null);
    try {
      await apiFetch(`/timesheets/${id}/${action}`, { method: 'POST' });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось выполнить действие');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-screen bg-bg p-8">
      <div className="max-w-3xl mx-auto">
        <Link to="/dashboard" className="text-sm text-accent-2 mb-4 inline-block">← Панель</Link>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-ink">Согласование табелей</h1>
          <div className="flex gap-1 text-sm">
            {(['submitted', 'approved', 'all'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-full ${filter === f ? 'bg-accent text-white' : 'bg-surface-2 text-ink-muted'}`}
              >
                {f === 'submitted' ? 'На согласовании' : f === 'approved' ? 'Подтверждены' : 'Все'}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-crit mb-4">{error}</p>}

        <div className="bg-surface border border-line rounded-lg overflow-hidden">
          {timesheets.length === 0 && !error && (
            <p className="p-5 text-sm text-ink-muted">Нет табелей в этом фильтре.</p>
          )}
          {timesheets.map((t) => (
            <div key={t.id} className="px-5 py-3 border-b border-line last:border-b-0">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-ink font-medium">{t.employee.fullName}</span>
                  <span className="text-ink-muted text-sm ml-2">
                    {t.crew.name} · {t.site.name} · {new Date(t.workDate).toLocaleDateString('ru-RU')} ·{' '}
                    {WORK_TYPE_LABEL[t.workType] ?? t.workType}
                  </span>
                </div>
                <span className={`text-xs font-mono px-2 py-1 rounded-full ${STATUS_COLOR[t.status] ?? ''}`}>
                  {STATUS_LABEL[t.status] ?? t.status}
                </span>
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-ink-muted">
                  {Number(t.regularHours)} ч{Number(t.overtimeHours) > 0 && ` + ${Number(t.overtimeHours)} сверхурочных`}
                  {t.submittedBy && ` · внёс: ${t.submittedBy.fullName}`}
                </span>
                <div className="flex gap-3">
                  {t.status === 'submitted' && (
                    <>
                      <button onClick={() => act(t.id, 'approve')} disabled={busyId === t.id} className="text-sm font-medium text-good disabled:opacity-50">
                        Подтвердить
                      </button>
                      <button onClick={() => act(t.id, 'reject')} disabled={busyId === t.id} className="text-sm font-medium text-crit disabled:opacity-50">
                        Вернуть
                      </button>
                    </>
                  )}
                  {t.status === 'approved' && (
                    <button onClick={() => act(t.id, 'lock')} disabled={busyId === t.id} className="text-sm font-medium text-accent-2 disabled:opacity-50">
                      Заблокировать период
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
