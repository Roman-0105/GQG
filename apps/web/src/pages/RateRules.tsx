import { FormEvent, useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { describeApiError } from '../lib/apiError';
import { PageHeader } from '../components/PageHeader';
import { Badge, Card, EmptyState, ErrorState, Field, Input, ListRow, Select, Button } from '../components/ui';
import { IconRateRules } from '../components/icons';

interface Site {
  id: string;
  name: string;
}

interface Position {
  id: string;
  name: string;
}

interface RateRule {
  id: string;
  name: string;
  priority: number;
  nightShiftPct: string;
  holidayPct: string;
  remoteBonusPct: string;
  perDiemAmount: string;
  perMeterBonus: string;
  site: { id: string; name: string } | null;
  position: { id: string; name: string } | null;
}

/**
 * Конструктор правил расчёта (docs/project-plan.md, раздел 4;
 * формулы — docs/payroll-formulas.md). Правило может быть общим для
 * компании (участок/должность не выбраны) или сузиться до конкретного
 * участка и/или должности; при пересечении побеждает правило с более
 * высоким приоритетом целиком — см. docs/adr/0004-payroll-engine.md.
 */
export function RateRules() {
  const [rules, setRules] = useState<RateRule[] | null>(null);
  const [listError, setListError] = useState<unknown>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [siteId, setSiteId] = useState('');
  const [positionId, setPositionId] = useState('');
  const [priority, setPriority] = useState(0);
  const [nightShiftPct, setNightShiftPct] = useState(0);
  const [holidayPct, setHolidayPct] = useState(0);
  const [remoteBonusPct, setRemoteBonusPct] = useState(0);
  const [perDiemAmount, setPerDiemAmount] = useState(0);
  const [perMeterBonus, setPerMeterBonus] = useState(0);

  function load() {
    setListError(null);
    apiFetch<RateRule[]>('/rate-rules').then(setRules).catch(setListError);
    apiFetch<Site[]>('/sites').then(setSites).catch(() => {});
    apiFetch<Position[]>('/positions').then(setPositions).catch(() => {});
  }

  useEffect(load, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await apiFetch('/rate-rules', {
        method: 'POST',
        body: JSON.stringify({
          name,
          siteId: siteId || undefined,
          positionId: positionId || undefined,
          priority: Number(priority),
          nightShiftPct: Number(nightShiftPct),
          holidayPct: Number(holidayPct),
          remoteBonusPct: Number(remoteBonusPct),
          perDiemAmount: Number(perDiemAmount),
          perMeterBonus: Number(perMeterBonus),
        }),
      });
      setName('');
      setSiteId('');
      setPositionId('');
      setPriority(0);
      setNightShiftPct(0);
      setHolidayPct(0);
      setRemoteBonusPct(0);
      setPerDiemAmount(0);
      setPerMeterBonus(0);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось добавить правило');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        crumbs={[{ label: 'Финансы' }]}
        title="Правила расчёта"
        description="Надбавки и суточные. При пересечении нескольких правил побеждает одно целиком — то, у которого выше приоритет."
      />

      <Card className="mb-6 overflow-hidden">
        {listError ? (
          <ErrorState {...describeApiError(listError)} onRetry={load} />
        ) : rules === null ? (
          <p className="p-5 text-sm text-ink-muted">Загрузка…</p>
        ) : rules.length === 0 ? (
          <EmptyState icon={IconRateRules} title="Пока нет ни одного правила" description="Добавьте первое формой ниже." />
        ) : (
          rules.map((r) => (
            <ListRow key={r.id}>
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-ink">{r.name}</span>
                <Badge>приоритет {r.priority}</Badge>
              </div>
              <div className="mt-1 text-xs text-ink-muted">
                {r.site ? r.site.name : 'вся компания'} · {r.position ? r.position.name : 'все должности'} · ночные +
                {Number(r.nightShiftPct)}% · праздничные +{Number(r.holidayPct)}% · вахта +{Number(r.remoteBonusPct)}% · суточные{' '}
                {Number(r.perDiemAmount)} ₽/день · метраж {Number(r.perMeterBonus)} ₽/м
              </div>
            </ListRow>
          ))
        )}
      </Card>

      <Card className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <h2 className="text-sm font-medium text-ink">Новое правило</h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Название">
              <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Северная надбавка" />
            </Field>
            <Field label="Участок">
              <Select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
                <option value="">Вся компания</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Должность">
              <Select value={positionId} onChange={(e) => setPositionId(e.target.value)}>
                <option value="">Все должности</option>
                {positions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <Field label="Приоритет">
              <Input type="number" value={priority} onChange={(e) => setPriority(Number(e.target.value))} />
            </Field>
            <Field label="Ночные, %">
              <Input type="number" min={0} value={nightShiftPct} onChange={(e) => setNightShiftPct(Number(e.target.value))} />
            </Field>
            <Field label="Праздничные, %">
              <Input type="number" min={0} value={holidayPct} onChange={(e) => setHolidayPct(Number(e.target.value))} />
            </Field>
            <Field label="Вахта, %">
              <Input type="number" min={0} value={remoteBonusPct} onChange={(e) => setRemoteBonusPct(Number(e.target.value))} />
            </Field>
            <Field label="Суточные, ₽/день">
              <Input type="number" min={0} value={perDiemAmount} onChange={(e) => setPerDiemAmount(Number(e.target.value))} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <Field label="Метраж, ₽/м">
              <Input type="number" min={0} value={perMeterBonus} onChange={(e) => setPerMeterBonus(Number(e.target.value))} />
            </Field>
          </div>

          {error && <p className="text-sm text-crit">{error}</p>}

          <Button type="submit" disabled={saving}>
            {saving ? 'Добавляем…' : 'Добавить правило'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
