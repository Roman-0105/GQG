import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { LogOut } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { ROLE_LABELS } from '../../types/roles'

function initials(fullName: string) {
  const parts = fullName.trim().split(/\s+/)
  return (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')
}

// Один компонент для аватара-меню и на десктопе (в топнаве), и в мобильной
// шапке — набор действий один и тот же (профиль/выход), нет смысла
// дублировать разметку под два экрана.
export default function UserMenu() {
  const { profile, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!profile) return null

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button
        type="button"
        className="user-menu-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="user-avatar">{initials(profile.full_name).toUpperCase()}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="user-menu-panel"
            role="menu"
            initial={{ opacity: 0, scale: 0.96, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -6 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="user-menu-header">
              <div style={{ fontWeight: 700, fontSize: 14 }}>{profile.full_name}</div>
              <div className="text-muted" style={{ fontSize: 12.5 }}>
                {ROLE_LABELS[profile.role]}
              </div>
            </div>
            <button
              type="button"
              className="user-menu-item"
              role="menuitem"
              onClick={() => {
                setOpen(false)
                signOut()
              }}
            >
              <LogOut size={16} />
              Выйти
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
