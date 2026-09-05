import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { enqueueTimesheet, getUnsyncedCount, syncQueue, QueuedTimesheet } from '../lib/offlineQueue';
import { getSessionUser } from '../lib/session';
import { loadMyCrews, MyCrew } from '../lib/myCrewsCache';
import { WORK_TYPES } from '../lib/labels';

/**
 * Офлайн-первая форма табеля бригадира (docs/project-plan.md, раздел 6):
 * запись сразу уходит в локальную очередь, отправка на сервер —
 * отдельным шагом, который можно повторить при появлении связи.
 *
 * Этап 02: участок/бригада/сотрудник больше не вводятся вручную по id —
 * бригадир выбирает из своих же бригад (GET /crews/mine), список
 * кэшируется для работы без связи.
 */
export function TimesheetForm() {
  const sessionUser = getSessionUser();
  const [crews, setCrews] = useState<MyCrew[]>([]);
  const [crewsError, setCrewsError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);

  const [crewId, setCrewId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [workDate, setWorkDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [workType, setWorkType] = useState('drilling');
  const [regularHours, setRegularHours] = useState(8);
  const [overtimeHours, setOvertimeHours] = useState(0);
  const [nightHours, setNightHours] = useState(0);
  const [isHoliday, setIsHoliday] = useState(false);
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

  useEffect(() => {
    if (!sessionUser) return;
    loadMyCrews(sessionUser.id)
      .then(({ crews: loaded, fromCache: cached }) => {
        setCrews(loaded);
        setFromCache(cached);
        if (loaded.length > 0) {
          setCrewId(loaded[0].id);
          setEmployeeId(loaded[0].members[0]?.id ?? '');
        }
      })
      .catch((err) => setCrewsError(err instanceof Error ? err.message : 'Не удалось загрузить бригады'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedCrew = useMemo(() => crews.find((c) => c.id === crewId), [crews, crewId]);

  function handleCrewChange(id: string) {
    setCrewId(id);
    const crew = crews.find((c) => c.id === id);
    setEmployeeId(crew?.members[0]?.id ?? '');
  }

  if (!sessionUser) {
    return (
      <div className="min-h-screen bg-bg p-8">
        <p className="text-crit">Сессия не найдена — войдите заново.</p>
      </div>
    );
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!sessionUser || !selectedCrew) return;
    const employee = selectedCrew.members.find((m) => m.id === employeeId);
    if (!employee) return;

    enqueueTimesheet(sessionUser.id, {
      employeeId,
      siteId: selectedCrew.site.id,
      crewId,
      workDate,
      workType,
      regularHours: Number(regularHours),
      overtimeHours: Number(overtimeHours),
      nightHours: Number(nightHours),
      isHoliday,
      notes: notes || undefined,
      clientCreatedAt: new Date().toISOString(),
      employeeName: employee.fullName,
      siteName: selectedCrew.site.name,
      crewName: selectedCrew.name,
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
          isHoliday: entry.isHoliday,
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
        <Link to="/dashboard" className="text-sm text-accent-2 mb-4 inline-block">← Панель</Link>
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

        {crewsError && crews.length === 0 && <p className="text-sm text-crit mb-4">{crewsError}</p>}
        {fromCache && (
          <p className="text-xs text-warn mb-4">Список бригад не обновлён (нет связи) — показан последний известный.</p>
        )}
        {!crewsError && crews.length === 0 && (
          <p className="text-sm text-ink-muted mb-4">Вы не назначены бригадиром ни одной бригады.</p>
        )}

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

        {crews.length > 0 && (
          <form onSubmit={handleSubmit} className="bg-surface border border-line rounded-lg p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs uppercase tracking-wide text-ink-muted mb-1">Бригада</label>
                <select value={crewId} onChange={(e) => handleCrewChange(e.target.value)} className="w-full px-3 py-2 rounded border border-line bg-surface-2 text-ink">
                  {crews.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} · {c.site.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wide text-ink-muted mb-1">Сотрудник</label>
                <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required className="w-full px-3 py-2 rounded border border-line bg-surface-2 text-ink">
                  {selectedCrew?.members.length === 0 && <option value="">Нет сотрудников</option>}
                  {selectedCrew?.members.map((m) => (
                    <option key={m.id} value={m.id}>{m.fullName} — {m.position.name}</option>
                  ))}
                </select>
              </div>
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

            <label className="flex items-center gap-2 text-sm text-ink-muted">
              <input type="checkbox" checked={isHoliday} onChange={(e) => setIsHoliday(e.target.checked)} />
              Праздничный/выходной день
            </label>

            <div>
              <label className="block text-xs uppercase tracking-wide text-ink-muted mb-1">Заметка (необязательно)</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 rounded border border-line bg-surface-2 text-ink" />
            </div>

            {savedMessage && <p className="text-sm text-good">{savedMessage}</p>}

            <button type="submit" disabled={!employeeId} className="w-full py-2 rounded bg-accent text-white font-medium disabled:opacity-60">
              Сохранить табель
            </button>
          </form>
        )}

        <Link to="/timesheets" className="block text-center text-sm text-accent-2 mt-4">
          Мои табели →
        </Link>
      </div>
    </div>
  );
}
