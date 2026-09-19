import { Link, useLocation } from 'react-router-dom'
import { Mountain } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { NAV_ITEMS, isNavItemActive } from './navItems'
import UserMenu from './UserMenu'

// Мобильная шапка: заголовок текущего раздела (по совпадению с NAV_ITEMS)
// + аватар-меню. Основная навигация — в BottomTabBar, сюда попадает то,
// что не влезло в таб-бар (см. isNavItemActive).
export default function MobileHeader() {
  const { pathname } = useLocation()
  const { session, profile } = useAuth()

  const current = NAV_ITEMS.find((item) => isNavItemActive(pathname, item.to))

  if (!session || !profile) {
    return (
      <header className="mobile-header">
        <Link to="/" className="topnav-brand" style={{ marginRight: 0 }}>
          <span className="topnav-brand-mark">
            <Mountain size={15} strokeWidth={2.5} />
          </span>
          GQS
        </Link>
      </header>
    )
  }

  return (
    <header className="mobile-header">
      <div className="mobile-header-title">
        {current ? (
          <>
            <current.icon size={18} strokeWidth={2.2} color="var(--color-primary)" />
            {current.label}
          </>
        ) : (
          'GQS'
        )}
      </div>
      <UserMenu />
    </header>
  )
}
