import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useReportCounts } from '../../hooks/useReportCounts'
import { useIsNarrowDesktop } from '../../hooks/useMediaQuery'
import { NAV_ITEMS, isNavItemActive } from './navItems'
import BrandMark from '../BrandMark'
import UserMenu from './UserMenu'

const COLLAPSE_KEY = 'gqs-sidebar-collapsed'

// null — пользователь ещё не выбирал вручную: тогда меню само сворачивается до иконок
// на планшете и узком ноутбуке (768–1199px), как в гайде Контура.
function readCollapsed(): boolean | null {
  try {
    const v = localStorage.getItem(COLLAPSE_KEY)
    return v === '1' ? true : v === '0' ? false : null
  } catch {
    return null
  }
}

// Левый тулбар — только ПК (>=768px, см. index.css). На мобильном его место
// занимают MobileHeader + BottomTabBar. Свёрнутое/развёрнутое состояние —
// предпочтение конкретного браузера, не общий для проекта параметр, поэтому
// в localStorage, а не в БД.
export default function Sidebar() {
  const { pathname } = useLocation()
  const { session, profile, can, workArea } = useAuth()
  const { pendingApprovals } = useReportCounts()
  const [manual, setManual] = useState<boolean | null>(readCollapsed)
  const narrow = useIsNarrowDesktop()
  const collapsed = manual ?? narrow

  useEffect(() => {
    if (manual === null) return
    try {
      localStorage.setItem(COLLAPSE_KEY, manual ? '1' : '0')
    } catch {
      // приватный режим/запрещённое хранилище — просто не запоминаем выбор
    }
  }, [manual])

  if (!session || !profile) {
    return (
      <aside className="sidebar">
        <div className="sidebar-header">
          <Link to="/" className="brand">
            <BrandMark />
            GQG
          </Link>
        </div>
      </aside>
    )
  }

  const items = NAV_ITEMS.filter((item) => item.show(profile.role, can, workArea))

  return (
    <aside className={`sidebar${collapsed ? ' is-collapsed' : ''}`}>
      <div className="sidebar-header">
        <Link to="/" className="brand">
          <BrandMark />
          {!collapsed && 'GQG'}
        </Link>
        <button
          type="button"
          className="sidebar-collapse-btn"
          onClick={() => setManual(!collapsed)}
          title={collapsed ? 'Развернуть меню' : 'Свернуть меню'}
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>

      <nav className="sidebar-links">
        {items.map((item) => {
          const active = isNavItemActive(pathname, item.to)
          const badge = item.badgeKey === 'pendingApprovals' ? pendingApprovals : 0
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`sidebar-link${active ? ' is-active' : ''}`}
              title={collapsed ? item.label : undefined}
            >
              {active && (
                <motion.span
                  className="sidebar-link-indicator"
                  layoutId="sidebar-indicator"
                  transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                />
              )}
              <span className="sidebar-link-icon">
                <item.icon size={17} strokeWidth={2.2} />
                {badge > 0 && collapsed && <span className="sidebar-dot" />}
              </span>
              {!collapsed && <span className="sidebar-link-label">{item.label}</span>}
              {!collapsed && badge > 0 && (
                <span className="badge badge-danger num" style={{ marginLeft: 'auto' }}>
                  {badge}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      <div className="sidebar-footer">
        <UserMenu placement="up" showLabel={!collapsed} />
      </div>
    </aside>
  )
}
