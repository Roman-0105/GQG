import { useEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode, WheelEvent as ReactWheelEvent } from 'react'
import { Plus, Minus, Maximize } from 'lucide-react'

const MIN_SCALE = 0.25
const MAX_SCALE = 2

// Универсальный pan/zoom-контейнер (25.09.2026, по прямому запросу
// владельца платформы — "избавимся от ползунков прокрутки" в оргструктуре)
// — раньше граф оргструктуры был обычным overflow-x:auto блоком: чтобы
// увидеть всё дерево, приходилось листать горизонтальный скролл, часть
// схемы всегда была "за кадром". Теперь — фиксированная область с
// content, который можно приближать/отдалять и таскать пальцем/мышью,
// весь холст виден целиком сразу после автоподгонки (fitToView при
// монтировании и по ResizeObserver, если контент меняет размер — новые
// узлы дерева и т.п.).
//
// Не тянем стороннюю библиотеку (react-zoom-pan-pinch и т.п.) — то же
// решение, что и с графиками (TrendSparkline): самописный примитив в
// том же духе, что ProgressBar/CircularProgress, достаточно простой,
// чтобы не тащить лишний вес в бандл ради одного экрана.
export default function PanZoomViewport({ children }: { children: ReactNode }) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)

  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)

  const dragState = useRef<{ startX: number; startY: number; panX: number; panY: number; moved: boolean } | null>(null)
  const suppressNextClick = useRef(false)

  function fitToView() {
    const viewport = viewportRef.current
    const canvas = canvasRef.current
    if (!viewport || !canvas) return
    // Естественный размер контента — измеряем БЕЗ текущего transform,
    // иначе scrollWidth/Height уже искажены предыдущим масштабом.
    const prevTransform = canvas.style.transform
    canvas.style.transform = 'none'
    const contentW = canvas.scrollWidth
    const contentH = canvas.scrollHeight
    canvas.style.transform = prevTransform

    const viewportW = viewport.clientWidth
    const viewportH = viewport.clientHeight
    if (contentW === 0 || contentH === 0) return

    const fit = Math.min(viewportW / contentW, viewportH / contentH, 1) * 0.92
    const nextScale = Math.min(Math.max(fit, MIN_SCALE), MAX_SCALE)
    setScale(nextScale)
    setPan({
      x: (viewportW - contentW * nextScale) / 2,
      y: (viewportH - contentH * nextScale) / 2,
    })
  }

  // Автоподгонка при первом появлении контента, при изменении его
  // размера (дерево подгрузилось, узел добавили/удалили) И при изменении
  // размера самого viewport (поворот экрана, ресайз окна) — раньше
  // отслеживался только canvasRef, из-за чего переключение на мобильную
  // ширину без перезагрузки страницы оставляло масштаб, посчитанный под
  // старую (десктопную) ширину контейнера — почти вся схема пропадала за
  // пределами узкого экрана.
  useEffect(() => {
    fitToView()
    const canvas = canvasRef.current
    const viewport = viewportRef.current
    if (!canvas || !viewport || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => fitToView())
    observer.observe(canvas)
    observer.observe(viewport)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function zoomBy(factor: number) {
    const viewport = viewportRef.current
    if (!viewport) return
    const cx = viewport.clientWidth / 2
    const cy = viewport.clientHeight / 2
    setScale((prevScale) => {
      const nextScale = Math.min(Math.max(prevScale * factor, MIN_SCALE), MAX_SCALE)
      setPan((prevPan) => {
        const contentX = (cx - prevPan.x) / prevScale
        const contentY = (cy - prevPan.y) / prevScale
        return { x: cx - contentX * nextScale, y: cy - contentY * nextScale }
      })
      return nextScale
    })
  }

  function handleWheel(e: ReactWheelEvent<HTMLDivElement>) {
    e.preventDefault()
    const viewport = viewportRef.current
    if (!viewport) return
    const rect = viewport.getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
    setScale((prevScale) => {
      const nextScale = Math.min(Math.max(prevScale * factor, MIN_SCALE), MAX_SCALE)
      setPan((prevPan) => {
        const contentX = (cx - prevPan.x) / prevScale
        const contentY = (cy - prevPan.y) / prevScale
        return { x: cx - contentX * nextScale, y: cy - contentY * nextScale }
      })
      return nextScale
    })
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    dragState.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y, moved: false }
    setDragging(true)
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragState.current
    if (!drag) return
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    if (!drag.moved && Math.hypot(dx, dy) > 4) drag.moved = true
    if (drag.moved) setPan({ x: drag.panX + dx, y: drag.panY + dy })
  }

  function handlePointerUp() {
    if (dragState.current?.moved) suppressNextClick.current = true
    dragState.current = null
    setDragging(false)
  }

  // Клик по узлу дерева не должен срабатывать сразу после перетаскивания
  // (иначе отпускание мыши в конце drag открывало бы модалку узла, под
  // которым в этот момент оказался курсор) — перехватываем клик на фазе
  // capture и гасим его один раз, ровно после реального drag'а.
  function handleClickCapture(e: ReactMouseEvent<HTMLDivElement>) {
    if (suppressNextClick.current) {
      e.stopPropagation()
      e.preventDefault()
      suppressNextClick.current = false
    }
  }

  return (
    <div
      ref={viewportRef}
      className={`pan-zoom-viewport${dragging ? ' is-dragging' : ''}`}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onClickCapture={handleClickCapture}
    >
      <div
        ref={canvasRef}
        className="pan-zoom-canvas"
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}
      >
        {children}
      </div>
      <div className="pan-zoom-controls">
        <button type="button" onClick={() => zoomBy(1.25)} title="Приблизить" aria-label="Приблизить">
          <Plus size={15} />
        </button>
        <button type="button" onClick={() => zoomBy(1 / 1.25)} title="Отдалить" aria-label="Отдалить">
          <Minus size={15} />
        </button>
        <button type="button" onClick={fitToView} title="Показать всю схему" aria-label="Показать всю схему">
          <Maximize size={14} />
        </button>
      </div>
    </div>
  )
}
