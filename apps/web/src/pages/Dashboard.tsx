import { PageHeader } from '../components/PageHeader';
import { Tile } from '../components/Tile';
import { useCurrentUser } from '../lib/useCurrentUser';
import {
  IconAnalytics,
  IconApprovals,
  IconPayroll,
  IconPosition,
  IconRateRules,
  IconSites,
  IconTeam,
  IconTimesheetList,
  IconTimesheetNew,
} from '../components/icons';

/**
 * Заглушка ролевого дашборда. Здесь — карта разделов, чтобы каркас был
 * кликабелен; настоящие ролевые виджеты (разный набор плиток по
 * должности) — отдельная доработка поверх уже готовой аналитики.
 */
export function Dashboard() {
  const { user } = useCurrentUser();

  return (
    <div>
      <PageHeader
        title={user ? `Здравствуйте, ${user.fullName.split(' ')[0]}` : 'Панель'}
        description="Быстрый доступ ко всем разделам платформы."
      />

      <div className="mb-6">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-muted">Администрирование</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Tile to="/sites" icon={IconSites} title="Участки" description="Объекты, бригады и сотрудники" />
          <Tile to="/team" icon={IconTeam} title="Команда" description="Логины и роли — отсюда назначают бригадиров" />
          <Tile to="/positions" icon={IconPosition} title="Должности" description="Справочник ставок" />
        </div>
      </div>

      <div className="mb-6">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-muted">Полевая работа</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Tile to="/timesheets/new" icon={IconTimesheetNew} title="Внести табель" description="Работает офлайн" />
          <Tile to="/timesheets" icon={IconTimesheetList} title="Мои табели" description="Статус согласования" />
          <Tile to="/approvals" icon={IconApprovals} title="Согласование" description="Для руководителя участка" />
        </div>
      </div>

      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-muted">Финансы и аналитика</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Tile to="/payroll" icon={IconPayroll} title="Расчёт зарплаты" description="По заблокированным табелям" />
          <Tile to="/rate-rules" icon={IconRateRules} title="Правила расчёта" description="Надбавки, суточные, метраж" />
          <Tile
            to="/analytics"
            icon={IconAnalytics}
            title="Аналитика"
            description="День/неделя/месяц/квартал/год, бюджет участков"
          />
        </div>
      </div>
    </div>
  );
}
