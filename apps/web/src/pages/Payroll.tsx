import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';

interface Employee {
  id: string;
  fullName: string;
}

interface PayrollLine {
  id: string;
  employee: { fullName: string; position: { name: string } };
  baseAmount: string;
  overtimeAmount: string;
  nightAmount: string;
  holidayAmount: string;
  remoteBonusAmount: string;
  perDiemAmount: string;
  pieceRateAmount: string;
  deductions: string;
  advanceDeduction: string;
  netAmount: string;
}

interface PayrollRun {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  createdAt: string;
  lines: PayrollLine[];
}

interface AdvanceRow {
  employeeId: string;
  amount: number;
}

const COMPONENT_LABELS: { key: keyof PayrollLine; label: string }[] = [
  { key: 'baseAmount', label: 'База' },
  { key: 'overtimeAmount', label: 'Сверхурочные' },
  { key: 'nightAmount', label: 'Ночные' },
  { key: 'holidayAmount', label: 'Праздничные' },
  { key: 'remoteBonusAmount', label: 'Вахта' },
  { key: 'perDiemAmount', label: 'Суточные' },
  { key: 'pieceRateAmount', label: 'Метраж' },
  { key: 'deductions', label: 'Удержания', },
  { key: 'advanceDeduction', label: 'Аванс' },
];

function ruble(v: string): string {
  return Number(v).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Запуск расчёта зарплаты и просмотр разбивки (docs/project-plan.md,
 * раздел 4; формулы — docs/payroll-formulas.md). Каждая строка —
 * отдельная составляющая, а не единая сумма, — "чёрный ящик" без
 * объяснения не принимается.
 */
export function Payroll() {
  const [periodStart, setPeriodStart] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [periodEnd, setPeriodEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [advances, setAdvances] = useState<AdvanceRow[]>([]);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [current, setCurrent] = useState<PayrollRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  function loadRuns() {
    apiFetch<PayrollRun[]>('/payroll/runs').then(setRuns).catch(() => {});
  }

  useEffect(() => {
    apiFetch<Employee[]>('/employees').then(setEmployees).catch(() => {});
    loadRuns();
  }, []);

  function addAdvanceRow() {
    if (employees.length === 0) return;
    setAdvances([...advances, { employeeId: employees[0].id, amount: 0 }]);
  }

  function updateAdvance(index: number, patch: Partial<AdvanceRow>) {
    setAdvances(advances.map((a, i) => (i === index ? { ...a, ...patch } : a)));
  }

  function removeAdvance(index: number) {
    setAdvances(advances.filter((_, i) => i !== index));
  }

  async function handleRun(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setRunning(true);
    try {
      const run = await apiFetch<PayrollRun>('/payroll/runs', {
        method: 'POST',
        body: JSON.stringify({
          periodStart,
          periodEnd,
          advances: advances.filter((a) => a.amount > 0),
        }),
      });
      setCurrent(run);
      loadRuns();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось выполнить расчёт');
    } finally {
      setRunning(false);
    }
  }

  async function openRun(id: string) {
    try {
      const run = await apiFetch<PayrollRun>(`/payroll/runs/${id}`);
      setCurrent(run);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить расчёт');
    }
  }

  return (
    <div className="min-h-screen bg-bg p-8">
      <div className="max-w-4xl mx-auto">
        <Link to="/dashboard" className="text-sm text-accent-2 mb-4 inline-block">← Панель</Link>
        <h1 className="text-2xl font-semibold text-ink mb-1">Расчёт зарплаты</h1>
        <p className="text-sm text-ink-muted mb-6">
          Берутся только заблокированные табели за период. Формулы и правила — на странице{' '}
          <Link to="/rate-rules" className="underline">Правила расчёта</Link>.
        </p>

        <form onSubmit={handleRun} className="bg-surface border border-line rounded-lg p-6 space-y-4 mb-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs uppercase tracking-wide text-ink-muted mb-1">Начало периода</label>
              <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} required className="w-full px-3 py-2 rounded border border-line bg-surface-2 text-ink" />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wide text-ink-muted mb-1">Конец периода</label>
              <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} required className="w-full px-3 py-2 rounded border border-line bg-surface-2 text-ink" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs uppercase tracking-wide text-ink-muted">Авансы (необязательно)</label>
              <button type="button" onClick={addAdvanceRow} className="text-sm text-accent-2 font-medium">+ Добавить</button>
            </div>
            {advances.map((a, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <select value={a.employeeId} onChange={(e) => updateAdvance(i, { employeeId: e.target.value })} className="flex-1 px-3 py-2 rounded border border-line bg-surface-2 text-ink text-sm">
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>{emp.fullName}</option>
                  ))}
                </select>
                <input type="number" min={0} value={a.amount} onChange={(e) => updateAdvance(i, { amount: Number(e.target.value) })} className="w-32 px-3 py-2 rounded border border-line bg-surface-2 text-ink text-sm" />
                <button type="button" onClick={() => removeAdvance(i)} className="text-sm text-crit">✕</button>
              </div>
            ))}
          </div>

          {error && <p className="text-sm text-crit">{error}</p>}

          <button type="submit" disabled={running} className="py-2 px-5 rounded bg-accent text-white font-medium disabled:opacity-60">
            {running ? 'Считаем…' : 'Запустить расчёт'}
          </button>
        </form>

        {current && (
          <div className="bg-surface border border-line rounded-lg overflow-hidden mb-6">
            <div className="px-5 py-3 border-b border-line flex items-center justify-between">
              <span className="text-sm font-medium text-ink">
                {new Date(current.periodStart).toLocaleDateString('ru-RU')} — {new Date(current.periodEnd).toLocaleDateString('ru-RU')}
              </span>
              <span className="text-xs font-mono text-ink-muted">{current.lines.length} чел.</span>
            </div>
            {current.lines.length === 0 && (
              <p className="p-5 text-sm text-ink-muted">Нет заблокированных табелей за этот период — считать нечего.</p>
            )}
            {current.lines.map((line) => (
              <div key={line.id} className="px-5 py-4 border-b border-line last:border-b-0">
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-ink font-medium">{line.employee.fullName}</span>
                  <span className="text-ink-muted text-xs">{line.employee.position.name}</span>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-x-4 gap-y-1 text-xs text-ink-muted mb-2">
                  {COMPONENT_LABELS.map(({ key, label }) => {
                    const v = Number(line[key]);
                    if (v === 0) return null;
                    return (
                      <div key={key}>
                        {label}: <span className="font-mono">{key.includes('deduction') || key === 'deductions' ? '−' : ''}{ruble(line[key])}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="text-right font-mono font-semibold text-ink">{ruble(line.netAmount)} ₽</div>
              </div>
            ))}
          </div>
        )}

        <h2 className="text-lg font-medium text-ink mb-3">История расчётов</h2>
        <div className="bg-surface border border-line rounded-lg overflow-hidden">
          {runs.length === 0 && <p className="p-5 text-sm text-ink-muted">Расчётов ещё не было.</p>}
          {runs.map((r) => (
            <button
              key={r.id}
              onClick={() => openRun(r.id)}
              className="w-full text-left px-5 py-3 border-b border-line last:border-b-0 hover:bg-surface-2 flex items-center justify-between"
            >
              <span className="text-sm text-ink">
                {new Date(r.periodStart).toLocaleDateString('ru-RU')} — {new Date(r.periodEnd).toLocaleDateString('ru-RU')}
              </span>
              <span className="text-xs text-ink-muted">{r.lines.length} чел.</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
