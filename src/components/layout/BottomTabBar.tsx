import { Link, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../../context/AuthContext'
import { useReportCounts } from '../../hooks/useReportCounts'
import { NAV_ITEMS, isNavItemActive } from './navItems'

// Нижний таб-бар — единственная навигация на мобильном (см. index.css,
// показывается только <768px). Пункты те же, что в TopNav, отфильтрованные
// по роли — у бригадира их меньше (нет "Согласование"/"Отчёты"/"Пользователи"),
// и это осознанно отражает то, чем он реально пользуется, а не урезанная копия.
export default function BottomTabBar() {
  const { pathname } = useLocation()
  const { session, profile } = useAuth()
  const { pendingApprovals } = useReportCounts()

  if (!session || !profile) return null

  const items = NAV_ITEMS.filter((item) => item.show(profile.role))

  return (
    <nav className="bottom-tabbar">
      {items.map((item) => {
        const active = isNavItemActive(pathname, item.to)
        const badge = item.badgeKey === 'pendingApprovals' ? pendingApprovals : 0
        return (
          <Link
            key={item.to}
            to={item.to}
            className={`tabbar-item${active ? ' is-active' : ''}`}
          >
            {active && (
              <motion.span
                className="tabbar-indicator"
                layoutId="tabbar-indicator"
                transition={{ type: 'spring', stiffness: 500, damping: 40 }}
              />
            )}
            <span className="tabbar-item-icon">
              <item.icon size={21} strokeWidth={active ? 2.4 : 2} />
              {badge > 0 && <span className="tabbar-dot">{badge}</span>}
            </span>
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
