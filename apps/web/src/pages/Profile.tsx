import { FormEvent, useState } from 'react';
import { apiFetch } from '../lib/api';
import { getSessionUser } from '../lib/session';
import { useCurrentUser } from '../lib/useCurrentUser';
import { PageHeader } from '../components/PageHeader';
import { Button, Card, Field, Input } from '../components/ui';

/**
 * Смена собственного пароля — до Этапа 06 в продукте не было вообще
 * никакого способа сменить пароль (найдено devops и docs-writer
 * независимо при подготовке пилота). Требует знания текущего пароля;
 * если пользователь его не помнит — пароль сбрасывает Владелец/HR
 * через «Команда» (см. Team.tsx, поле "Новый пароль" в редактировании).
 */
export function Profile() {
  const sessionUser = getSessionUser();
  const { role } = useCurrentUser();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (newPassword !== confirmPassword) {
      setError('Новый пароль и подтверждение не совпадают');
      return;
    }

    setSaving(true);
    try {
      await apiFetch('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сменить пароль');
    } finally {
      setSaving(false);
    }
  }

  if (!sessionUser) {
    return <p className="text-crit">Сессия не найдена — войдите заново.</p>;
  }

  return (
    <div className="max-w-md">
      <PageHeader title="Профиль" description="Ваш логин и смена пароля." />

      <Card className="mb-6 p-6">
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-ink-muted">Имя</dt>
            <dd className="text-ink">{sessionUser.fullName}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-muted">E-mail</dt>
            <dd className="text-ink">{sessionUser.email}</dd>
          </div>
          {role && (
            <div className="flex justify-between gap-3">
              <dt className="text-ink-muted">Роль</dt>
              <dd className="text-ink">{role}</dd>
            </div>
          )}
        </dl>
      </Card>

      <Card className="p-6">
        <h2 className="mb-4 text-sm font-medium text-ink">Сменить пароль</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Текущий пароль">
            <Input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </Field>
          <Field label="Новый пароль">
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </Field>
          <Field label="Повторите новый пароль">
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </Field>
          {error && <p className="text-sm text-crit">{error}</p>}
          {success && <p className="text-sm text-good">Пароль изменён.</p>}
          <Button type="submit" disabled={saving}>
            {saving ? 'Сохраняем…' : 'Сменить пароль'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
