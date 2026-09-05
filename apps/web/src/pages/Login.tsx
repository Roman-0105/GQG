import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { setSessionUser } from '../lib/session';
import { Button, Field, Input } from '../components/ui';
import { IconKernMark } from '../components/icons';

interface LoginResponse {
  accessToken: string;
  user: { id: string; fullName: string; email: string; companyId: string };
}

export function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('owner@demo.kern');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await apiFetch<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      localStorage.setItem('kern:token', result.accessToken);
      setSessionUser(result.user);
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось войти');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-lg border border-line bg-surface p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-md bg-accent text-white">
            <IconKernMark size={24} />
          </span>
          <div>
            <h1 className="text-xl font-semibold text-ink">КЕРН</h1>
            <p className="text-xs text-ink-muted">Полевой учёт часов и расчёт ЗП</p>
          </div>
        </div>

        <div className="space-y-4">
          <Field label="E-mail">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </Field>

          <Field label="Пароль">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
        </div>

        {error && <p className="mt-4 text-sm text-crit">{error}</p>}

        <Button type="submit" disabled={loading} className="mt-6 w-full">
          {loading ? 'Входим…' : 'Войти'}
        </Button>
      </form>
    </div>
  );
}
