import { Link } from 'react-router-dom';

/**
 * Заглушка ролевого дашборда. Здесь — карта разделов, чтобы каркас был
 * кликабелен; настоящие ролевые виджеты (разный набор плиток по
 * должности) — отдельная доработка поверх уже готовой аналитики.
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
        <Link to="/timesheets" className="block bg-surface border border-line rounded-lg p-5 hover:border-accent transition-colors">
          <h2 className="font-medium text-ink mb-1">Мои табели</h2>
          <p className="text-sm text-ink-muted">Статус согласования</p>
        </Link>
        <Link to="/approvals" className="block bg-surface border border-line rounded-lg p-5 hover:border-accent transition-colors">
          <h2 className="font-medium text-ink mb-1">Согласование</h2>
          <p className="text-sm text-ink-muted">Для руководителя участка</p>
        </Link>
        <Link to="/payroll" className="block bg-surface border border-line rounded-lg p-5 hover:border-accent transition-colors">
          <h2 className="font-medium text-ink mb-1">Расчёт зарплаты</h2>
          <p className="text-sm text-ink-muted">По заблокированным табелям</p>
        </Link>
        <Link to="/rate-rules" className="block bg-surface border border-line rounded-lg p-5 hover:border-accent transition-colors">
          <h2 className="font-medium text-ink mb-1">Правила расчёта</h2>
          <p className="text-sm text-ink-muted">Надбавки, суточные, метраж</p>
        </Link>
        <Link to="/analytics" className="block bg-surface border border-line rounded-lg p-5 hover:border-accent transition-colors">
          <h2 className="font-medium text-ink mb-1">Аналитика</h2>
          <p className="text-sm text-ink-muted">День/неделя/месяц/квартал/год, бюджет участков</p>
        </Link>
      </div>
    </div>
  );
}
