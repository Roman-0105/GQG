import { Link, Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Users, HardHat, Building2, Wallet, ChevronRight, Settings as SettingsIcon } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { isManagement } from '../../types/roles'
import { riseIn } from '../../lib/motionVariants'

// Хаб справочников (25.09.2026, по отзыву заказчика: "если у нас есть
// оргструктура, зачем нам вкладка пользователи" — повод пересмотреть
// навигацию в целом). Раньше Пользователи/Работники/Организации бурения/
// Статьи затрат были 4 отдельными пунктами верхнего меню — вместе с
// остальными 5 это давало 9 пунктов у management-роли и требовало
// overflow "Ещё" в нижнем таб-баре на телефоне. Сами роуты не переехали
// (/users, /settings/workers, /settings/organizations, /settings/costs) —
// здесь просто единая точка входа с карточками-ссылками на них.
const ITEMS: { to: string; label: string; description: string; icon: LucideIcon }[] = [
  {
    to: '/users',
    label: 'Пользователи',
    description: 'Учётные записи, роли, доступ в приложение',
    icon: Users,
  },
  {
    to: '/settings/workers',
    label: 'Работники',
    description: 'Состав буровых бригад — без входа в приложение',
    icon: HardHat,
  },
  {
    to: '/settings/organizations',
    label: 'Организации бурения',
    description: 'Свои и подрядные организации, буровые станки',
    icon: Building2,
  },
  {
    to: '/settings/costs',
    label: 'Статьи затрат',
    description: 'Категории и виды затрат для сводок',
    icon: Wallet,
  },
]

export default function SettingsHub() {
  const { session, profile, loading: authLoading } = useAuth()

  if (authLoading) return <p>Загрузка…</p>
  if (!session) return <Navigate to="/login" replace />
  if (!isManagement(profile?.role)) {
    return <p>Настройки доступны только гендиру/техдиру.</p>
  }

  return (
    <div>
      <h1 style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <SettingsIcon size={22} className="text-muted" /> Настройки
      </h1>
      <p className="text-muted" style={{ marginBottom: 22 }}>
        Справочники платформы. Не связаны с оргструктурой напрямую — здесь
        учётные записи и состав бригад/техники для документооборота, в
        «Оргструктуре» — визуальная карта штата.
      </p>

      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
        {ITEMS.map((item, i) => (
          <motion.div key={item.to} {...riseIn(i)}>
            <Link
              to={item.to}
              className="card card-interactive"
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', color: 'var(--color-text)' }}
            >
              <span
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 9,
                  background: 'var(--color-accent-soft)',
                  color: 'var(--color-accent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <item.icon size={17} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15 }}>
                  {item.label}
                </span>
                <span style={{ display: 'block', fontSize: 12.5, color: 'var(--color-text-muted)' }}>
                  {item.description}
                </span>
              </span>
              <ChevronRight size={18} className="text-faint" style={{ flexShrink: 0 }} />
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
