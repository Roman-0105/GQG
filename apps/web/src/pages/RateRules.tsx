import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';

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
  const [rules, setRules] = useState<RateRule[]>([]);
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
    apiFetch<RateRule[]>('/rate-rules').then(setRules).catch((err) => setError(err instanceof Error ? err.message : 'Не удалось загрузить правила'));
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
    <div className="min-h-screen bg-bg p-8">
      <div className="max-w-3xl mx-auto">
        <Link to="/dashboard" className="text-sm text-accent-2 mb-4 inline-block">← Панель</Link>
        <h1 className="text-2xl font-semibold text-ink mb-1">Правила расчёта</h1>
        <p className="text-sm text-ink-muted mb-6">
          Надбавки и суточные. При пересечении нескольких правил побеждает одно целиком — то, у которого выше приоритет.
        </p>

        <div className="bg-surface border border-line rounded-lg overflow-hidden mb-6">
          {rules.length === 0 && <p className="p-5 text-sm text-ink-muted">Пока нет ни одного правила.</p>}
          {rules.map((r) => (
            <div key={r.id} className="px-5 py-3 border-b border-line last:border-b-0">
              <div className="flex items-center justify-between">
                <span className="text-ink font-medium">{r.name}</span>
                <span className="text-xs font-mono text-ink-muted">приоритет {r.priority}</span>
              </div>
              <div className="text-xs text-ink-muted mt-1">
                {r.site ? r.site.name : 'вся компания'} · {r.position ? r.position.name : 'все должности'} ·
                {' '}ночные +{Number(r.nightShiftPct)}% · праздничные +{Number(r.holidayPct)}% · вахта +{Number(r.remoteBonusPct)}% ·
                {' '}суточные {Number(r.perDiemAmount)} ₽/день · метраж {Number(r.perMeterBonus)} ₽/м
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="bg-surface border border-line rounded-lg p-6 space-y-4">
          <h2 className="text-sm font-medium text-ink">Новое правило</h2>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs uppercase tracking-wide text-ink-muted mb-1">Название</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Северная надбавка" className="w-full px-3 py-2 rounded border border-line bg-surface-2 text-ink" />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wide text-ink-muted mb-1">Участок</label>
              <select value={siteId} onChange={(e) => setSiteId(e.target.value)} className="w-full px-3 py-2 rounded border border-line bg-surface-2 text-ink">
                <option value="">Вся компания</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wide text-ink-muted mb-1">Должность</label>
              <select value={positionId} onChange={(e) => setPositionId(e.target.value)} className="w-full px-3 py-2 rounded border border-line bg-surface-2 text-ink">
                <option value="">Все должности</option>
                {positions.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-5 gap-4">
            <div>
              <label className="block text-xs uppercase tracking-wide text-ink-muted mb-1">Приоритет</label>
              <input type="number" value={priority} onChange={(e) => setPriority(Number(e.target.value))} className="w-full px-3 py-2 rounded border border-line bg-surface-2 text-ink" />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wide text-ink-muted mb-1">Ночные, %</label>
              <input type="number" min={0} value={nightShiftPct} onChange={(e) => setNightShiftPct(Number(e.target.value))} className="w-full px-3 py-2 rounded border border-line bg-surface-2 text-ink" />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wide text-ink-muted mb-1">Праздничные, %</label>
              <input type="number" min={0} value={holidayPct} onChange={(e) => setHolidayPct(Number(e.target.value))} className="w-full px-3 py-2 rounded border border-line bg-surface-2 text-ink" />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wide text-ink-muted mb-1">Вахта, %</label>
              <input type="number" min={0} value={remoteBonusPct} onChange={(e) => setRemoteBonusPct(Number(e.target.value))} className="w-full px-3 py-2 rounded border border-line bg-surface-2 text-ink" />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wide text-ink-muted mb-1">Суточные, ₽/день</label>
              <input type="number" min={0} value={perDiemAmount} onChange={(e) => setPerDiemAmount(Number(e.target.value))} className="w-full px-3 py-2 rounded border border-line bg-surface-2 text-ink" />
            </div>
          </div>

          <div className="grid grid-cols-5 gap-4">
            <div>
              <label className="block text-xs uppercase tracking-wide text-ink-muted mb-1">Метраж, ₽/м</label>
              <input type="number" min={0} value={perMeterBonus} onChange={(e) => setPerMeterBonus(Number(e.target.value))} className="w-full px-3 py-2 rounded border border-line bg-surface-2 text-ink" />
            </div>
          </div>

          {error && <p className="text-sm text-crit">{error}</p>}

          <button type="submit" disabled={saving} className="py-2 px-5 rounded bg-accent text-white font-medium disabled:opacity-60">
            {saving ? 'Добавляем…' : 'Добавить правило'}
          </button>
        </form>
      </div>
    </div>
  );
}
