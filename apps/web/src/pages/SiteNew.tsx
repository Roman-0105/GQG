import { FormEvent, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';

const WORK_TYPES: { value: string; label: string }[] = [
  { value: 'geology', label: 'Геология' },
  { value: 'geotech', label: 'Геотехника' },
  { value: 'drilling', label: 'Бурение' },
  { value: 'mixed', label: 'Смешанный' },
];

/** Владелец/админ заводит новый участок (docs/project-plan.md, раздел 3). */
export function SiteNew() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [workType, setWorkType] = useState('drilling');
  const [description, setDescription] = useState('');
  const [client, setClient] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const site = await apiFetch<{ id: string }>('/sites', {
        method: 'POST',
        body: JSON.stringify({ name, code, workType, description: description || undefined, client: client || undefined }),
      });
      navigate(`/sites/${site.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось создать участок');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg p-8">
      <div className="max-w-lg mx-auto">
        <Link to="/sites" className="text-sm text-accent-2 mb-4 inline-block">← К списку участков</Link>
        <h1 className="text-2xl font-semibold text-ink mb-6">Новый участок</h1>

        <form onSubmit={handleSubmit} className="bg-surface border border-line rounded-lg p-6 space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-wide text-ink-muted mb-1">Название</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Скв. №14, Восточный" className="w-full px-3 py-2 rounded border border-line bg-surface-2 text-ink" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs uppercase tracking-wide text-ink-muted mb-1">Код участка</label>
              <input value={code} onChange={(e) => setCode(e.target.value)} required placeholder="SITE-14" className="w-full px-3 py-2 rounded border border-line bg-surface-2 text-ink" />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wide text-ink-muted mb-1">Тип работ</label>
              <select value={workType} onChange={(e) => setWorkType(e.target.value)} className="w-full px-3 py-2 rounded border border-line bg-surface-2 text-ink">
                {WORK_TYPES.map((w) => (
                  <option key={w.value} value={w.value}>{w.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wide text-ink-muted mb-1">Клиент (необязательно)</label>
            <input value={client} onChange={(e) => setClient(e.target.value)} className="w-full px-3 py-2 rounded border border-line bg-surface-2 text-ink" />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wide text-ink-muted mb-1">Описание (необязательно)</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="w-full px-3 py-2 rounded border border-line bg-surface-2 text-ink" />
          </div>

          {error && <p className="text-sm text-crit">{error}</p>}

          <button type="submit" disabled={saving} className="w-full py-2 rounded bg-accent text-white font-medium disabled:opacity-60">
            {saving ? 'Создаём…' : 'Создать участок'}
          </button>
        </form>
      </div>
    </div>
  );
}
