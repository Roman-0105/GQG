import { apiFetch } from './api';

export interface MyEmployee {
  id: string;
  fullName: string;
  position: { name: string };
}

export interface MyCrew {
  id: string;
  name: string;
  site: { id: string; name: string; code: string };
  members: MyEmployee[];
}

function cacheKey(userId: string): string {
  return `kern:my-crews:${userId}`;
}

/**
 * "Мои бригады" бригадира — нужны офлайн, в поле, где связи может не
 * быть вовсе. При успешном запросе кэшируем последний ответ; без сети
 * отдаём то, что осталось с прошлого раза, а не пустой экран.
 */
export async function loadMyCrews(userId: string): Promise<{ crews: MyCrew[]; fromCache: boolean }> {
  try {
    const crews = await apiFetch<MyCrew[]>('/crews/mine');
    try {
      localStorage.setItem(cacheKey(userId), JSON.stringify(crews));
    } catch {
      // хранилище недоступно — просто не кэшируем, на этот раз пронесло
    }
    return { crews, fromCache: false };
  } catch (err) {
    try {
      const raw = localStorage.getItem(cacheKey(userId));
      if (raw) return { crews: JSON.parse(raw) as MyCrew[], fromCache: true };
    } catch {
      // нет и кэша — пробрасываем исходную ошибку ниже
    }
    throw err;
  }
}
