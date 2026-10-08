import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import AuthSplash from '../AuthSplash'
import Sidebar from './Sidebar'
import MobileHeader from './MobileHeader'
import BottomTabBar from './BottomTabBar'

// Единая оболочка: ПК получает левый тулбар (сворачиваемый в иконки,
// см. Sidebar.tsx), телефон — компактную шапку + нижний таб-бар
// (переключаются медиа-запросом в index.css, а не JS-детектом ширины —
// меньше мигания при ресайзе/повороте экрана). Смена страницы — лёгкий
// кросс-фейд с подъёмом, единственный "большой" момент анимации, вместо
// разрозненных дёрганий по всему интерфейсу.
export default function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const { loading } = useAuth()

  // Проверка сессии / загрузка профиля — фирменная заставка вместо мигающих экранов
  if (loading) return <AuthSplash />
  // Экран входа — на весь экран, без боковой панели и нижнего меню
  if (pathname === '/login') return <>{children}</>

  return (
    <div className="app-shell">
      <Sidebar />
      <MobileHeader />
      <main className={`page${['/map', '/org-chart', '/reports/corrections'].includes(pathname) ? ' page-wide' : ''}`}>
        <AnimatePresence mode="wait">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
      <BottomTabBar />
    </div>
  )
}
