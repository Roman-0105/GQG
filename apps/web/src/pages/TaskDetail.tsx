import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { describeApiError } from '../lib/apiError';
import { PageHeader } from '../components/PageHeader';
import { Badge, Button, Card, EmptyState, ErrorState, ProgressBar, SegmentedControl } from '../components/ui';
import { IconAnalytics, IconChevronLeft, IconTeam, IconUser } from '../components/icons';
import { TimesheetPeriodsSection } from '../components/TimesheetPeriodsSection';
import { WellboreProgress } from '../components/WellboreProgress';
import { DrillingProgressChart, DrillingProgressDay } from '../components/DrillingProgressChart';

interface Position {
  id: string;
  name: string;
}

interface Member {
  id: string;
  fullName: string;
  position: Position;
}

interface ShiftAssignment {
  employeeId: string;
  shift: string;
}

interface Task {
  id: string;
  wellName: string;
  projectedDepth: string;
  dailyPlan: string;
  mountDismountPlanHours: string;
  hasNightShift: boolean;
  site: { id: string; name: string };
  crew: { id: string; name: string; members: Member[] };
  shiftAssignments: ShiftAssignment[];
}

type Shift = 'day' | 'night';
type ShiftMap = Record<string, Shift>;

interface Progress {
  projectedDepth: number;
  dailyPlan: number;
  totalPlanDays: number;
  totalActual: number;
  elapsedDays: number;
  planToDate: number;
  paceVsPlanPercent: number | null;
  days: DrillingProgressDay[];
}

const SHIFT_OPTIONS: { value: Shift; label: string }[] = [
  { value: 'day', label: 'День' },
  { value: 'night', label: 'Ночь' },
];

function pluralMembers(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'человек';
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return 'человека';
  return 'человек';
}

/**
 * Карточка задания у бригадира: план по скважине + распределение своей
 * бригады по сменам (если в задании есть ночная смена — см.
 * TasksSection.tsx на стороне начальника участка). Отсюда же
 * формируется табель за период — участок/бригада/задание в нём уже
 * подставлены (см. TimesheetPeriodsSection taskId).
 *
 * Раскладка экрана — по важности: сверху "статус" (пройдено/темп —
 * можно ли за один взгляд понять, укладывается ли бригада в график),
 * затем план/факт по дням, состав бригады, и в самом низу — табели
 * (наименее часто нужное на этом экране действие).
 */
