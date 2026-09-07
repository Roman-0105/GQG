import { FormEvent, useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { describeApiError } from '../lib/apiError';
import { PageHeader } from '../components/PageHeader';
import { Badge, Card, Checkbox, EmptyState, ErrorState, Field, Input, ListRow, Select, Button } from '../components/ui';
import { IconEdit, IconTeam } from '../components/icons';

interface Role {
  id: string;
  name: string;
}

interface Site {
  id: string;
  name: string;
}

interface TeamUser {
  id: string;
  fullName: string;
  email: string;
  isActive: boolean;
  roleAssignments: { role: Role; siteIds: string[] }[];
}

// Единственная сидовая роль с областью видимости "свои участки" — пока
// нет отдельного экрана управления ролями, проще спросить список
// участков только для неё, чем городить интроспекцию прав на клиенте.
// Когда появится конструктор ролей — заменить на реальную проверку.
const SITE_SCOPED_ROLE_NAME = 'Руководитель участка';

function SitePicker({ sites, value, onChange }: { sites: Site[]; value: string[]; onChange: (v: string[]) => void }) {
  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((s) => s !== id) : [...value, id]);
  }

  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-ink-muted">
        Доступные участки
      </label>
      <div className="flex flex-wrap gap-x-4 gap-y-1 rounded-md border border-line bg-surface-2 p-3">
        {sites.length === 0 && <span className="text-sm text-ink-muted">Сначала заведите хотя бы один участок.</span>}
        {sites.map((s) => (
          <Checkbox key={s.id} checked={value.includes(s.id)} onChange={() => toggle(s.id)} label={s.name} />
        ))}
      </div>
      {value.length === 0 && (
        <p className="mt-1 text-xs text-warn">Без выбранного участка эта роль не увидит ни одного объекта.</p>
      )}
    </div>
  );
}

function EditUserRow({
  user,
  roles,
  sites,
  onSaved,
  onCancel,
}: {
  user: TeamUser;
  roles: Role[];
  sites: Site[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const currentAssignment = user.roleAssignments[0];
  const [fullName, setFullName] = useState(user.fullName);
  const [roleId, setRoleId] = useState(currentAssignment?.role.id ?? roles[0]?.id ?? '');
  const [siteIds, setSiteIds] = useState<string[]>(currentAssignment?.siteIds ?? []);
  const [isActive, setIsActive] = useState(user.isActive);
  // Сброс ЧУЖОГО забытого пароля — до Этапа 06 такой возможности не
  // было вообще (найдено devops и docs-writer независимо при подготовке
  // пилота). Пусто = не менять; заполняется только когда реально нужно.
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const roleName = roles.find((r) => r.id === roleId)?.name;
  const needsSites = roleName === SITE_SCOPED_ROLE_NAME;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await apiFetch(`/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          fullName,
          roleId,
          siteIds: needsSites ? siteIds : [],
          isActive,
          ...(newPassword ? { password: newPassword } : {}),
        }),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ListRow>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Имя" className="min-w-[10rem] flex-1">
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          </Field>
          <Field label="Роль" className="min-w-[10rem] flex-1">
            <Select value={roleId} onChange={(e) => setRoleId(e.target.value)}>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </Field>
          <Checkbox checked={isActive} onChange={setIsActive} label="Активен" />
        </div>
        {needsSites && <SitePicker sites={sites} value={siteIds} onChange={setSiteIds} />}
        <Field label="Новый пароль (необязательно)" className="max-w-xs">
          <Input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Оставьте пустым, чтобы не менять"
            minLength={8}
          />
        </Field>
        {error && <p className="text-xs text-crit">{error}</p>}
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? 'Сохраняем…' : 'Сохранить'}
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={onCancel}>
            Отмена
          </Button>
        </div>
      </form>
    </ListRow>
  );
}

/**
 * Логины сотрудников/бригадиров — без учётной записи некого назначить
 * бригадиром бригады (Crew.foremanId ссылается на User, а не на Employee,
 * см. docs/project-plan.md, раздел 2–3).
 */
export function Team() {
  const [users, setUsers] = useState<TeamUser[] | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState('');
  const [siteIds, setSiteIds] = useState<string[]>([]);
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
    apiFetch<Site[]>('/sites').then(setSites).catch(() => {});
  }

  useEffect(load, []);

  const newRoleName = roles.find((r) => r.id === roleId)?.name;
  const newNeedsSites = newRoleName === SITE_SCOPED_ROLE_NAME;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await apiFetch('/users', {
        method: 'POST',
        body: JSON.stringify({ fullName, email, password, roleId, siteIds: newNeedsSites ? siteIds : [] }),
      });
      setFullName('');
      setEmail('');
      setPassword('');
      setSiteIds([]);
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
          users.map((u) =>
            editingId === u.id ? (
              <EditUserRow
                key={u.id}
                user={u}
                roles={roles}
                sites={sites}
                onSaved={() => {
                  setEditingId(null);
                  load();
                }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <ListRow key={u.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="font-medium text-ink">{u.fullName}</span>
                  <span className="ml-2 text-sm text-ink-muted">{u.email}</span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {!u.isActive && <Badge tone="neutral">отключён</Badge>}
                  <Badge tone="accent">{u.roleAssignments.map((ra) => ra.role.name).join(', ') || 'без роли'}</Badge>
                  <button
                    type="button"
                    onClick={() => setEditingId(u.id)}
                    aria-label="Редактировать"
                    title="Редактировать"
                    className="text-ink-muted transition-colors hover:text-ink"
                  >
                    <IconEdit size={15} />
                  </button>
                </div>
              </ListRow>
            ),
          )
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
          {newNeedsSites && <SitePicker sites={sites} value={siteIds} onChange={setSiteIds} />}
          {error && <p className="text-sm text-crit">{error}</p>}
          <Button type="submit" disabled={saving}>
            {saving ? 'Создаём…' : 'Добавить'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
