import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useLocation } from 'react-router-dom'
import TopNav from './TopNav'
import MobileHeader from './MobileHeader'
import BottomTabBar from './BottomTabBar'

// Единая оболочка: ПК получает верхнюю навигацию, телефон — компактную
// шапку + нижний таб-бар (переключаются медиа-запросом в index.css, а не
// JS-детектом ширины — меньше мигания при ресайзе/повороте экрана).
// Смена страницы — лёгкий кросс-фейд с подъёмом, единственный "большой"
// момент анимации, вместо разрозненных дёрганий по всему интерфейсу.
export default function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()

  return (
    <div className="app-shell">
      <TopNav />
      <MobileHeader />
      <main className="page">
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
