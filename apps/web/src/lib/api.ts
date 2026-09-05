const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

function getToken(): string | null {
  try {
    return localStorage.getItem('kern:token');
  } catch {
    return null; // приватный режим/заблокированное хранилище — работаем без токена
  }
}

/**
 * Ошибка запроса с HTTP-статусом. Остаётся полноценным Error (тот же
 * `.message`, весь существующий код вида `err instanceof Error ?
 * err.message : ...` продолжает работать без изменений) — но теперь
 * экраны, которым это нужно, могут различить "нет прав" (403) от
 * "нет сети" и показать понятное объяснение вместо сырого текста
 * бэкенда (см. components/ErrorState.tsx).
 */
export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new Error('Нет соединения с сервером');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.message ?? `Ошибка запроса: ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
