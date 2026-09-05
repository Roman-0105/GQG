import { FormEvent, useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { describeApiError } from '../lib/apiError';
import { PageHeader } from '../components/PageHeader';
import { Badge, Button, Card, Checkbox, EmptyState, ErrorState, Field, Input, ListRow } from '../components/ui';
import { IconPosition } from '../components/icons';

interface Position {
  id: string;
  name: string;
  baseHourlyRate: string;
  overtimeMultiplier: string;
  hazardPay: boolean;
}

/**
 * Справочник должностей — без него нельзя завести сотрудника (у каждого
 * должна быть базовая ставка, docs/project-plan.md, раздел 4).
 */
export function Positions() {
  const [positions, setPositions] = useState<Position[] | null>(null);
  const [listError, setListError] = useState<unknown>(null);
  const [name, setName] = useState('');
  const [rate, setRate] = useState(400);
  const [hazardPay, setHazardPay] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function load() {
    setListError(null);
    apiFetch<Position[]>('/positions').then(setPositions).catch(setListError);
  }

  useEffect(load, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await apiFetch('/positions', {
        method: 'POST',
        body: JSON.stringify({ name, baseHourlyRate: Number(rate), hazardPay }),
      });
      setName('');
      setHazardPay(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось добавить должность');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <PageHeader title="Должности и ставки" description="Базовая почасовая ставка и множитель сверхурочных по должности." />

      <Card className="mb-6 overflow-hidden">
        {listError ? (
          <ErrorState {...describeApiError(listError)} onRetry={load} />
        ) : positions === null ? (
          <p className="p-5 text-sm text-ink-muted">Загрузка…</p>
        ) : positions.length === 0 ? (
          <EmptyState icon={IconPosition} title="Пока нет ни одной должности" description="Добавьте первую формой ниже." />
        ) : (
          positions.map((p) => (
            <ListRow key={p.id} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="font-medium text-ink">{p.name}</span>
                {p.hazardPay && <Badge tone="warn">вредность</Badge>}
              </div>
              <span className="text-sm text-ink-muted">
                {Number(p.baseHourlyRate).toFixed(0)} ₽/ч · ×{Number(p.overtimeMultiplier)} сверхурочные
              </span>
            </ListRow>
          ))
        )}
      </Card>

      <Card className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <h2 className="text-sm font-medium text-ink">Добавить должность</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Название">
              <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Бурильщик" />
            </Field>
            <Field label="Ставка, ₽/ч">
              <Input type="number" min={0} value={rate} onChange={(e) => setRate(Number(e.target.value))} />
            </Field>
          </div>
          <Checkbox checked={hazardPay} onChange={setHazardPay} label="Вредные/опасные условия" />
          {error && <p className="text-sm text-crit">{error}</p>}
          <Button type="submit" disabled={saving}>
            {saving ? 'Добавляем…' : 'Добавить'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
