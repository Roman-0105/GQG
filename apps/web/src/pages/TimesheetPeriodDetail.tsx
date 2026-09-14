import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { describeApiError } from '../lib/apiError';
import { useCurrentUser } from '../lib/useCurrentUser';
import { PAY_TYPE_LABEL, PERIOD_STATUS_LABEL, PERIOD_STATUS_TONE, WORK_TYPE_LABEL, WORK_TYPES } from '../lib/labels';
import { PageHeader } from '../components/PageHeader';
import { Badge, Button, Card, ErrorState, Field, Input, Select, Textarea } from '../components/ui';
import { IconChevronLeft, IconCheck, IconEdit } from '../components/icons';

interface Position {
  id: string;
  name: string;
}

interface Member {
  id: string;
  fullName: string;
  position: Position;
}

interface PersonRef {
  fullName: string;
}

interface ReviewerRef {
  fullName: string;
  roleAssignments: { role: { name: string } }[];
}

interface ReviewEntry {
  id: string;
  action: string;
  comment: string | null;
  createdAt: string;
  actor: ReviewerRef;
}

interface Period {
  id: string;
  periodStart: string;
  periodEnd: string;
  workType: string;
  payType: string;
  status: string;
  rejectionReason: string | null;
  createdBy: PersonRef;
  submittedAt: string | null;
  submittedBy: PersonRef | null;
  reviewedAt: string | null;
  reviewedBy: ReviewerRef | null;
  task: { id: string; wellName: string } | null;
  reviews: ReviewEntry[];
  crew: {
    id: string;
    name: string;
    siteId: string;
    site: { id: string; name: string };
    members: Member[];
  };
}

function reviewerLabel(r: ReviewerRef) {
  const role = r.roleAssignments[0]?.role.name;
  return role ? `${role} ${r.fullName}` : r.fullName;
}

const REVIEW_ACTION_LABEL: Record<string, string> = {
  submitted: 'Отправлен на согласование',
  approved: 'Согласован',
  rejected: 'Не согласован',
};

interface Entry {
  id: string;
  employeeId: string;
  workDate: string;
  regularHours: string;
  overtimeHours: string;
  nightHours: string;
  metersDrilled: string | null;
  status: string;
  correctionReason: string | null;
}

type HourField = 'regularHours' | 'overtimeHours' | 'nightHours' | 'metersDrilled';

// Фон ячейки/строки по статусу конкретной записи — бригадир должен
// видеть с первого взгляда, какие дни уже согласованы, а какие ещё
// нет (найдено при тестировании владельцем).
const ENTRY_STATUS_BG: Record<string, string> = {
  submitted: 'bg-warn/10',
  approved: 'bg-good/10',
  locked: 'bg-good/10',
  rejected: 'bg-crit/10',
};

function toDateInput(iso: string) {
  return iso.slice(0, 10);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ru-RU');
}

// В открытом табеле не было видно, за какой месяц он вообще заведён
// (найдено при тестировании владельцем) — период может лежать внутри
// одного месяца или захватывать два соседних (напр. 17.09–01.10).
function formatMonthSpan(startIso: string, endIso: string) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const startLabel = start.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  const endLabel = end.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  return startLabel === endLabel ? startLabel : `${startLabel} – ${endLabel}`;
}

