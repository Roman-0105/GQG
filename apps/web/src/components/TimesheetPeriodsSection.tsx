import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { PAY_TYPE_LABEL, PERIOD_STATUS_LABEL, PERIOD_STATUS_TONE, WORK_TYPES } from '../lib/labels';
import { Badge, Button, Field, Input, Select } from './ui';
import { IconPlus, IconTimesheetList } from './icons';

interface PeriodSummary {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  workType: string;
  payType: string;
  createdAt: string;
  createdBy: { fullName: string };
  task: { id: string; wellName: string } | null;
  _count: { timesheets: number };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ru-RU');
}

/**
 * Список табелей за период конкретной бригады + форма создания нового
 * ("+ Добавить табель" -> выбор дат -> "Сформировать табель", как
 * попросил владелец после ручного тестирования пилота). Переиспользуется
 * и в карточке бригады на странице участка (владелец/руководитель
 * участка), и на странице "Моя бригада" (бригадир) — оба места ведут в
 * один и тот же TimesheetPeriodDetail по клику на табель в списке.
 *
 * `bordered` (по умолчанию true) рисует верхнюю разделительную линию —
 * нужна, когда секция идёт следом за другим содержимым той же карточки
 * (карточка бригады на странице участка/"Моя бригада"). На странице
 * задания секция стоит в собственной карточке, поэтому там передаём
 * `bordered={false}`, чтобы не получить двойную рамку.
 */
export function TimesheetPeriodsSection({
  crewId,
  taskId,
  bordered = true,
}: {
  crewId: string;
  taskId?: string;
  bordered?: boolean;
}) {
  const navigate = useNavigate();
  const [periods, setPeriods] = useState<PeriodSummary[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [workType, setWorkType] = useState('drilling');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<PeriodSummary[]>(`/timesheet-periods?crewId=${crewId}`)
      .then((all) => setPeriods(taskId ? all.filter((p) => p.task?.id === taskId) : all))
      .catch(() => setPeriods([]));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [crewId, taskId]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await apiFetch('/timesheet-periods', {
        method: 'POST',
        body: JSON.stringify({ crewId, taskId, periodStart, periodEnd, workType }),
      });
      setAdding(false);
      setPeriodStart('');
      setPeriodEnd('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сформировать табель');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={bordered ? 'mt-3 border-t border-line pt-3' : ''}>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-xs font-medium uppercase tracking-wide text-ink-muted">Табели за период</h4>
        {!adding && (
          <Button size="sm" variant="ghost" onClick={() => setAdding(true)} className="!px-0">
            <IconPlus size={14} /> Добавить табель
          </Button>
        )}
      </div>

      {adding && (
        <form onSubmit={handleCreate} className="mb-3 space-y-2 rounded-md border border-line bg-surface-2 p-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="С какой даты">
              <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} required />
            </Field>
            <Field label="По какую дату">
              <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} required />
            </Field>
          </div>
          <Field label="Вид работ на весь период">
            <Select value={workType} onChange={(e) => setWorkType(e.target.value)}>
              {WORK_TYPES.map((w) => (
                <option key={w.value} value={w.value}>
                  {w.label}
                </option>
              ))}
            </Select>
          </Field>
          {error && <p className="text-xs text-crit">{error}</p>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? 'Формируем…' : 'Сформировать табель'}
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setAdding(false)}>
              Отмена
            </Button>
          </div>
        </form>
      )}

      {periods === null ? (
        <p className="text-xs text-ink-muted">Загрузка…</p>
      ) : periods.length === 0 ? (
        <p className="flex items-center gap-1.5 text-xs text-ink-muted">
          <IconTimesheetList size={13} /> Пока нет ни одного табеля за период.
        </p>
      ) : (
        <ul className="space-y-1">
          {periods.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => navigate(`/timesheet-periods/${p.id}`)}
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2.5 text-left text-sm transition-colors hover:bg-surface-2"
              >
                <IconTimesheetList size={15} className="shrink-0 text-ink-muted" />
                <span className="min-w-0 flex-1 text-ink">
                  {formatDate(p.periodStart)} – {formatDate(p.periodEnd)}
                  <span className="ml-2 text-xs text-ink-muted">
                    {PAY_TYPE_LABEL[p.payType] ?? p.payType}
                    {!taskId && p.task ? ` · ${p.task.wellName}` : ''} · создан {formatDate(p.createdAt)} · {p.createdBy.fullName}
                  </span>
                </span>
                <Badge tone={PERIOD_STATUS_TONE[p.status] ?? 'neutral'}>{PERIOD_STATUS_LABEL[p.status] ?? p.status}</Badge>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
