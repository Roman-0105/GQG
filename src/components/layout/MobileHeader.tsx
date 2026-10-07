import { Link, useLocation } from 'react-router-dom'
import { Settings } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { NAV_ITEMS, isNavItemActive } from './navItems'
import BrandMark from '../BrandMark'
import UserMenu from './UserMenu'

// Мобильная шапка: заголовок текущего раздела (по совпадению с NAV_ITEMS)
// + аватар-меню. Основная навигация — в BottomTabBar, сюда попадает то,
// что не влезло в таб-бар (см. isNavItemActive).
export default function MobileHeader() {
  const { pathname } = useLocation()
  const { session, profile } = useAuth()

  const current = NAV_ITEMS.find((item) => isNavItemActive(pathname, item.to))
  const onDutyPage = pathname.startsWith('/duty')

  if (!session || !profile) {
    return (
      <header className="mobile-header">
        <Link to="/" className="brand" style={{ marginRight: 0 }}>
          <BrandMark size={30} />
          GQG
        </Link>
      </header>
    )
  }

  return (
    <header className="mobile-header">
      <div className="mobile-header-title">
        {onDutyPage ? (
          <>
            <Settings size={18} strokeWidth={2.2} color="var(--color-primary)" />
            Настройки
          </>
        ) : current ? (
          <>
            <current.icon size={18} strokeWidth={2.2} color="var(--color-primary)" />
            {current.label}
          </>
        ) : (
          'GQG'
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {profile.role === 'party_chief' && (
          <Link
            to="/duty"
            className="icon-btn-round"
            aria-label="Настройки"
            title="Настройки: вахта"
            style={onDutyPage ? { color: 'var(--color-primary)' } : undefined}
          >
            <Settings size={19} />
          </Link>
        )}
        <UserMenu />
      </div>
    </header>
  )
}
