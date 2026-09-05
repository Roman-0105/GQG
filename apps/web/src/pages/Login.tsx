import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { setSessionUser } from '../lib/session';

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
    <div className="min-h-screen flex items-center justify-center bg-bg">
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-surface border border-line rounded-lg p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-ink mb-1">КЕРН</h1>
        <p className="text-sm text-ink-muted mb-6">Вход в платформу полевого учёта</p>

        <label className="block text-xs uppercase tracking-wide text-ink-muted mb-1">E-mail</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full mb-4 px-3 py-2 rounded border border-line bg-surface-2 text-ink"
          required
        />

        <label className="block text-xs uppercase tracking-wide text-ink-muted mb-1">Пароль</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full mb-4 px-3 py-2 rounded border border-line bg-surface-2 text-ink"
          required
        />

        {error && <p className="text-sm text-crit mb-4">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 rounded bg-accent text-white font-medium disabled:opacity-60"
        >
          {loading ? 'Входим…' : 'Войти'}
        </button>
      </form>
    </div>
  );
}
