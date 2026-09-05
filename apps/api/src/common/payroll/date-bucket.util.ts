export type Grain = 'day' | 'week' | 'month' | 'quarter' | 'year';

/** Понедельник той недели, в которую попадает дата (UTC, без учёта ISO-нумерации недель). */
function startOfWeekMonday(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayIndex = (d.getUTCDay() + 6) % 7; // 0 = понедельник
  d.setUTCDate(d.getUTCDate() - dayIndex);
  return d;
}

/**
 * Ключ бакета для группировки по временному срезу
 * (docs/project-plan.md, раздел 5: день/неделя/месяц/квартал/год).
 * Ключи отсортированы лексикографически так же, как хронологически —
 * можно просто Array.sort() по ключу.
 */
export function bucketKey(date: Date, grain: Grain): string {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth(); // 0-based

  switch (grain) {
    case 'day':
      return date.toISOString().slice(0, 10);
    case 'week':
      return startOfWeekMonday(date).toISOString().slice(0, 10);
    case 'month':
      return `${y}-${String(m + 1).padStart(2, '0')}`;
    case 'quarter':
      return `${y}-Q${Math.floor(m / 3) + 1}`;
    case 'year':
      return `${y}`;
  }
}
