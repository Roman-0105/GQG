import { Link } from 'react-router-dom';

/**
 * Заглушка ролевого дашборда. Реальные витрины (день/неделя/месяц/
 * квартал/год/произвольный период) — Этап 04 (docs/project-plan.md,
 * раздел 5). Здесь — карта разделов, чтобы каркас был кликабелен.
 */
export function Dashboard() {
  return (
    <div className="min-h-screen bg-bg p-8">
      <h1 className="text-2xl font-semibold text-ink mb-6">Панель</h1>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl">
        <Link to="/sites" className="block bg-surface border border-line rounded-lg p-5 hover:border-accent transition-colors">
          <h2 className="font-medium text-ink mb-1">Участки</h2>
          <p className="text-sm text-ink-muted">Объекты, бригады и сотрудники</p>
        </Link>
        <Link to="/team" className="block bg-surface border border-line rounded-lg p-5 hover:border-accent transition-colors">
          <h2 className="font-medium text-ink mb-1">Команда</h2>
          <p className="text-sm text-ink-muted">Логины и роли — отсюда назначают бригадиров</p>
        </Link>
        <Link to="/positions" className="block bg-surface border border-line rounded-lg p-5 hover:border-accent transition-colors">
          <h2 className="font-medium text-ink mb-1">Должности</h2>
          <p className="text-sm text-ink-muted">Справочник ставок</p>
        </Link>
        <Link to="/timesheets/new" className="block bg-surface border border-line rounded-lg p-5 hover:border-accent transition-colors">
          <h2 className="font-medium text-ink mb-1">Внести табель</h2>
          <p className="text-sm text-ink-muted">Работает офлайн</p>
        </Link>
        <div className="block bg-surface border border-line rounded-lg p-5 opacity-60">
          <h2 className="font-medium text-ink mb-1">Расчёт зарплаты</h2>
          <p className="text-sm text-ink-muted">Этап 03 — ещё не реализовано</p>
        </div>
        <div className="block bg-surface border border-line rounded-lg p-5 opacity-60">
          <h2 className="font-medium text-ink mb-1">Аналитика</h2>
          <p className="text-sm text-ink-muted">Этап 04 — ещё не реализовано</p>
        </div>
      </div>
    </div>
  );
}
