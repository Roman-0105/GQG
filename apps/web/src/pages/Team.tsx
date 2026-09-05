import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';

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
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function load() {
    apiFetch<TeamUser[]>('/users').then(setUsers).catch(() => {});
    apiFetch<Role[]>('/roles')
      .then((r) => {
        setRoles(r);
        if (!roleId && r.length > 0) setRoleId(r.find((x) => x.name === 'Бригадир')?.id ?? r[0].id);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Не удалось загрузить роли'));
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
    <div className="min-h-screen bg-bg p-8">
      <div className="max-w-2xl mx-auto">
        <Link to="/dashboard" className="text-sm text-accent-2 mb-4 inline-block">← Панель</Link>
        <h1 className="text-2xl font-semibold text-ink mb-6">Команда</h1>

        <div className="bg-surface border border-line rounded-lg overflow-hidden mb-6">
          {users.length === 0 && <p className="p-5 text-sm text-ink-muted">Пока нет ни одного логина, кроме вашего.</p>}
          {users.map((u) => (
            <div key={u.id} className="flex items-center justify-between px-5 py-3 border-b border-line last:border-b-0">
              <div>
                <span className="text-ink font-medium">{u.fullName}</span>
                <span className="text-ink-muted text-sm ml-2">{u.email}</span>
              </div>
              <span className="text-xs font-mono text-accent-2">
                {u.roleAssignments.map((ra) => ra.role.name).join(', ') || '— без роли —'}
              </span>
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="bg-surface border border-line rounded-lg p-6 space-y-4">
          <h2 className="text-sm font-medium text-ink">Добавить логин</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs uppercase tracking-wide text-ink-muted mb-1">Имя</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} required className="w-full px-3 py-2 rounded border border-line bg-surface-2 text-ink" />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wide text-ink-muted mb-1">E-mail</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full px-3 py-2 rounded border border-line bg-surface-2 text-ink" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs uppercase tracking-wide text-ink-muted mb-1">Временный пароль</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} className="w-full px-3 py-2 rounded border border-line bg-surface-2 text-ink" />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wide text-ink-muted mb-1">Роль</label>
              <select value={roleId} onChange={(e) => setRoleId(e.target.value)} className="w-full px-3 py-2 rounded border border-line bg-surface-2 text-ink">
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
          </div>
          {error && <p className="text-sm text-crit">{error}</p>}
          <button type="submit" disabled={saving} className="py-2 px-5 rounded bg-accent text-white font-medium disabled:opacity-60">
            {saving ? 'Создаём…' : 'Добавить'}
          </button>
        </form>
      </div>
    </div>
  );
}
