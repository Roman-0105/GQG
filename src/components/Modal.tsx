import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { AnimatePresence, motion, useDragControls } from 'framer-motion'
import { X } from 'lucide-react'
import { useIsMobile } from '../hooks/useMediaQuery'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

// Общее модальное окно (формы добавления, диалоги). Поведение по гайду Контура
// (05.10.2026):
//  • на ПК — окно по центру; на телефоне — нижняя шторка (bottom sheet), которую
//    можно закрыть смахиванием вниз за «ручку» сверху;
//  • закрывается крестиком и клавишей Esc; клик по затемнению закрывает только
//    окна БЕЗ полей ввода (чтобы случайный клик не стирал введённое);
//  • пока окно открыто, страница под ним не прокручивается;
//  • на ПК фокус сразу ставится в первое поле (на телефоне — нет, чтобы не
//    выезжала клавиатура).
export default function Modal({ open, onClose, title, children }: Props) {
  const isMobile = useIsMobile()
  const panelRef = useRef<HTMLDivElement>(null)
  const dragControls = useDragControls()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  useEffect(() => {
    if (!open || isMobile) return
    const t = window.setTimeout(() => {
      const el = panelRef.current?.querySelector<HTMLElement>('input:not([type=hidden]):not([readonly]), textarea, select')
      if (el && document.activeElement === document.body) el.focus()
    }, 80)
    return () => window.clearTimeout(t)
  }, [open, isMobile])

  function handleBackdropClick() {
    if (panelRef.current?.querySelector('input, textarea, select')) return
    onClose()
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={`modal-backdrop${isMobile ? ' is-sheet' : ''}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={handleBackdropClick}
        >
          <motion.div
            ref={panelRef}
            className={`modal-panel${isMobile ? ' is-sheet' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={isMobile ? { y: '100%' } : { opacity: 0, scale: 0.96, y: 10 }}
            animate={isMobile ? { y: 0 } : { opacity: 1, scale: 1, y: 0 }}
            exit={isMobile ? { y: '100%' } : { opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: isMobile ? 0.28 : 0.18, ease: [0.16, 1, 0.3, 1] }}
            drag={isMobile ? 'y' : false}
            dragListener={false}
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 110 || info.velocity.y > 650) onClose()
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {isMobile && (
              <div
                className="sheet-handle"
                onPointerDown={(e) => dragControls.start(e)}
                aria-hidden
                title="Потяните вниз, чтобы закрыть"
              />
            )}
            <div
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, touchAction: 'none' }}
              onPointerDown={isMobile ? (e) => dragControls.start(e) : undefined}
            >
              <h2 style={{ margin: 0 }}>{title}</h2>
              <button
                type="button"
                className="icon-btn-round"
                onClick={onClose}
                onPointerDown={(e) => e.stopPropagation()}
                title="Закрыть"
                aria-label="Закрыть"
              >
                <X size={18} />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
