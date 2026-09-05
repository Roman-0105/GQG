import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';

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
  const [positions, setPositions] = useState<Position[]>([]);
  const [name, setName] = useState('');
  const [rate, setRate] = useState(400);
  const [hazardPay, setHazardPay] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function load() {
    apiFetch<Position[]>('/positions')
      .then(setPositions)
      .catch((err) => setError(err instanceof Error ? err.message : 'Не удалось загрузить должности'));
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
    <div className="min-h-screen bg-bg p-8">
      <div className="max-w-2xl mx-auto">
        <Link to="/dashboard" className="text-sm text-accent-2 mb-4 inline-block">← Панель</Link>
        <h1 className="text-2xl font-semibold text-ink mb-6">Должности и ставки</h1>

        <div className="bg-surface border border-line rounded-lg overflow-hidden mb-6">
          {positions.length === 0 && (
            <p className="p-5 text-sm text-ink-muted">Пока нет ни одной должности.</p>
          )}
          {positions.map((p) => (
            <div key={p.id} className="flex items-center justify-between px-5 py-3 border-b border-line last:border-b-0">
              <div>
                <span className="text-ink font-medium">{p.name}</span>
                {p.hazardPay && <span className="ml-2 text-xs text-warn">вредность</span>}
              </div>
              <span className="text-ink-muted text-sm">{Number(p.baseHourlyRate).toFixed(0)} ₽/ч · ×{Number(p.overtimeMultiplier)} сверхурочные</span>
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="bg-surface border border-line rounded-lg p-6 space-y-4">
          <h2 className="text-sm font-medium text-ink">Добавить должность</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs uppercase tracking-wide text-ink-muted mb-1">Название</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Бурильщик" className="w-full px-3 py-2 rounded border border-line bg-surface-2 text-ink" />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wide text-ink-muted mb-1">Ставка, ₽/ч</label>
              <input type="number" min={0} value={rate} onChange={(e) => setRate(Number(e.target.value))} className="w-full px-3 py-2 rounded border border-line bg-surface-2 text-ink" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <input type="checkbox" checked={hazardPay} onChange={(e) => setHazardPay(e.target.checked)} />
            Вредные/опасные условия
          </label>
          {error && <p className="text-sm text-crit">{error}</p>}
          <button type="submit" disabled={saving} className="py-2 px-5 rounded bg-accent text-white font-medium disabled:opacity-60">
            {saving ? 'Добавляем…' : 'Добавить'}
          </button>
        </form>
      </div>
    </div>
  );
}
