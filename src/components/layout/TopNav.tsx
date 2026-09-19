import { Link, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Mountain } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useReportCounts } from '../../hooks/useReportCounts'
import { NAV_ITEMS, isNavItemActive } from './navItems'
import UserMenu from './UserMenu'

// Верхняя навигация — только для ПК (>=768px, см. index.css). На мобильном
// её место занимают MobileHeader + BottomTabBar.
export default function TopNav() {
  const { pathname } = useLocation()
  const { session, profile } = useAuth()
  const { pendingApprovals } = useReportCounts()

  if (!session || !profile) {
    return (
      <header className="topnav">
        <Link to="/" className="topnav-brand">
          <span className="topnav-brand-mark">
            <Mountain size={16} strokeWidth={2.5} />
          </span>
          GQS
        </Link>
      </header>
    )
  }

  const items = NAV_ITEMS.filter((item) => item.show(profile.role))

  return (
    <header className="topnav">
      <Link to="/" className="topnav-brand">
        <span className="topnav-brand-mark">
          <Mountain size={16} strokeWidth={2.5} />
        </span>
        GQS
      </Link>

      <nav className="topnav-links">
        {items.map((item) => {
          const active = isNavItemActive(pathname, item.to)
          const badge = item.badgeKey === 'pendingApprovals' ? pendingApprovals : 0
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`topnav-link${active ? ' is-active' : ''}`}
            >
              <item.icon size={16} strokeWidth={2.2} />
              {item.label}
              {badge > 0 && (
                <span className="badge badge-danger" style={{ marginLeft: 2 }}>
                  {badge}
                </span>
              )}
              {active && (
                <motion.span
                  className="topnav-link-underline"
                  layoutId="topnav-underline"
                  transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                />
              )}
            </Link>
          )
        })}
      </nav>

      <div className="topnav-actions">
        <UserMenu />
      </div>
    </header>
  )
}
