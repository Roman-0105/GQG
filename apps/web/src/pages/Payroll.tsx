import { FormEvent, useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { describeApiError } from '../lib/apiError';
import { PageHeader } from '../components/PageHeader';
import { Button, Card, EmptyState, ErrorState, Field, IconButton, Input, ListRow, Select } from '../components/ui';
import { IconPayroll, IconTrash } from '../components/icons';

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

type LineAmountKey =
  | 'baseAmount'
  | 'overtimeAmount'
  | 'nightAmount'
  | 'holidayAmount'
  | 'remoteBonusAmount'
  | 'perDiemAmount'
  | 'pieceRateAmount'
  | 'deductions'
  | 'advanceDeduction';

const COMPONENT_LABELS: { key: LineAmountKey; label: string }[] = [
  { key: 'baseAmount', label: 'База' },
  { key: 'overtimeAmount', label: 'Сверхурочные' },
  { key: 'nightAmount', label: 'Ночные' },
  { key: 'holidayAmount', label: 'Праздничные' },
  { key: 'remoteBonusAmount', label: 'Вахта' },
  { key: 'perDiemAmount', label: 'Суточные' },
  { key: 'pieceRateAmount', label: 'Метраж' },
  { key: 'deductions', label: 'Удержания' },
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
  const [runs, setRuns] = useState<PayrollRun[] | null>(null);
  const [runsError, setRunsError] = useState<unknown>(null);
  const [current, setCurrent] = useState<PayrollRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  function loadRuns() {
    setRunsError(null);
    apiFetch<PayrollRun[]>('/payroll/runs').then(setRuns).catch(setRunsError);
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
    <div className="max-w-4xl">
      <PageHeader
        crumbs={[{ label: 'Финансы' }]}
        title="Расчёт зарплаты"
        description="Берутся только заблокированные табели за период. Формулы и правила — на странице «Правила расчёта»."
      />

      <Card className="mb-6 p-6">
        <form onSubmit={handleRun} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Начало периода">
              <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} required />
            </Field>
            <Field label="Конец периода">
              <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} required />
            </Field>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">Авансы (необязательно)</span>
              <Button type="button" size="sm" variant="ghost" onClick={addAdvanceRow}>
                + Добавить
              </Button>
            </div>
            {advances.map((a, i) => (
              <div key={i} className="mb-2 flex gap-2">
                <Select
                  value={a.employeeId}
                  onChange={(e) => updateAdvance(i, { employeeId: e.target.value })}
                  wrapperClassName="flex-1"
                >
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.fullName}
                    </option>
                  ))}
                </Select>
                <Input
                  type="number"
                  min={0}
                  value={a.amount}
                  onChange={(e) => updateAdvance(i, { amount: Number(e.target.value) })}
                  className="!w-32 shrink-0"
                />
                <IconButton
                  type="button"
                  label="Удалить строку"
                  onClick={() => removeAdvance(i)}
                  className="hover:!bg-crit/10 hover:!text-crit"
                >
                  <IconTrash size={16} />
                </IconButton>
              </div>
            ))}
          </div>

          {error && <p className="text-sm text-crit">{error}</p>}

          <Button type="submit" disabled={running}>
            {running ? 'Считаем…' : 'Запустить расчёт'}
          </Button>
        </form>
      </Card>

      {current && (
        <Card className="mb-6 overflow-hidden">
          <ListRow className="flex items-center justify-between">
            <span className="text-sm font-medium text-ink">
              {new Date(current.periodStart).toLocaleDateString('ru-RU')} — {new Date(current.periodEnd).toLocaleDateString('ru-RU')}
            </span>
            <span className="font-mono text-xs text-ink-muted">{current.lines.length} чел.</span>
          </ListRow>
          {current.lines.length === 0 && (
            <p className="p-5 text-sm text-ink-muted">Нет заблокированных табелей за этот период — считать нечего.</p>
          )}
          {current.lines.map((line) => (
            <ListRow key={line.id} className="py-4">
              <div className="mb-2 flex items-baseline justify-between">
                <span className="font-medium text-ink">{line.employee.fullName}</span>
                <span className="text-xs text-ink-muted">{line.employee.position.name}</span>
              </div>
              <div className="mb-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-ink-muted sm:grid-cols-4">
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
            </ListRow>
          ))}
        </Card>
      )}

      <h2 className="mb-3 text-lg font-medium text-ink">История расчётов</h2>
      <Card className="overflow-hidden">
        {runsError ? (
          <ErrorState {...describeApiError(runsError)} onRetry={loadRuns} />
        ) : runs === null ? (
          <p className="p-5 text-sm text-ink-muted">Загрузка…</p>
        ) : runs.length === 0 ? (
          <EmptyState icon={IconPayroll} title="Расчётов ещё не было" description="Запустите первый расчёт формой выше." />
        ) : (
          runs.map((r) => (
            <button key={r.id} onClick={() => openRun(r.id)} className="block w-full text-left transition-colors hover:bg-surface-2">
              <ListRow className="flex items-center justify-between">
                <span className="text-sm text-ink">
                  {new Date(r.periodStart).toLocaleDateString('ru-RU')} — {new Date(r.periodEnd).toLocaleDateString('ru-RU')}
                </span>
                <span className="text-xs text-ink-muted">{r.lines.length} чел.</span>
              </ListRow>
            </button>
          ))
        )}
      </Card>
    </div>
  );
}