export function TaskDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [task, setTask] = useState<Task | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [shifts, setShifts] = useState<ShiftMap>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    if (!id) return;
    setLoadError(null);
    apiFetch<Task>(`/tasks/${id}`)
      .then((t) => {
        setTask(t);
        const map: ShiftMap = {};
        for (const a of t.shiftAssignments) map[a.employeeId] = a.shift as Shift;
        setShifts(map);
      })
      .catch(setLoadError);
    apiFetch<Progress>(`/tasks/${id}/progress`)
      .then(setProgress)
      .catch(() => setProgress(null));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [id]);

  async function handleSaveShifts() {
    if (!id || !task) return;
    setError(null);
    setSaving(true);
    setSaved(false);
    try {
      await apiFetch(`/tasks/${id}/shift-assignments`, {
        method: 'POST',
        body: JSON.stringify({
          assignments: task.crew.members.map((m) => ({ employeeId: m.id, shift: shifts[m.id] ?? 'day' })),
        }),
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить распределение');
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <div>
        <PageHeader crumbs={[{ label: 'Полевая работа' }]} title="Задание" />
        <ErrorState {...describeApiError(loadError)} onRetry={load} />
      </div>
    );
  }

  if (!task) {
    return <p className="text-sm text-ink-muted">Загрузка…</p>;
  }

  const projectedDepth = Number(task.projectedDepth);
  const pctActual = progress && projectedDepth > 0 ? Math.min(100, (progress.totalActual / projectedDepth) * 100) : 0;
  const pctPlanToDate =
    progress && progress.paceVsPlanPercent != null && projectedDepth > 0
      ? Math.min(100, (progress.planToDate / projectedDepth) * 100)
      : undefined;
  const paceGood = progress?.paceVsPlanPercent != null && progress.paceVsPlanPercent >= 100;

  return (
    <div className="max-w-5xl">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-3 flex items-center gap-1 text-sm text-ink-muted transition-colors hover:text-ink"
      >
        <IconChevronLeft size={16} /> Назад
      </button>
      <PageHeader
        crumbs={[{ label: 'Полевая работа' }, { label: 'Задания', to: '/tasks' }]}
        title={task.wellName}
        description={`${task.site.name} · ${task.crew.name}`}
        action={task.hasNightShift ? <Badge tone="warn">с ночной сменой</Badge> : undefined}
      />

      {/* Статус задания: пройдено/темп — главное, что нужно увидеть с первого взгляда;
          справа — иллюстративная схема ствола с тем же прогрессом. */}
      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_auto]">
        <Card className="p-5 sm:p-6">
          {progress ? (
            <div>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-x-8">
                <div>
                  <div className="text-xs uppercase tracking-wide text-ink-muted">Пройдено</div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="font-mono text-3xl font-semibold text-ink">{progress.totalActual}</span>
                    <span className="text-sm text-ink-muted">
                      из {progress.projectedDepth} м · {Math.round(pctActual)}%
                    </span>
                  </div>
                </div>
                {progress.paceVsPlanPercent != null && (
                  <div className="sm:text-right">
                    {/* Темп по накопительному плану/факту, не по последнему дню — см. TasksService.progress */}
                    <div className="text-xs uppercase tracking-wide text-ink-muted">Темп за {progress.elapsedDays} дн.</div>
                    <div className="mt-1 flex items-center gap-2 sm:justify-end">
                      <span className={`font-mono text-2xl font-semibold ${paceGood ? 'text-good' : 'text-crit'}`}>
                        {progress.paceVsPlanPercent}%
                      </span>
                      <Badge tone={paceGood ? 'good' : 'crit'}>{paceGood ? 'по графику' : 'отстаёт'}</Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {progress.totalActual} из {progress.planToDate} м по плану на сегодня
                    </p>
                  </div>
                )}
              </div>

              <ProgressBar
                className="mt-4"
                value={pctActual}
                tone={progress.paceVsPlanPercent == null ? 'accent' : paceGood ? 'good' : 'crit'}
                marker={pctPlanToDate}
                markerLabel={progress.paceVsPlanPercent != null ? `План на сегодня: ${progress.planToDate} м` : undefined}
              />
              <div className="mt-1.5 flex items-center justify-between text-[11px] text-ink-muted">
                <span>0 м</span>
                <span>{progress.projectedDepth} м проектных</span>
              </div>
              {pctPlanToDate != null && (
                <p className="mt-1 text-[11px] text-ink-muted">
                  Вертикальная отметка на шкале — плановая глубина на сегодня, {progress.planToDate} м.
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-ink-muted">
              Пока нет данных о проходке — появятся после первого дня в табеле за метраж.
            </p>
          )}

          <div className="mt-5 grid grid-cols-3 gap-4 border-t border-line pt-4">
            <div>
              <div className="text-xs uppercase tracking-wide text-ink-muted">Проектная глубина</div>
              <div className="mt-0.5 font-mono text-base text-ink">{projectedDepth} м</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-ink-muted">Суточный план</div>
              <div className="mt-0.5 font-mono text-base text-ink">{Number(task.dailyPlan)} м</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-ink-muted">Монтаж/демонтаж</div>
              <div className="mt-0.5 font-mono text-base text-ink">{Number(task.mountDismountPlanHours)} ч</div>
            </div>
          </div>
        </Card>

        <Card className="flex shrink-0 items-center justify-center p-4 lg:w-[210px]">
          <WellboreProgress projectedDepth={projectedDepth} days={progress?.days ?? []} />
        </Card>
      </div>

      <Card className="mb-4 p-5 sm:p-6">
        <h3 className="mb-1 text-sm font-medium text-ink">План/факт бурения по дням</h3>
        <p className="mb-4 text-xs text-ink-muted">
          План — {Number(task.dailyPlan)} м/сутки, {progress?.totalPlanDays ?? '—'} дней до проектной глубины. Факт — из
          табеля за метраж.
        </p>
        {!progress || progress.days.length === 0 ? (
          <EmptyState
            icon={IconAnalytics}
            title="Пока нет данных для графика"
            description="Появится после того, как в табеле за метраж будет внесён хотя бы один день."
          />
        ) : (
          <DrillingProgressChart days={progress.days} />
        )}
      </Card>

      <Card className="mb-4 p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-medium text-ink">
            {task.hasNightShift ? 'Распределение бригады по сменам' : 'Состав бригады'}
          </h3>
          {task.crew.members.length > 0 && (
            <span className="text-xs text-ink-muted">
              {task.crew.members.length} {pluralMembers(task.crew.members.length)}
            </span>
          )}
        </div>

        {task.crew.members.length === 0 ? (
          <EmptyState icon={IconTeam} title="В бригаде пока нет сотрудников" />
        ) : task.hasNightShift ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              {SHIFT_OPTIONS.map((opt) => {
                const members = task.crew.members.filter((m) => (shifts[m.id] ?? 'day') === opt.value);
                return (
                  <div key={opt.value} className="rounded-lg border border-line bg-surface-2/40 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                        {opt.value === 'day' ? 'Дневная смена' : 'Ночная смена'}
                      </h4>
                      <Badge tone="neutral">{members.length}</Badge>
                    </div>
                    {members.length === 0 ? (
                      <p className="px-1 py-2 text-xs text-ink-muted">Никто не назначен</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {members.map((m) => (
                          <li
                            key={m.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface px-2.5 py-2"
                          >
                            <span className="min-w-0 text-sm text-ink">
                              {m.fullName} <span className="text-xs text-ink-muted">· {m.position.name}</span>
                            </span>
                            <SegmentedControl
                              value={shifts[m.id] ?? 'day'}
                              onChange={(v) => setShifts({ ...shifts, [m.id]: v })}
                              options={SHIFT_OPTIONS}
                            />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex items-center gap-3">
              <Button size="sm" onClick={handleSaveShifts} disabled={saving}>
                {saving ? 'Сохраняем…' : 'Сохранить распределение'}
              </Button>
              {saved && <span className="text-xs text-good">Сохранено</span>}
              {error && <span className="text-xs text-crit">{error}</span>}
            </div>
          </>
        ) : (
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {task.crew.members.map((m) => (
              <li key={m.id} className="flex items-center gap-2.5 rounded-md bg-surface-2/40 px-3 py-2.5">
                <IconUser size={15} className="shrink-0 text-ink-muted" />
                <span className="min-w-0 truncate text-sm text-ink">
                  {m.fullName} <span className="text-xs text-ink-muted">· {m.position.name}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-5 sm:p-6">
        <TimesheetPeriodsSection crewId={task.crew.id} taskId={task.id} bordered={false} />
      </Card>
    </div>
  );
}
