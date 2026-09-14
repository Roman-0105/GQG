import { ComponentType } from 'react';
import {
  IconApprovals,
  IconAnalytics,
  IconDashboard,
  IconPayroll,
  IconPosition,
  IconRateRules,
  IconSites,
  IconTeam,
  IconTimesheetList,
  IconTimesheetNew,
  IconProps,
} from '../components/icons';
import { EffectivePermission, Scope } from './useCurrentUser';

export interface NavItem {
  to: string;
  label: string;
  description: string;
  icon: ComponentType<IconProps>;
  match?: (path: string) => boolean;
  /** Показывать, если есть право (resource, action) хоть в каком-то scope. */
  require?: { resource: string; action: string };
  /** Показывать, только если право есть именно с этим scope. */
  requireScope?: { resource: string; action: string; scope: Scope };
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

/**
 * Единственный источник правды о разделах платформы — раньше сайдбар
 * (AppShell.tsx) и плитки панели (Dashboard.tsx) держали два независимых
 * списка, из-за чего пункт можно было убрать/переименовать в одном
 * месте и забыть про другое. Видимость пункта считается через RBAC
 * (см. useCurrentUser.ts), а не через хардкод названия роли — так
 * появление новой роли или переименование существующей не ломает
 * навигацию молча.
 *
 * "Внести табель" (одиночная офлайн-форма) сюда больше не входит:
 * табель ведётся через "Моя бригада" -> сетка табеля за период, куда
 * бригадир заходит сразу после того, как сформировал табель, без
 * отдельного экрана и без предварительного согласования самого периода
 * (см. TimesheetPeriodsService) — раньше один и тот же смысл был
 * размазан по трём разным вкладкам, что и вызывало путаницу при
 * тестировании ("зачем 100500 вкладок с этим табелем").
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Администрирование',
    items: [
      { to: '/sites', label: 'Участки', description: 'Объекты, бригады и сотрудники', icon: IconSites, match: (p) => p.startsWith('/sites'), require: { resource: 'site', action: 'read' } },
      { to: '/team', label: 'Команда', description: 'Логины и роли — отсюда назначают бригадиров', icon: IconTeam, require: { resource: 'user', action: 'read' } },
      { to: '/positions', label: 'Должности', description: 'Справочник ставок', icon: IconPosition, require: { resource: 'position', action: 'read' } },
    ],
  },
  {
    title: 'Полевая работа',
    items: [
      // Своя бригада — только у того, кому она реально принадлежит
      // (own_crew в правах = Бригадир). У начальника участка/бухгалтера
      // company-scope права на те же ресурсы, но своей бригады нет и
      // быть не должно (см. seed.ts) — им этот пункт не нужен.
      { to: '/my-crew', label: 'Моя бригада', description: 'Состав, табель за период и ежедневные часы', icon: IconTeam, requireScope: { resource: 'timesheet_period', action: 'create', scope: 'own_crew' } },
      // Поставленные бригадиру задания (см. TasksSection.tsx на
      // странице участка) — та же own_crew-проверка, что и у "Моя
      // бригада": реального task-права у Бригадира нет и не нужно,
      // /tasks/mine фильтрует по foremanId без проверки прав (как
      // /crews/mine).
      { to: '/tasks', label: 'Задания', description: 'Поставленные вам задания', icon: IconTimesheetNew, match: (p) => p.startsWith('/tasks'), requireScope: { resource: 'timesheet_period', action: 'create', scope: 'own_crew' } },
      // Табели других бригад/участков — нужны только тому, у кого
      // видимость шире одной своей бригады.
      { to: '/timesheets', label: 'Табеля', description: 'По участкам и бригадам', icon: IconTimesheetList, requireScope: { resource: 'timesheet_period', action: 'read', scope: 'company' } },
      { to: '/approvals', label: 'Согласование', description: 'Статус отправленных табелей', icon: IconApprovals, require: { resource: 'timesheet_period', action: 'read' } },
    ],
  },
  {
    title: 'Финансы',
    items: [
      { to: '/payroll', label: 'Расчёт зарплаты', description: 'По заблокированным табелям', icon: IconPayroll, require: { resource: 'payroll', action: 'read' } },
      { to: '/rate-rules', label: 'Правила расчёта', description: 'Надбавки, суточные, метраж', icon: IconRateRules, require: { resource: 'rate_rule', action: 'read' } },
    ],
  },
  {
    title: 'Аналитика',
    items: [{ to: '/analytics', label: 'Аналитика', description: 'День/неделя/месяц/квартал/год, бюджет участков', icon: IconAnalytics, require: { resource: 'analytics', action: 'read' } }],
  },
];

export const DASHBOARD_NAV_ITEM: NavItem = {
  to: '/dashboard',
  label: 'Панель',
  description: '',
  icon: IconDashboard,
};

function isVisible(item: NavItem, permissions: EffectivePermission[]): boolean {
  if (item.require) {
    return permissions.some((p) => p.resource === item.require!.resource && p.action === item.require!.action);
  }
  if (item.requireScope) {
    return permissions.some(
      (p) =>
        p.resource === item.requireScope!.resource &&
        p.action === item.requireScope!.action &&
        (item.requireScope!.scope === 'company' ? p.scope === 'company' || p.scope === 'own_sites' : p.scope === item.requireScope!.scope),
    );
  }
  return true;
}

/** Разделы навигации, доступные пользователю с этим набором прав — пустые разделы отбрасываются. */
export function visibleNavSections(permissions: EffectivePermission[]): NavSection[] {
  return NAV_SECTIONS.map((section) => ({ ...section, items: section.items.filter((item) => isVisible(item, permissions)) })).filter(
    (section) => section.items.length > 0,
  );
}
