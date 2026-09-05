import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';

type Grain = 'day' | 'week' | 'month' | 'quarter' | 'year';
type Preset = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'custom';

interface Site {
  id: string;
  name: string;
}

interface Totals {
  regularHours: string;
  overtimeHours: string;
  nightHours: string;
  metersDrilled: string;
  laborCost: string;
  costPerMeter: string | null;
  timesheetCount: number;
}

interface TimeseriesRow extends Totals {
  bucket: string;
}

interface BudgetRow {
  siteId: string;
  siteName: string;
  siteCode: string;
  budget: string | null;
  actualCost: string;
  hoursTotal: string;
  budgetUsedPct: string | null;
}

const PRESET_LABEL: Record<Preset, string> = {
  day: 'День',
  week: 'Неделя',
  month: 'Месяц',
  quarter: 'Квартал',
  year: 'Год',
  custom: 'Свой период',
};

const GRAIN_LABEL: Record<Grain, string> = {
  day: 'по дням',
  week: 'по неделям',
  month: 'по месяцам',
  quarter: 'по кварталам',
  year: 'по годам',
};

// Даты-границы периода строятся из локальных Y/M/D (setHours(0,0,0,0) и
// т.п.) — d.toISOString() конвертирует в UTC и на восточных часовых
// поясах (UTC+3 и восточнее) сдвигает "1 сентября 00:00 местного" на
// "31 августа" в UTC. Берём локальные компоненты напрямую, без конвертации.
function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function startOfWeekMonday(d: Date): Date {
  const r = startOfDay(d);
  const day = (r.getDay() + 6) % 7;
  r.setDate(r.getDate() - day);
  return r;
}

function computeRange(preset: Preset): { from: Date; to: Date; grain: Grain } {
  const now = new Date();
  switch (preset) {
    case 'day':
      return { from: startOfDay(now), to: new Date(startOfDay(now).getTime() + 86400000), grain: 'day' };
    case 'week': {
      const from = startOfWeekMonday(now);
      return { from, to: new Date(from.getTime() + 7 * 86400000), grain: 'day' };
    }
    case 'month': {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      const to = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      return { from, to, grain: 'day' };
    }
    case 'quarter': {
      const q = Math.floor(now.getMonth() / 3);
      const from = new Date(now.getFullYear(), q * 3, 1);
      const to = new Date(now.getFullYear(), q * 3 + 3, 1);
      return { from, to, grain: 'week' };
    }
    case 'year': {
      const from = new Date(now.getFullYear(), 0, 1);
      const to = new Date(now.getFullYear() + 1, 0, 1);
      return { from, to, grain: 'month' };
    }
    case 'custom': {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from, to: now, grain: 'day' };
    }
  }
}

function ruble(v: string): string {
  return Number(v).toLocaleString('ru-RU', { maximumFractionDigits: 0 });
}

const BUCKET_LABEL_RE = /^(\d{4})-Q(\d)$/;

function formatBucket(bucket: string, grain: Grain): string {
  if (grain === 'day' || grain === 'week') {
    const d = new Date(bucket);
    const label = d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
    return grain === 'week' ? `нед. с ${label}` : label;
  }
  if (grain === 'month') {
    const [y, m] = bucket.split('-');
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' });
  }
  const q = BUCKET_LABEL_RE.exec(bucket);
  if (q) return `${q[1]} Q${q[2]}`;
  return bucket;
}

/**
 * Аналитика (docs/project-plan.md, раздел 5): день/неделя/месяц/квартал/
 * год + произвольный период, разрез по участку, часы/ФОТ/₽ за метр,
 * бюджет участка план vs факт. Цифры считаются той же формулой, что и
 * реальный расчёт ЗП (apps/api/src/common/payroll/rate-rule.util.ts),
 * поэтому не расходятся с "Расчётом зарплаты".
 *
 * Явка/отсутствия и алерты о незаполненных табелях — в этой версии не
 * реализованы: требуют модели графика смен, которой пока нет (бэклог).
 */
