import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { PageHeader } from '../components/PageHeader';
import { Button, Card, Field, Input, Select, Textarea } from '../components/ui';

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
  const [budget, setBudget] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const site = await apiFetch<{ id: string }>('/sites', {
        method: 'POST',
        body: JSON.stringify({
          name,
          code,
          workType,
          description: description || undefined,
          client: client || undefined,
          budget: budget ? Number(budget) : undefined,
        }),
      });
      navigate(`/sites/${site.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось создать участок');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-lg">
      <PageHeader crumbs={[{ label: 'Администрирование' }, { label: 'Участки', to: '/sites' }]} title="Новый участок" />

      <Card className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Название">
            <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Скв. №14, Восточный" />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Код участка">
              <Input value={code} onChange={(e) => setCode(e.target.value)} required placeholder="SITE-14" />
            </Field>
            <Field label="Тип работ">
              <Select value={workType} onChange={(e) => setWorkType(e.target.value)}>
                {WORK_TYPES.map((w) => (
                  <option key={w.value} value={w.value}>
                    {w.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Клиент" hint="Необязательно">
              <Input value={client} onChange={(e) => setClient(e.target.value)} />
            </Field>
            <Field label="Бюджет, ₽" hint="Необязательно">
              <Input type="number" min={0} value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="напр. 500000" />
            </Field>
          </div>

          <Field label="Описание" hint="Необязательно">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </Field>

          {error && <p className="text-sm text-crit">{error}</p>}

          <Button type="submit" disabled={saving} className="w-full">
            {saving ? 'Создаём…' : 'Создать участок'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
