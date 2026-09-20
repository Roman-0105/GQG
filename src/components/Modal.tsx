import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}

// Общее модальное окно для форм добавления (участок/работник/организация/
// станок/категория затрат и т.п.) — см. отзыв 19.09.2026: раньше такие
// формы либо всегда были развёрнуты наверху списка, либо появлялись
// инлайн внутри карточки — заказчику хотелось единообразия и заблюренного
// фона, чтобы форма не терялась среди остального контента. Задний план и
// анимация — тот же паттерн, что уже был в MyReports.tsx для просмотра
// истории сводок, вынесенный сюда как переиспользуемый компонент.
export default function Modal({ open, onClose, title, children }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onClose}
        >
          <motion.div
            className="modal-panel"
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h2 style={{ margin: 0 }}>{title}</h2>
              <button type="button" className="icon-btn-round" onClick={onClose} title="Закрыть">
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