export function Analytics() {
  const [preset, setPreset] = useState<Preset>('month');
  const [grain, setGrain] = useState<Grain>('day');
  const [from, setFrom] = useState<Date>(() => computeRange('month').from);
  const [to, setTo] = useState<Date>(() => computeRange('month').to);
  const [siteId, setSiteId] = useState('');
  const [sites, setSites] = useState<Site[]>([]);

  const [totals, setTotals] = useState<Totals | null>(null);
  const [series, setSeries] = useState<TimeseriesRow[]>([]);
  const [budget, setBudget] = useState<BudgetRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Site[]>('/sites').then(setSites).catch(() => {});
  }, []);

  function applyPreset(p: Preset) {
    setPreset(p);
    const r = computeRange(p);
    setFrom(r.from);
    setTo(r.to);
    setGrain(r.grain);
  }

  const query = useMemo(() => {
    // Дата-только (toISODate), не from.toISOString() — иначе граница
    // периода на бэкенде оказывается сдвинута на день часовым поясом.
    const params = new URLSearchParams({ from: toISODate(from), to: toISODate(to) });
    if (siteId) params.set('siteId', siteId);
    return params;
  }, [from, to, siteId]);

  function load() {
    setError(null);
    const seriesParams = new URLSearchParams(query);
    seriesParams.set('grain', grain);
    Promise.all([
      apiFetch<Totals>(`/analytics/totals?${query}`),
      apiFetch<TimeseriesRow[]>(`/analytics/timeseries?${seriesParams}`),
      apiFetch<BudgetRow[]>(`/analytics/budget?${query}`),
    ])
      .then(([t, s, b]) => {
        setTotals(t);
        setSeries(s);
        setBudget(b);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Не удалось загрузить аналитику'));
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [query, grain]);

  const maxCost = Math.max(1, ...series.map((s) => Number(s.laborCost)));

  return (
    <div className="min-h-screen bg-bg p-8">
      <div className="max-w-4xl mx-auto">
        <Link to="/dashboard" className="text-sm text-accent-2 mb-4 inline-block">← Панель</Link>
        <h1 className="text-2xl font-semibold text-ink mb-1">Аналитика</h1>
        <p className="text-sm text-ink-muted mb-6">
          Только подтверждённые часы (согласовано/заблокировано) — черновики бригадиров в цифры не входят.
        </p>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          {(Object.keys(PRESET_LABEL) as Preset[]).map((p) => (
            <button
              key={p}
              onClick={() => applyPreset(p)}
              className={`px-3 py-1.5 rounded-full text-sm ${preset === p ? 'bg-accent text-white' : 'bg-surface-2 text-ink-muted'}`}
            >
              {PRESET_LABEL[p]}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-6 bg-surface border border-line rounded-lg p-4">
          {preset === 'custom' && (
            <>
              <input type="date" value={toISODate(from)} onChange={(e) => setFrom(new Date(e.target.value))} className="px-3 py-1.5 rounded border border-line bg-surface-2 text-ink text-sm" />
              <span className="text-ink-muted text-sm">—</span>
              <input type="date" value={toISODate(to)} onChange={(e) => setTo(new Date(e.target.value))} className="px-3 py-1.5 rounded border border-line bg-surface-2 text-ink text-sm" />
            </>
          )}
          <select value={grain} onChange={(e) => setGrain(e.target.value as Grain)} className="px-3 py-1.5 rounded border border-line bg-surface-2 text-ink text-sm">
            {(Object.keys(GRAIN_LABEL) as Grain[]).map((g) => (
              <option key={g} value={g}>{GRAIN_LABEL[g]}</option>
            ))}
          </select>
          <select value={siteId} onChange={(e) => setSiteId(e.target.value)} className="px-3 py-1.5 rounded border border-line bg-surface-2 text-ink text-sm">
            <option value="">Все участки</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <span className="text-xs text-ink-muted ml-auto">
            {toISODate(from)} — {toISODate(to)}
          </span>
        </div>

        {error && <p className="text-crit mb-4">{error}</p>}

        {totals && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="bg-surface border border-line rounded-lg p-4">
              <div className="text-xs uppercase tracking-wide text-ink-muted mb-1">Часы</div>
              <div className="text-xl font-mono text-ink">{Number(totals.regularHours) + Number(totals.overtimeHours)}</div>
              <div className="text-xs text-ink-muted">из них {Number(totals.overtimeHours)} сверхурочных</div>
            </div>
            <div className="bg-surface border border-line rounded-lg p-4">
              <div className="text-xs uppercase tracking-wide text-ink-muted mb-1">ФОТ</div>
              <div className="text-xl font-mono text-ink">{ruble(totals.laborCost)} ₽</div>
            </div>
            <div className="bg-surface border border-line rounded-lg p-4">
              <div className="text-xs uppercase tracking-wide text-ink-muted mb-1">Метраж</div>
              <div className="text-xl font-mono text-ink">{Number(totals.metersDrilled)} м</div>
            </div>
            <div className="bg-surface border border-line rounded-lg p-4">
              <div className="text-xs uppercase tracking-wide text-ink-muted mb-1">₽ за метр</div>
              <div className="text-xl font-mono text-ink">{totals.costPerMeter ? ruble(totals.costPerMeter) : '—'}</div>
            </div>
          </div>
        )}

        <h2 className="text-lg font-medium text-ink mb-3">ФОТ по периодам</h2>
        <div className="bg-surface border border-line rounded-lg p-4 mb-6">
          {series.length === 0 && <p className="text-sm text-ink-muted">Нет подтверждённых часов за выбранный период.</p>}
          <div className="space-y-2">
            {series.map((row) => (
              <div key={row.bucket} className="flex items-center gap-3">
                <span className="text-xs text-ink-muted w-16 shrink-0">{formatBucket(row.bucket, grain)}</span>
                <div className="flex-1 bg-surface-2 rounded h-5 overflow-hidden">
                  <div className="bg-accent h-full rounded" style={{ width: `${(Number(row.laborCost) / maxCost) * 100}%` }} />
                </div>
                <span className="text-xs font-mono text-ink w-20 text-right">{ruble(row.laborCost)} ₽</span>
              </div>
            ))}
          </div>
        </div>

        <h2 className="text-lg font-medium text-ink mb-3">Бюджет участков: план vs факт</h2>
        <div className="bg-surface border border-line rounded-lg overflow-hidden">
          {budget.length === 0 && <p className="p-5 text-sm text-ink-muted">Нет участков в области видимости.</p>}
          {budget.map((b) => (
            <div key={b.siteId} className="px-5 py-3 border-b border-line last:border-b-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-ink font-medium">{b.siteName}</span>
                <span className="text-xs font-mono text-ink-muted">{b.siteCode}</span>
              </div>
              {b.budget ? (
                <>
                  <div className="bg-surface-2 rounded h-2 overflow-hidden mb-1">
                    <div
                      className={`h-full ${Number(b.budgetUsedPct) > 100 ? 'bg-crit' : 'bg-good'}`}
                      style={{ width: `${Math.min(100, Number(b.budgetUsedPct))}%` }}
                    />
                  </div>
                  <div className="text-xs text-ink-muted">
                    {ruble(b.actualCost)} ₽ из {ruble(b.budget)} ₽ ({b.budgetUsedPct}%) · {Number(b.hoursTotal)} ч
                  </div>
                </>
              ) : (
                <div className="text-xs text-warn">Бюджет участка не задан · факт {ruble(b.actualCost)} ₽ · {Number(b.hoursTotal)} ч</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
