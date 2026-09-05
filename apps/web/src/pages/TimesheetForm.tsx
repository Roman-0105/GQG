import { FormEvent, useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { enqueueTimesheet, getUnsyncedCount, syncQueue, QueuedTimesheet } from '../lib/offlineQueue';
import { getSessionUser } from '../lib/session';

const WORK_TYPES: { value: string; label: string }[] = [
  { value: 'drilling', label: 'Бурение' },
  { value: 'standby', label: 'Дежурство' },
  { value: 'travel', label: 'Переезд' },
  { value: 'repair', label: 'Ремонт' },
  { value: 'training', label: 'Обучение' },
  { value: 'weather_down', label: 'Простой по погоде' },
];

/**
 * Офлайн-первая форма табеля бригадира (docs/project-plan.md, раздел 6):
 * запись сразу уходит в локальную очередь, отправка на сервер —
 * отдельным шагом, который можно повторить при появлении связи.
 *
 * Очередь ключуется по текущему пользователю устройства (lib/session) —
 * иначе на общем планшете следующий вошедший бригадир видел бы чужие
 * несинхронизированные записи (найдено security-review).
 */
export function TimesheetForm() {
  const sessionUser = getSessionUser();
  const [siteId, setSiteId] = useState('');
  const [crewId, setCrewId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [workDate, setWorkDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [workType, setWorkType] = useState('drilling');
  const [regularHours, setRegularHours] = useState(8);
  const [overtimeHours, setOvertimeHours] = useState(0);
  const [nightHours, setNightHours] = useState(0);
  const [notes, setNotes] = useState('');
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [unsyncedCount, setUnsyncedCount] = useState(() => (sessionUser ? getUnsyncedCount(sessionUser.id) : 0));
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  if (!sessionUser) {
    return (
      <div className="min-h-screen bg-bg p-8">
        <p className="text-crit">Сессия не найдена — войдите заново.</p>
      </div>
    );
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!sessionUser) return;
    enqueueTimesheet(sessionUser.id, {
      employeeId,
      siteId,
      crewId,
      workDate,
      workType,
      regularHours: Number(regularHours),
      overtimeHours: Number(overtimeHours),
      nightHours: Number(nightHours),
      notes: notes || undefined,
      clientCreatedAt: new Date().toISOString(),
    });
    setUnsyncedCount(getUnsyncedCount(sessionUser.id));
    setSavedMessage('Сохранено на устройстве. Появится на сервере при синхронизации.');
    setNotes('');
  }

  async function handleSync() {
    if (!sessionUser) return;
    const result = await syncQueue(sessionUser.id, (entry: QueuedTimesheet) =>
      apiFetch('/timesheets', {
        method: 'POST',
        body: JSON.stringify({
          employeeId: entry.employeeId,
          siteId: entry.siteId,
          crewId: entry.crewId,
          workDate: entry.workDate,
          workType: entry.workType,
          regularHours: entry.regularHours,
          overtimeHours: entry.overtimeHours,
          nightHours: entry.nightHours,
          notes: entry.notes,
          clientCreatedAt: entry.clientCreatedAt,
        }),
      }),
    );
    setUnsyncedCount(getUnsyncedCount(sessionUser.id));
    setSavedMessage(`Синхронизировано: ${result.synced}. Не удалось: ${result.failed}.`);
  }

  return (
    <div className="min-h-screen bg-bg p-8">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-ink">Табель за смену</h1>
          <span
            className={`text-xs font-mono px-2 py-1 rounded-full ${
              isOnline ? 'bg-good/15 text-good' : 'bg-warn/15 text-warn'
            }`}
          >
            {isOnline ? 'в сети' : 'офлайн'}
          </span>
        </div>

        {unsyncedCount > 0 && (
          <div className="mb-4 flex items-center justify-between bg-surface-2 border border-line rounded-lg px-4 py-3">
            <span className="text-sm text-ink-muted">Не синхронизировано записей: {unsyncedCount}</span>
            <button
              onClick={handleSync}
              disabled={!isOnline}
              className="text-sm font-medium text-accent-2 disabled:opacity-50"
            >
              Синхронизировать
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-surface border border-line rounded-lg p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs uppercase tracking-wide text-ink-muted mb-1">Участок</label>
              <input value={siteId} onChange={(e) => setSiteId(e.target.value)} required className="w-full px-3 py-2 rounded border border-line bg-surface-2 text-ink" />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wide text-ink-muted mb-1">Бригада</label>
              <input value={crewId} onChange={(e) => setCrewId(e.target.value)} required className="w-full px-3 py-2 rounded border border-line bg-surface-2 text-ink" />
            </div>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wide text-ink-muted mb-1">Сотрудник</label>
            <input value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required className="w-full px-3 py-2 rounded border border-line bg-surface-2 text-ink" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs uppercase tracking-wide text-ink-muted mb-1">Дата</label>
              <input type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} required className="w-full px-3 py-2 rounded border border-line bg-surface-2 text-ink" />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wide text-ink-muted mb-1">Вид работ</label>
              <select value={workType} onChange={(e) => setWorkType(e.target.value)} className="w-full px-3 py-2 rounded border border-line bg-surface-2 text-ink">
                {WORK_TYPES.map((w) => (
                  <option key={w.value} value={w.value}>{w.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs uppercase tracking-wide text-ink-muted mb-1">Часы</label>
              <input type="number" min={0} step={0.5} value={regularHours} onChange={(e) => setRegularHours(Number(e.target.value))} className="w-full px-3 py-2 rounded border border-line bg-surface-2 text-ink" />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wide text-ink-muted mb-1">Сверхурочные</label>
              <input type="number" min={0} step={0.5} value={overtimeHours} onChange={(e) => setOvertimeHours(Number(e.target.value))} className="w-full px-3 py-2 rounded border border-line bg-surface-2 text-ink" />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wide text-ink-muted mb-1">Ночные</label>
              <input type="number" min={0} step={0.5} value={nightHours} onChange={(e) => setNightHours(Number(e.target.value))} className="w-full px-3 py-2 rounded border border-line bg-surface-2 text-ink" />
            </div>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wide text-ink-muted mb-1">Заметка (необязательно)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 rounded border border-line bg-surface-2 text-ink" />
          </div>

          {savedMessage && <p className="text-sm text-good">{savedMessage}</p>}

          <button type="submit" className="w-full py-2 rounded bg-accent text-white font-medium">
            Сохранить табель
          </button>
        </form>
      </div>
    </div>
  );
}
