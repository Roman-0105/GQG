import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { enqueueTimesheet, getUnsyncedCount, syncQueue, QueuedTimesheet } from '../lib/offlineQueue';
import { getSessionUser } from '../lib/session';
import { loadMyCrews, MyCrew } from '../lib/myCrewsCache';
import { WORK_TYPES } from '../lib/labels';
import { PageHeader } from '../components/PageHeader';
import { Badge, Button, Card, Checkbox, EmptyState, Field, Input, Select, Textarea } from '../components/ui';
import { IconTimesheetNew, IconWifi, IconWifiOff } from '../components/icons';

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
    return <p className="text-crit">Сессия не найдена — войдите заново.</p>;
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
    <div className="max-w-lg">
      <PageHeader
        crumbs={[{ label: 'Полевая работа' }]}
        title="Табель за смену"
        action={
          <Badge tone={isOnline ? 'good' : 'warn'}>
            {isOnline ? <IconWifi size={13} /> : <IconWifiOff size={13} />}
            {isOnline ? 'в сети' : 'офлайн'}
          </Badge>
        }
      />

      {crewsError && crews.length === 0 && <p className="mb-4 text-sm text-crit">{crewsError}</p>}
      {fromCache && (
        <p className="mb-4 text-xs text-warn">Список бригад не обновлён (нет связи) — показан последний известный.</p>
      )}
      {!crewsError && crews.length === 0 && (
        <EmptyState
          icon={IconTimesheetNew}
          title="Вы не назначены бригадиром ни одной бригады"
          description="Обратитесь к руководителю участка, чтобы вас назначили — без этого вносить табель некуда."
        />
      )}

      {unsyncedCount > 0 && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-warn/40 bg-warn/10 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-warn">
            <IconWifiOff size={16} />
            <span>
              Не синхронизировано записей на этом устройстве: <strong>{unsyncedCount}</strong>
            </span>
          </div>
          <Button size="sm" variant="secondary" onClick={handleSync} disabled={!isOnline}>
            Синхронизировать
          </Button>
        </div>
      )}

      {crews.length > 0 && (
        <Card className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Бригада">
                <Select value={crewId} onChange={(e) => handleCrewChange(e.target.value)}>
                  {crews.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {c.site.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Сотрудник">
                <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required>
                  {selectedCrew?.members.length === 0 && <option value="">Нет сотрудников</option>}
                  {selectedCrew?.members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.fullName} — {m.position.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Дата">
                <Input type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} required />
              </Field>
              <Field label="Вид работ">
                <Select value={workType} onChange={(e) => setWorkType(e.target.value)}>
                  {WORK_TYPES.map((w) => (
                    <option key={w.value} value={w.value}>
                      {w.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <Field label="Часы">
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  value={regularHours}
                  onChange={(e) => setRegularHours(Number(e.target.value))}
                />
              </Field>
              <Field label="Сверхурочные">
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  value={overtimeHours}
                  onChange={(e) => setOvertimeHours(Number(e.target.value))}
                />
              </Field>
              <Field label="Ночные">
                <Input type="number" min={0} step={0.5} value={nightHours} onChange={(e) => setNightHours(Number(e.target.value))} />
              </Field>
            </div>

            <Checkbox checked={isHoliday} onChange={setIsHoliday} label="Праздничный/выходной день" />

            <Field label="Заметка" hint="Необязательно">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </Field>

            {savedMessage && <p className="text-sm text-good">{savedMessage}</p>}

            <Button type="submit" disabled={!employeeId} className="w-full">
              Сохранить табель
            </Button>
          </form>
        </Card>
      )}

      <Link to="/timesheets" className="mt-4 block text-center text-sm font-medium text-accent-2">
        Мои табели →
      </Link>
    </div>
  );
}
