import { FormEvent, useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { STATUS_LABEL, STATUS_TONE, WORK_TYPE_LABEL } from '../lib/labels';
import { describeApiError } from '../lib/apiError';
import { PageHeader } from '../components/PageHeader';
import { Badge, Button, Card, EmptyState, ErrorState, ListRow, SegmentedControl, Textarea } from '../components/ui';
import { IconApprovals, IconLock } from '../components/icons';

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
  rejectionReason: string | null;
}

/**
 * Согласование табелей руководителем участка (docs/project-plan.md,
 * раздел 4): submitted → approved/rejected → locked. Показывает все
 * табели в scope пользователя (own_sites/company), не только
 * ожидающие — иначе руководитель не увидел бы, что уже подтвердил и
 * готово к блокировке периода.
 */
export function Approvals() {
  const [timesheets, setTimesheets] = useState<ReviewTimesheet[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'submitted' | 'approved' | 'all'>('submitted');
  // Табель, для которого сейчас открыта форма причины возврата — id
  // раскрытой строки, не более одной одновременно.
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  function load() {
    setError(null);
    const query = filter === 'all' ? '' : `?status=${filter}`;
    apiFetch<ReviewTimesheet[]>(`/timesheets${query}`).then(setTimesheets).catch(setError);
  }

  useEffect(load, [filter]);

  async function act(id: string, action: 'approve' | 'lock') {
    setBusyId(id);
    setActionError(null);
    try {
      await apiFetch(`/timesheets/${id}/${action}`, { method: 'POST' });
      load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Не удалось выполнить действие');
    } finally {
      setBusyId(null);
    }
  }

  async function confirmReject(e: FormEvent, id: string) {
    e.preventDefault();
    setBusyId(id);
    setActionError(null);
    try {
      // Причина обязательна на бэкенде (RejectTimesheetDto) — иначе
      // бригадир получает отклонённый табель без единого слова
      // объяснения, что исправлять (docs/project-plan.md, раздел 4).
      await apiFetch(`/timesheets/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason: rejectReason }) });
      setRejectingId(null);
      setRejectReason('');
      load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Не удалось выполнить действие');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        crumbs={[{ label: 'Полевая работа' }]}
        title="Согласование табелей"
        action={
          <SegmentedControl
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'submitted', label: 'На согласовании' },
              { value: 'approved', label: 'Подтверждены' },
              { value: 'all', label: 'Все' },
            ]}
          />
        }
      />

      {actionError && <p className="mb-3 text-sm text-crit">{actionError}</p>}

      <Card className="overflow-hidden">
        {error ? (
          <ErrorState {...describeApiError(error)} onRetry={load} />
        ) : timesheets === null ? (
          <p className="p-5 text-sm text-ink-muted">Загрузка…</p>
        ) : timesheets.length === 0 ? (
          <EmptyState
            icon={IconApprovals}
            title="Нет табелей в этом фильтре"
            description={
              filter === 'submitted'
                ? 'Пока никто не отправил табель на согласование — здесь появятся смены сразу после отправки бригадиром.'
                : 'Попробуйте другой фильтр выше.'
            }
          />
        ) : (
          timesheets.map((t) => (
            <ListRow key={t.id}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="font-medium text-ink">{t.employee.fullName}</span>
                  <span className="ml-2 text-sm text-ink-muted">
                    {t.crew.name} · {t.site.name} · {new Date(t.workDate).toLocaleDateString('ru-RU')} ·{' '}
                    {WORK_TYPE_LABEL[t.workType] ?? t.workType}
                  </span>
                </div>
                <Badge tone={STATUS_TONE[t.status] ?? 'neutral'}>{STATUS_LABEL[t.status] ?? t.status}</Badge>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-xs text-ink-muted">
                  {Number(t.regularHours)} ч{Number(t.overtimeHours) > 0 && ` + ${Number(t.overtimeHours)} сверхурочных`}
                  {t.submittedBy && ` · внёс: ${t.submittedBy.fullName}`}
                </span>
                <div className="flex gap-2">
                  {t.status === 'submitted' && rejectingId !== t.id && (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => act(t.id, 'approve')} disabled={busyId === t.id}>
                        Подтвердить
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => {
                          setRejectingId(t.id);
                          setRejectReason('');
                        }}
                        disabled={busyId === t.id}
                      >
                        Вернуть
                      </Button>
                    </>
                  )}
                  {t.status === 'approved' && (
                    <Button size="sm" variant="secondary" onClick={() => act(t.id, 'lock')} disabled={busyId === t.id}>
                      <IconLock size={14} /> Заблокировать период
                    </Button>
                  )}
                </div>
              </div>
              {t.status === 'rejected' && t.rejectionReason && (
                <p className="mt-2 rounded-md bg-crit/10 p-2 text-xs text-crit">
                  Причина возврата: {t.rejectionReason}
                </p>
              )}
              {rejectingId === t.id && (
                <form onSubmit={(e) => confirmReject(e, t.id)} className="mt-3 space-y-2 rounded-md border border-line bg-surface-2 p-3">
                  <Textarea
                    autoFocus
                    placeholder="Что нужно исправить? Бригадир увидит этот текст."
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    required
                    rows={2}
                  />
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" variant="danger" disabled={busyId === t.id || !rejectReason.trim()}>
                      Вернуть с этим комментарием
                    </Button>
                    <Button type="button" size="sm" variant="secondary" onClick={() => setRejectingId(null)}>
                      Отмена
                    </Button>
                  </div>
                </form>
              )}
            </ListRow>
          ))
        )}
      </Card>
    </div>
  );
}