function enumerateDates(startIso: string, endIso: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(startIso.slice(0, 10) + 'T00:00:00Z');
  const end = new Date(endIso.slice(0, 10) + 'T00:00:00Z');
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export function TimesheetPeriodDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasPermission } = useCurrentUser();
  const canReview = hasPermission('timesheet_period', 'approve');
  const [period, setPeriod] = useState<Period | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [editingDates, setEditingDates] = useState(false);
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [editWorkType, setEditWorkType] = useState('drilling');

  // Отклонение требует причины — форма открывается по клику "Не
  // согласовано", как и на других формах отклонения в приложении.
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // Повторная отправка после отклонения требует комментария: что
  // исправлено согласно замечаниям, либо почему бригадир не согласен
  // с причиной отклонения (по требованию владельца). При первой
  // отправке комментарий необязателен, поле просто не показываем.
  const [resubmitting, setResubmitting] = useState(false);
  const [resubmitComment, setResubmitComment] = useState('');

  // Актуально только для payType='hourly' — сверх обычных часов можно
  // ещё проставить сверхурочные/ночные (найдено при тестировании
  // владельцем — раньше в сетке вообще не было, куда их вписать).
  // Расчёт ЗП по сверхурочным/ночным часам из сетки — отдельная задача
  // на потом (сами формулы уже поддерживают эти поля через одиночную
  // форму "Внести табель").
  const [detailedMode, setDetailedMode] = useState(false);

  // "Редактировать график" — переоткрыть уже отправленные/согласованные
  // (но не заблокированные) дни на правку с обязательным комментарием
  // (найдено при тестировании: бригадир по невнимательности пропустил
  // смену и заметил это уже после того, как остальное согласовали).
  const [reopening, setReopening] = useState(false);
  const [reopenFrom, setReopenFrom] = useState('');
  const [reopenTo, setReopenTo] = useState('');
  const [reopenEmployeeId, setReopenEmployeeId] = useState('');
  const [reopenReason, setReopenReason] = useState('');
  const [reopenSaving, setReopenSaving] = useState(false);
  const [reopenError, setReopenError] = useState<string | null>(null);

  function loadPeriod() {
    if (!id) return;
    setLoadError(null);
    apiFetch<Period>(`/timesheet-periods/${id}`)
      .then((p) => {
        setPeriod(p);
        setEditStart(toDateInput(p.periodStart));
        setEditEnd(toDateInput(p.periodEnd));
        setEditWorkType(p.workType);
        setReopenFrom((prev) => prev || toDateInput(p.periodStart));
        setReopenTo((prev) => prev || toDateInput(p.periodEnd));
      })
      .catch(setLoadError);
  }

  function loadEntries() {
    if (!id) return;
    apiFetch<Entry[]>(`/timesheets?timesheetPeriodId=${id}`)
      .then(setEntries)
      .catch(() => setEntries([]));
  }

  useEffect(() => {
    loadPeriod();
    loadEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const dates = useMemo(() => (period ? enumerateDates(period.periodStart, period.periodEnd) : []), [period]);
  const isPerMeter = period?.payType === 'per_meter';

  async function handleSaveDates(e: FormEvent) {
    e.preventDefault();
    if (!id) return;
    setActionError(null);
    setBusy(true);
    try {
      await apiFetch(`/timesheet-periods/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ periodStart: editStart, periodEnd: editEnd, workType: editWorkType }),
      });
      setEditingDates(false);
      loadPeriod();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Не удалось сохранить даты');
    } finally {
      setBusy(false);
    }
  }

  /** Одна строка табеля (сотрудник+дата) — создаёт или правит поле, не трогает уже отправленные/заблокированные. */
  async function upsertEntry(employeeId: string, workDate: string, field: HourField, amount: number) {
    if (!period) return;
    const existing = entries.find((en) => en.employeeId === employeeId && en.workDate.slice(0, 10) === workDate);
    if (existing) {
      if (!['draft', 'rejected'].includes(existing.status)) return; // уже ушла на согласование — не трогаем
      await apiFetch(`/timesheets/${existing.id}`, { method: 'PATCH', body: JSON.stringify({ [field]: amount }) });
    } else if (amount > 0) {
      // Новая строка может впервые появиться из любого поля (например,
      // бригадир сначала проставил ночные, а обычные часы — нулевые,
      // если это была чисто ночная смена) — regularHours для API
      // обязателен, поэтому по умолчанию 0, если создаём не из него.
      await apiFetch('/timesheets', {
        method: 'POST',
        body: JSON.stringify({
          employeeId,
          siteId: period.crew.siteId,
          crewId: period.crew.id,
          timesheetPeriodId: period.id,
          workDate,
          workType: period.workType,
          regularHours: field === 'regularHours' ? amount : 0,
          [field]: amount,
        }),
      });
    }
  }

  async function handleCellChange(employeeId: string, workDate: string, field: HourField, value: string) {
    if (!period || !id) return;
    const amount = value === '' ? 0 : Number(value);
    if (Number.isNaN(amount) || amount < 0) return;
    try {
      await upsertEntry(employeeId, workDate, field, amount);
      loadEntries();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Не удалось сохранить часы');
    }
  }

  /**
   * Метраж за метраж-табель — одно значение в день на ВСЮ бригаду
   * (буровики работают вместе, а не по отдельности — найдено при
   * тестировании), а не на каждого буровика/пом. бурового отдельно.
   * Пишет одинаковое значение в строку каждого сотрудника периода —
   * записи остаются per-employee в БД (расчёт ЗП и аналитика не
   * тронуты), просто UI больше не даёт их развести.
   */
  async function handleTeamMeterageChange(workDate: string, value: string) {
    if (!period || !id) return;
    const amount = value === '' ? 0 : Number(value);
    if (Number.isNaN(amount) || amount < 0) return;
    try {
      for (const m of period.crew.members) {
        // eslint-disable-next-line no-await-in-loop
        await upsertEntry(m.id, workDate, 'metersDrilled', amount);
      }
      loadEntries();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Не удалось сохранить метраж');
    }
  }

  async function handleSubmitPeriod(e?: FormEvent) {
    e?.preventDefault();
    if (!id) return;
    setActionError(null);
    setBusy(true);
    try {
      await apiFetch(`/timesheet-periods/${id}/submit`, {
        method: 'POST',
        body: JSON.stringify({ comment: resubmitComment || undefined }),
      });
      setResubmitting(false);
      setResubmitComment('');
      loadPeriod();
      loadEntries();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Не удалось отправить табель на согласование');
    } finally {
      setBusy(false);
    }
  }

  async function handleApprovePeriod() {
    if (!id) return;
    setActionError(null);
    setBusy(true);
    try {
      await apiFetch(`/timesheet-periods/${id}/approve`, { method: 'POST' });
      loadPeriod();
      loadEntries();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Не удалось согласовать табель');
    } finally {
      setBusy(false);
    }
  }

  async function handleRejectPeriod(e: FormEvent) {
    e.preventDefault();
    if (!id) return;
    setActionError(null);
    setBusy(true);
    try {
      await apiFetch(`/timesheet-periods/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason: rejectReason }) });
      setRejecting(false);
      setRejectReason('');
      loadPeriod();
      loadEntries();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Не удалось отклонить табель');
    } finally {
      setBusy(false);
    }
  }

  async function handleReopenDays(e: FormEvent) {
    e.preventDefault();
    if (!id) return;
    setReopenError(null);
    setReopenSaving(true);
    try {
      const result = await apiFetch<{ reopened: number }>(`/timesheet-periods/${id}/reopen-days`, {
        method: 'POST',
        body: JSON.stringify({
          fromDate: reopenFrom,
          toDate: reopenTo,
          reason: reopenReason,
          employeeId: reopenEmployeeId || undefined,
        }),
      });
      setReopening(false);
      setReopenReason('');
      setActionError(
        result.reopened === 0
          ? 'В выбранном диапазоне не нашлось отправленных/согласованных записей — переоткрывать нечего (пустые дни и так доступны для заполнения).'
          : null,
      );
      loadEntries();
    } catch (err) {
      setReopenError(err instanceof Error ? err.message : 'Не удалось переоткрыть дни');
    } finally {
      setReopenSaving(false);
    }
  }

  if (loadError) {
    return (
      <div>
        <PageHeader crumbs={[{ label: 'Полевая работа' }]} title="Табель за период" />
        <ErrorState {...describeApiError(loadError)} onRetry={loadPeriod} />
      </div>
    );
  }

  if (!period) {
    return <p className="text-sm text-ink-muted">Загрузка…</p>;
  }

  // Итог для почасового табеля — сумма всех видов часов (обычные +
  // сверхурочные + ночные) по каждому сотруднику отдельно. Для табеля
  // за метраж — метраж теперь ОДНО значение в день на всю бригаду
  // (найдено при тестировании: буровики работают за метраж вместе, не
  // по отдельности), одинаковое у каждого per_meter-сотрудника
  // (см. handleTeamMeterageChange) — поэтому итог за день/за период
  // берёт значение один раз, а не суммирует по всем строкам, иначе
  // умножился бы на число буровиков.
  const entryValue = (en: Entry) =>
    isPerMeter ? Number(en.metersDrilled ?? 0) : Number(en.regularHours) + Number(en.overtimeHours) + Number(en.nightHours);
  const unit = isPerMeter ? 'м' : 'ч';
  const rowTotal = (employeeId: string) =>
    entries.filter((en) => en.employeeId === employeeId).reduce((sum, en) => sum + entryValue(en), 0);
  const teamEntryForDate = (workDate: string) => entries.find((en) => en.workDate.slice(0, 10) === workDate);
  const columnTotal = (workDate: string) => {
    if (isPerMeter) {
      const en = teamEntryForDate(workDate);
      return en ? entryValue(en) : 0;
    }
    return entries.filter((en) => en.workDate.slice(0, 10) === workDate).reduce((sum, en) => sum + entryValue(en), 0);
  };
  const grandTotal = isPerMeter ? dates.reduce((sum, d) => sum + columnTotal(d), 0) : entries.reduce((sum, en) => sum + entryValue(en), 0);

  // Пока табель не отправлен (или отклонён) — сетка редактируется
  // напрямую. После отправки — только чтение, до решения проверяющего.
  const canEditDates = ['draft', 'rejected'].includes(period.status);
  const gridEditable = canEditDates;

  return (
    <div className="max-w-full">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-3 flex items-center gap-1 text-sm text-ink-muted transition-colors hover:text-ink"
      >
        <IconChevronLeft size={16} /> Назад
      </button>
      <PageHeader
        crumbs={[{ label: 'Полевая работа' }]}
        title={`Табель: ${period.crew.name}`}
        description={`${period.crew.site.name}${period.task ? ` · ${period.task.wellName}` : ''} · ${formatMonthSpan(period.periodStart, period.periodEnd)} · ${formatDate(period.periodStart)} – ${formatDate(period.periodEnd)} · ${WORK_TYPE_LABEL[period.workType] ?? period.workType} · ${PAY_TYPE_LABEL[period.payType] ?? period.payType}`}
        action={<Badge tone={PERIOD_STATUS_TONE[period.status] ?? 'neutral'}>{PERIOD_STATUS_LABEL[period.status] ?? period.status}</Badge>}
      />

      {actionError && <p className="mb-3 text-sm text-crit">{actionError}</p>}

      {/* Даты периода и "Редактировать график" */}
      <Card className="mb-4 p-5">
        {editingDates ? (
          <form onSubmit={handleSaveDates} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="С какой даты">
                <Input type="date" value={editStart} onChange={(e) => setEditStart(e.target.value)} required />
              </Field>
              <Field label="По какую дату">
                <Input type="date" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} required />
              </Field>
            </div>
            <Field label="Вид работ">
              <Select value={editWorkType} onChange={(e) => setEditWorkType(e.target.value)}>
                {WORK_TYPES.map((w) => (
                  <option key={w.value} value={w.value}>
                    {w.label}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={busy}>
                Сохранить
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => setEditingDates(false)}>
                Отмена
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex items-center justify-between">
            <div className="space-y-1 text-sm">
              <p className="text-ink">Создал: {period.createdBy.fullName}</p>
              {period.status === 'approved' && period.reviewedBy && (
                <p className="flex items-center gap-1.5 text-good">
                  <IconCheck size={14} /> Согласовано: {reviewerLabel(period.reviewedBy)}
                </p>
              )}
              {period.status === 'rejected' && (
                <>
                  {period.reviewedBy && <p className="text-crit">Не согласовано: {reviewerLabel(period.reviewedBy)}</p>}
                  {period.rejectionReason && <p className="rounded-md bg-crit/10 p-2 text-crit">Примечание: {period.rejectionReason}</p>}
                </>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {canEditDates && (
                <Button size="sm" variant="secondary" onClick={() => setEditingDates(true)}>
                  <IconEdit size={14} /> Изменить даты
                </Button>
              )}
              {canEditDates && period.status === 'draft' && (
                <Button size="sm" onClick={() => handleSubmitPeriod()} disabled={busy}>
                  Отправить на согласование
                </Button>
              )}
              {canEditDates && period.status === 'rejected' && !resubmitting && (
                <Button size="sm" onClick={() => setResubmitting(true)} disabled={busy}>
                  Отправить снова на согласование
                </Button>
              )}
              {period.status === 'submitted' && (
                <Button size="sm" variant="secondary" onClick={() => setReopening((v) => !v)}>
                  <IconEdit size={14} /> Редактировать график
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Повторная отправка после отклонения — комментарий обязателен: что исправлено или почему бригадир не согласен */}
        {resubmitting && (
          <form onSubmit={handleSubmitPeriod} className="mt-3 space-y-2 rounded-md border border-line bg-surface-2 p-3">
            <Textarea
              autoFocus
              placeholder="Что исправлено согласно замечаниям — или почему вы не согласны с причиной отклонения"
              value={resubmitComment}
              onChange={(e) => setResubmitComment(e.target.value)}
              required
              rows={2}
            />
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={busy || !resubmitComment.trim()}>
                Отправить с этим комментарием
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => setResubmitting(false)}>
                Отмена
              </Button>
            </div>
          </form>
        )}
      </Card>

      {/* История согласований — все отправки/решения по этому табелю, с датой, автором и комментарием */}
      {period.reviews.length > 0 && (
        <Card className="mb-4 p-5">
          <h3 className="mb-3 text-sm font-medium text-ink">История согласований</h3>
          <ul className="space-y-2.5">
            {period.reviews.map((r) => (
              <li key={r.id} className="border-l-2 border-line pl-3 text-sm">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span
                    className={
                      r.action === 'approved' ? 'font-medium text-good' : r.action === 'rejected' ? 'font-medium text-crit' : 'font-medium text-ink'
                    }
                  >
                    {REVIEW_ACTION_LABEL[r.action] ?? r.action}
                  </span>
                  <span className="text-xs text-ink-muted">
                    {reviewerLabel(r.actor)} · {new Date(r.createdAt).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                </div>
                {r.comment && <p className="mt-0.5 text-ink-muted">{r.comment}</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Согласование целиком — одна подпись (начальник участка или бухгалтер), видно только тем, у кого есть право */}
      {period.status === 'submitted' && canReview && (
        <Card className="mb-4 p-5">
          <h3 className="mb-3 text-sm font-medium text-ink">Согласование табеля</h3>
          <div className="flex flex-wrap gap-2">
            {!rejecting && (
              <>
                <Button size="sm" onClick={handleApprovePeriod} disabled={busy}>
                  Согласовано
                </Button>
                <Button size="sm" variant="danger" onClick={() => setRejecting(true)} disabled={busy}>
                  Не согласовано
                </Button>
              </>
            )}
          </div>
          {rejecting && (
            <form onSubmit={handleRejectPeriod} className="mt-3 space-y-2 rounded-md border border-line bg-surface-2 p-3">
              <Textarea
                autoFocus
                placeholder="Причина — что нужно исправить бригадиру?"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                required
                rows={2}
              />
              <div className="flex gap-2">
                <Button type="submit" size="sm" variant="danger" disabled={busy || !rejectReason.trim()}>
                  Не согласовано с этим примечанием
                </Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => setRejecting(false)}>
                  Отмена
                </Button>
              </div>
            </form>
          )}
        </Card>
      )}

      {reopening && (
        <Card className="mb-4 p-5">
          <h3 className="mb-1 text-sm font-medium text-ink">Редактировать график</h3>
          <p className="mb-3 text-xs text-ink-muted">
            Пока табель ещё не рассмотрели — возвращает отдельные дни в выбранном диапазоне на правку, не дожидаясь
            решения проверяющего.
          </p>
          <form onSubmit={handleReopenDays} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="С какого дня">
                <Input type="date" value={reopenFrom} onChange={(e) => setReopenFrom(e.target.value)} required min={toDateInput(period.periodStart)} max={toDateInput(period.periodEnd)} />
              </Field>
              <Field label="По какой день">
                <Input type="date" value={reopenTo} onChange={(e) => setReopenTo(e.target.value)} required min={toDateInput(period.periodStart)} max={toDateInput(period.periodEnd)} />
              </Field>
            </div>
            <Field label="Сотрудник" hint="Не выбрано — переоткроются дни у всех сотрудников этого табеля">
              <Select value={reopenEmployeeId} onChange={(e) => setReopenEmployeeId(e.target.value)}>
                <option value="">Все сотрудники</option>
                {period.crew.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.fullName}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Причина правки">
              <Textarea
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                placeholder="Например: пропустили смену Ерасыла 5 сентября, заметили при сверке"
                required
                rows={2}
              />
            </Field>
            {reopenError && <p className="text-xs text-crit">{reopenError}</p>}
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={reopenSaving || !reopenReason.trim()}>
                {reopenSaving ? 'Сохраняем…' : 'Переоткрыть на правку'}
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => setReopening(false)}>
                Отмена
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Сетка часов — доступна сразу при создании табеля; после отправки на согласование становится только для чтения. */}
      <Card className="overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-4">
            <h3 className="text-sm font-medium text-ink">{isPerMeter ? 'Метраж по дням' : 'Часы по дням'}</h3>
            {!isPerMeter && (
              <label className="flex items-center gap-1.5 text-xs text-ink-muted">
                <input type="checkbox" checked={detailedMode} onChange={(e) => setDetailedMode(e.target.checked)} />
                Подробно (сверхурочные, ночные)
              </label>
            )}
          </div>
          {period.crew.members.length === 0 ? (
            <p className="p-4 text-sm text-warn">
              В бригаде пока нет ни одного сотрудника с видом оплаты «{PAY_TYPE_LABEL[period.payType]}» — добавьте на
              странице участка, прежде чем вносить данные.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line bg-surface-2">
                    <th className="sticky left-0 z-10 bg-surface-2 p-2 text-left font-medium text-ink-muted">
                      {isPerMeter ? 'Бригада' : 'Сотрудник'}
                    </th>
                    {dates.map((d) => (
                      <th
                        key={d}
                        className={`p-2 text-center font-medium text-ink-muted ${!isPerMeter && detailedMode ? 'min-w-[90px]' : 'min-w-[64px]'}`}
                      >
                        {new Date(d).getDate()}
                      </th>
                    ))}
                    <th className="min-w-[72px] p-2 text-center font-medium text-ink-muted">Итого, {unit}</th>
                  </tr>
                </thead>
                <tbody>
                  {isPerMeter ? (
                    // Метраж — один в день на всю бригаду (буровики работают вместе), не по сотруднику отдельно.
                    <tr className="border-b border-line align-top">
                      <td className="sticky left-0 z-10 bg-surface p-2 text-ink">
                        Вся бригада
                        <div className="text-xs text-ink-muted">{period.crew.members.map((m) => m.fullName).join(', ')}</div>
                      </td>
                      {dates.map((d) => {
                        const entry = teamEntryForDate(d);
                        const locked = !gridEditable || (entry ? !['draft', 'rejected'].includes(entry.status) : false);
                        const bg = entry ? ENTRY_STATUS_BG[entry.status] ?? '' : '';
                        const lockTitle = entry
                          ? `${entry.status === 'submitted' ? 'На согласовании' : entry.status === 'locked' ? 'Заблокировано (расчёт ЗП)' : entry.status === 'rejected' ? 'Возвращено на исправление' : ''}${entry.correctionReason ? ` · правка: ${entry.correctionReason}` : ''}`
                          : undefined;
                        return (
                          <td key={d} className={`p-1 text-center ${bg}`}>
                            <div className="flex items-center justify-center gap-0.5">
                              <input
                                type="number"
                                min={0}
                                step={0.1}
                                defaultValue={entry?.metersDrilled ? Number(entry.metersDrilled) : ''}
                                disabled={locked}
                                title={lockTitle}
                                onBlur={(e) => handleTeamMeterageChange(d, e.target.value)}
                                className="w-14 rounded border border-line bg-surface px-1 py-1 text-center text-ink disabled:opacity-50"
                              />
                              {(entry?.status === 'approved' || entry?.status === 'locked') && (
                                <IconCheck size={12} className="shrink-0 text-good" />
                              )}
                            </div>
                          </td>
                        );
                      })}
                      <td className="p-2 text-center font-medium text-ink">{grandTotal}</td>
                    </tr>
                  ) : (
                  period.crew.members.map((m) => (
                    <tr key={m.id} className="border-b border-line align-top">
                      <td className="sticky left-0 z-10 bg-surface p-2 text-ink">
                        {m.fullName}
                        <div className="text-xs text-ink-muted">{m.position.name}</div>
                      </td>
                      {dates.map((d) => {
                        const entry = entries.find((en) => en.employeeId === m.id && en.workDate.slice(0, 10) === d);
                        const locked = !gridEditable || (entry ? !['draft', 'rejected'].includes(entry.status) : false);
                        const bg = entry ? ENTRY_STATUS_BG[entry.status] ?? '' : '';
                        const lockTitle = entry
                          ? `${entry.status === 'submitted' ? 'На согласовании' : entry.status === 'approved' ? 'Согласовано' : entry.status === 'locked' ? 'Заблокировано (расчёт ЗП)' : entry.status === 'rejected' ? 'Возвращено на исправление' : ''}${entry.correctionReason ? ` · правка: ${entry.correctionReason}` : ''}`
                          : undefined;

                        if (!detailedMode) {
                          return (
                            <td key={d} className={`p-1 text-center ${bg}`}>
                              <div className="flex items-center justify-center gap-0.5">
                                <input
                                  type="number"
                                  min={0}
                                  step={0.5}
                                  defaultValue={entry ? Number(entry.regularHours) : ''}
                                  disabled={locked}
                                  title={lockTitle}
                                  onBlur={(e) => handleCellChange(m.id, d, 'regularHours', e.target.value)}
                                  className="w-14 rounded border border-line bg-surface px-1 py-1 text-center text-ink disabled:opacity-50"
                                />
                                {(entry?.status === 'approved' || entry?.status === 'locked') && (
                                  <IconCheck size={12} className="shrink-0 text-good" />
                                )}
                              </div>
                            </td>
                          );
                        }
                        return (
                          <td key={d} className={`space-y-0.5 p-1 ${bg}`}>
                            {(entry?.status === 'approved' || entry?.status === 'locked') && (
                              <div className="flex justify-center">
                                <IconCheck size={12} className="text-good" />
                              </div>
                            )}
                            <input
                              type="number"
                              min={0}
                              step={0.5}
                              defaultValue={entry ? Number(entry.regularHours) : ''}
                              disabled={locked}
                              title={lockTitle ?? 'Обычные часы'}
                              placeholder="обычн."
                              onBlur={(e) => handleCellChange(m.id, d, 'regularHours', e.target.value)}
                              className="w-full rounded border border-line bg-surface px-1 py-0.5 text-center text-xs text-ink disabled:opacity-50"
                            />
                            <input
                              type="number"
                              min={0}
                              step={0.5}
                              defaultValue={entry ? Number(entry.overtimeHours) : ''}
                              disabled={locked}
                              title={lockTitle ?? 'Сверхурочные часы'}
                              placeholder="сверхур."
                              onBlur={(e) => handleCellChange(m.id, d, 'overtimeHours', e.target.value)}
                              className="w-full rounded border border-line bg-surface px-1 py-0.5 text-center text-xs text-warn disabled:opacity-50"
                            />
                            <input
                              type="number"
                              min={0}
                              step={0.5}
                              defaultValue={entry ? Number(entry.nightHours) : ''}
                              disabled={locked}
                              title={lockTitle ?? 'Ночные часы'}
                              placeholder="ночн."
                              onBlur={(e) => handleCellChange(m.id, d, 'nightHours', e.target.value)}
                              className="w-full rounded border border-line bg-surface px-1 py-0.5 text-center text-xs text-accent-2 disabled:opacity-50"
                            />
                          </td>
                        );
                      })}
                      <td className="p-2 text-center font-medium text-ink">{rowTotal(m.id)}</td>
                    </tr>
                  ))
                  )}
                  <tr className="bg-surface-2 font-medium text-ink">
                    <td className="sticky left-0 z-10 bg-surface-2 p-2">Итого за день</td>
                    {dates.map((d) => (
                      <td key={d} className="p-2 text-center">
                        {columnTotal(d)}
                      </td>
                    ))}
                    <td className="p-2 text-center">{grandTotal}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line p-3 text-xs text-ink-muted">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-warn/40" /> на согласовании
            </span>
            <span className="flex items-center gap-1">
              <IconCheck size={12} className="text-good" /> согласовано / заблокировано
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-crit/40" /> возвращено на исправление
            </span>
            {!isPerMeter &&
              (detailedMode
                ? ' · Обычные / сверхурочные / ночные часы — по отдельной строке на каждый день. Расчёт зарплаты по сверхурочным и ночным часам пока не готов, но данные уже сохраняются.'
                : ' · Включите «Подробно», чтобы проставить сверхурочные и ночные часы.')}
          </p>
      </Card>
    </div>
  );
}
