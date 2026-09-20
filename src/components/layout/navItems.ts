import {
  LayoutDashboard,
  Mountain,
  Users,
  ClipboardCheck,
  FileBarChart,
  FileClock,
  Wallet,
  Building2,
  HardHat,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { UserRole } from '../../types/roles'
import { isManagement } from '../../types/roles'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  show: (role: UserRole | null | undefined) => boolean
  badgeKey?: 'pendingApprovals'
}

// Единый список пунктов навигации — источник и для верхнего меню (ПК), и
// для нижнего таб-бара (моб.), и для мобильной шапки, чтобы порядок и
// видимость по ролям не расходились между экранами.
export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Дашборд', icon: LayoutDashboard, show: () => true },
  { to: '/sites', label: 'Участки', icon: Mountain, show: () => true },
  {
    to: '/reports/mine',
    label: 'Мои сводки',
    icon: FileClock,
    show: (role) => role === 'party_chief',
  },
  {
    to: '/reports/pending',
    label: 'Согласование',
    icon: ClipboardCheck,
    show: isManagement,
    badgeKey: 'pendingApprovals',
  },
  { to: '/reports/summary', label: 'Отчёты', icon: FileBarChart, show: isManagement },
  { to: '/users', label: 'Пользователи', icon: Users, show: isManagement },
  { to: '/settings/workers', label: 'Работники', icon: HardHat, show: isManagement },
  { to: '/settings/organizations', label: 'Организации бурения', icon: Building2, show: isManagement },
  { to: '/settings/costs', label: 'Статьи затрат', icon: Wallet, show: isManagement },
]

export function isNavItemActive(pathname: string, to: string) {
  if (to === '/') return pathname === '/'
  if (pathname === to || pathname.startsWith(`${to}/`)) return true
  // Задания и их сводки/дашборды (/tasks/...) логически часть "Участков" —
  // туда всегда попадают через карточку участка, отдельного пункта меню
  // для них нет (см. отзыв 17.09.2026: терялось ощущение "я всё ещё в
  // Участках", когда открыта карточка задания).
  if (to === '/sites' && pathname.startsWith('/tasks/')) return true
  return false
}
