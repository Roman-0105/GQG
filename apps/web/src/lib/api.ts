const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

function getToken(): string | null {
  try {
    return localStorage.getItem('kern:token');
  } catch {
    return null; // приватный режим/заблокированное хранилище — работаем без токена
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? `Ошибка запроса: ${res.status}`);
  }

  return res.json() as Promise<T>;
}
