import { FormEvent, useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { describeApiError } from '../lib/apiError';
import { PageHeader } from '../components/PageHeader';
import { Badge, Card, EmptyState, ErrorState, Field, Input, ListRow, Select, Button } from '../components/ui';
import { IconTeam } from '../components/icons';

interface Role {
  id: string;
  name: string;
}

interface TeamUser {
  id: string;
  fullName: string;
  email: string;
  roleAssignments: { role: Role }[];
}

/**
 * Логины сотрудников/бригадиров — без учётной записи некого назначить
 * бригадиром бригады (Crew.foremanId ссылается на User, а не на Employee,
 * см. docs/project-plan.md, раздел 2–3).
 */
export function Team() {
  const [users, setUsers] = useState<TeamUser[] | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [listError, setListError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);

  function load() {
    setListError(null);
    apiFetch<TeamUser[]>('/users').then(setUsers).catch(setListError);
    apiFetch<Role[]>('/roles')
      .then((r) => {
        setRoles(r);
        setRoleId((prev) => prev || r.find((x) => x.name === 'Бригадир')?.id || r[0]?.id || '');
      })
      .catch(() => {});
  }

  useEffect(load, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await apiFetch('/users', {
        method: 'POST',
        body: JSON.stringify({ fullName, email, password, roleId }),
      });
      setFullName('');
      setEmail('');
      setPassword('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось создать логин');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <PageHeader title="Команда" description="Логины сотрудников и их роли доступа." />

      <Card className="mb-6 overflow-hidden">
        {listError ? (
          <ErrorState {...describeApiError(listError)} onRetry={load} />
        ) : users === null ? (
          <p className="p-5 text-sm text-ink-muted">Загрузка…</p>
        ) : users.length === 0 ? (
          <EmptyState icon={IconTeam} title="Пока нет ни одного логина, кроме вашего" description="Добавьте первый формой ниже." />
        ) : (
          users.map((u) => (
            <ListRow key={u.id} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="font-medium text-ink">{u.fullName}</span>
                <span className="ml-2 text-sm text-ink-muted">{u.email}</span>
              </div>
              <Badge tone="accent">{u.roleAssignments.map((ra) => ra.role.name).join(', ') || 'без роли'}</Badge>
            </ListRow>
          ))
        )}
      </Card>

      <Card className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <h2 className="text-sm font-medium text-ink">Добавить логин</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Имя">
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </Field>
            <Field label="E-mail">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Временный пароль">
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
            </Field>
            <Field label="Роль">
              <Select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {error && <p className="text-sm text-crit">{error}</p>}
          <Button type="submit" disabled={saving}>
            {saving ? 'Создаём…' : 'Добавить'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
