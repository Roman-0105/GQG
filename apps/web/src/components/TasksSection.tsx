import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { Button, Card, Checkbox, Field, Input, ListRow, Select } from './ui';
import { IconPlus, IconTimesheetNew } from './icons';

interface Foreman {
  id: string;
  fullName: string;
}

interface TaskSummary {
  id: string;
  wellName: string;
  projectedDepth: string;
  dailyPlan: string;
  mountDismountPlanHours: string;
  hasNightShift: boolean;
  crew: { id: string; name: string };
  foreman: { id: string; fullName: string };
}

/**
 * Задания участка ("бурение скважины" и т.п.) — по требованию владельца:
 * участок подставляется автоматически (это и есть контекст страницы),
 * бригадир выбирается напрямую (не бригада) — бригада определяется на
 * бэкенде как та, где выбранный человек назначен foremanId именно на
 * этом участке (см. TasksService.create). После создания карточка
 * задания появляется у бригадира во вкладке «Задания» (MyTasks.tsx).
 */
export function TasksSection({ siteId, siteName, foremen }: { siteId: string; siteName: string; foremen: Foreman[] }) {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<TaskSummary[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [wellName, setWellName] = useState('');
  const [projectedDepth, setProjectedDepth] = useState('');
  const [dailyPlan, setDailyPlan] = useState('');
  const [mountDismountPlanHours, setMountDismountPlanHours] = useState('');
  const [foremanId, setForemanId] = useState('');
  const [hasNightShift, setHasNightShift] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function load() {
    apiFetch<TaskSummary[]>(`/tasks?siteId=${siteId}`)
      .then(setTasks)
      .catch(() => setTasks([]));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [siteId]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await apiFetch('/tasks', {
        method: 'POST',
        body: JSON.stringify({
          siteId,
          foremanId,
          wellName,
          projectedDepth: Number(projectedDepth),
          dailyPlan: Number(dailyPlan),
          mountDismountPlanHours: Number(mountDismountPlanHours),
          hasNightShift,
        }),
      });
      setWellName('');
      setProjectedDepth('');
      setDailyPlan('');
      setMountDismountPlanHours('');
      setForemanId('');
      setHasNightShift(false);
      setAdding(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось создать задание');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-6">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-medium text-ink">Задания</h2>
        {!adding && (
          <Button size="sm" variant="secondary" onClick={() => setAdding(true)} disabled={foremen.length === 0}>
            <IconPlus size={15} /> Создать задание
          </Button>
        )}
      </div>

      {foremen.length === 0 && !adding && (
        <p className="mb-3 text-xs text-warn">
          Нет ни одной бригады с назначенным бригадиром на этом участке — назначьте бригадира в карточке бригады выше,
          прежде чем создавать задание.
        </p>
      )}

      {adding && (
        <Card className="mb-4 p-5">
          <form onSubmit={handleCreate} className="space-y-3">
            <Field label="Участок">
              <Input value={siteName} disabled />
            </Field>
            <Field label="Название скважины">
              <Input value={wellName} onChange={(e) => setWellName(e.target.value)} required />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Проектная глубина, п.м.">
                <Input type="number" min={0} step={0.1} value={projectedDepth} onChange={(e) => setProjectedDepth(e.target.value)} required />
              </Field>
              <Field label="Суточный план бурения, м">
                <Input type="number" min={0} step={0.1} value={dailyPlan} onChange={(e) => setDailyPlan(e.target.value)} required />
              </Field>
            </div>
            <Field label="План на монтажные/демонтажные работы, ч">
              <Input type="number" min={0} step={0.5} value={mountDismountPlanHours} onChange={(e) => setMountDismountPlanHours(e.target.value)} required />
            </Field>
            <Field label="Бригадир">
              <Select value={foremanId} onChange={(e) => setForemanId(e.target.value)} required>
                <option value="">Выберите бригадира</option>
                {foremen.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.fullName}
                  </option>
                ))}
              </Select>
            </Field>
            <Checkbox checked={hasNightShift} onChange={setHasNightShift} label="Ночная смена" />
            {error && <p className="text-xs text-crit">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={saving || !foremanId}>
                {saving ? 'Создаём…' : 'Создать задание'}
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => setAdding(false)}>
                Отмена
              </Button>
            </div>
          </form>
        </Card>
      )}

      {tasks !== null && tasks.length > 0 && (
        <Card className="overflow-hidden">
          {tasks.map((t) => (
            <ListRow key={t.id} className="transition-colors hover:bg-surface-2">
              <button type="button" onClick={() => navigate(`/tasks/${t.id}`)} className="flex w-full min-w-0 items-center gap-2 text-left">
                <IconTimesheetNew size={15} className="shrink-0 text-ink-muted" />
                <div className="min-w-0">
                  <span className="font-medium text-ink">{t.wellName}</span>
                  <span className="ml-2 text-xs text-ink-muted">
                    {t.crew.name} · Бригадир: {t.foreman.fullName} · план {Number(t.dailyPlan)} м/сут
                    {t.hasNightShift ? ' · с ночной сменой' : ''}
                  </span>
                </div>
              </button>
            </ListRow>
          ))}
        </Card>
      )}
    </div>
  );
}
