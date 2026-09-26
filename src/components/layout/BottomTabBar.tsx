import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { MoreHorizontal } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useReportCounts } from '../../hooks/useReportCounts'
import { NAV_ITEMS, isNavItemActive } from './navItems'
import Modal from '../Modal'

// Сколько пунктов реально помещается в нижний таб-бар на телефоне, не
// превращаясь в нечитаемую кашу — см. отзыв 25.09.2026 ("сделай
// адаптацию под мобильные нормальной"): у management-ролей NAV_ITEMS
// отдаёт 9 пунктов сразу (Дашборд/Участки/Согласование/Отчёты/
// Пользователи/Работники/Организации бурения/Статьи затрат/
// Оргструктура) — раньше все 9 запихивались в grid-auto-columns:1fr на
// 375px экране, получалось ~40px на пункт, подписи наезжали друг на
// друга. Максимум MAX_TABS слотов, включая "Ещё" (когда пунктов больше)
// — первые попадают в сам таб-бар (самые частые: дашборд/участки/
// согласование/отчёты), остальные — в список внутри модалки "Ещё". У
// бригадира пунктов всего 4 (Дашборд/Участки/Мои сводки/Оргструктура) —
// укладываются без "Ещё" и без изменений.
const MAX_TABS = 5

export default function BottomTabBar() {
  const { pathname } = useLocation()
  const { session, profile } = useAuth()
  const { pendingApprovals } = useReportCounts()
  const [moreOpen, setMoreOpen] = useState(false)

  if (!session || !profile) return null

  const allItems = NAV_ITEMS.filter((item) => item.show(profile.role))
  const overflow = allItems.length > MAX_TABS
  const primaryItems = overflow ? allItems.slice(0, MAX_TABS - 1) : allItems
  const moreItems = overflow ? allItems.slice(MAX_TABS - 1) : []
  const moreActive = moreItems.some((item) => isNavItemActive(pathname, item.to))

  return (
    <>
      <nav className="bottom-tabbar">
        {primaryItems.map((item) => {
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
        {overflow && (
          <button
            type="button"
            className={`tabbar-item${moreActive ? ' is-active' : ''}`}
            onClick={() => setMoreOpen(true)}
          >
            {moreActive && (
              <motion.span
                className="tabbar-indicator"
                layoutId="tabbar-indicator"
                transition={{ type: 'spring', stiffness: 500, damping: 40 }}
              />
            )}
            <span className="tabbar-item-icon">
              <MoreHorizontal size={21} strokeWidth={moreActive ? 2.4 : 2} />
            </span>
            Ещё
          </button>
        )}
      </nav>

      {overflow && (
        <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="Ещё">
          <div className="tabbar-more-list">
            {moreItems.map((item) => {
              const active = isNavItemActive(pathname, item.to)
              const badge = item.badgeKey === 'pendingApprovals' ? pendingApprovals : 0
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`tabbar-more-item${active ? ' is-active' : ''}`}
                  onClick={() => setMoreOpen(false)}
                >
                  <item.icon size={19} strokeWidth={active ? 2.4 : 2} />
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {badge > 0 && <span className="tabbar-dot" style={{ position: 'static' }}>{badge}</span>}
                </Link>
              )
            })}
          </div>
        </Modal>
      )}
    </>
  )
}
