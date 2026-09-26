// Единая анимация "въезд снизу при появлении" (25.09.2026, фаза 0
// редизайна) — раньше один и тот же initial/animate/transition-триплет
// был скопирован почти в каждый список по всему проекту (Dashboard,
// MyReports, PendingApprovals, SummaryReport, TaskReportsList,
// CostCategoriesSettings, DrillingOrganizationsSettings, WorkersSettings,
// SiteDetail, SitesList, TaskDashboard, UsersList) с расходящимися
// duration/y/шагом задержки — единообразно "на глаз", но не по коду.
// Плюс существовал параллельный CSS-keyframe `.rise-in` с тем же
// эффектом, который в итоге нигде не был подключён (мёртвый код — удалён
// из index.css тем же коммитом). Теперь один источник для всех.
//
// Модальные окна (Modal.tsx), выпадающее меню пользователя (UserMenu.tsx),
// переход между страницами (AppShell.tsx) и логотип на экране входа
// (Login.tsx) сюда сознательно не переведены — у них другая, специфичная
// анимация (scale/backdrop/rotate), не "въезд снизу списком".
export const EASE_OUT = [0.16, 1, 0.3, 1] as const

interface RiseInOptions {
  /** Явная задержка (сек) — перекрывает вычисление по index. */
  delay?: number
  /** Сдвиг по Y в начальном состоянии, px. */
  y?: number
  duration?: number
  /** Шаг задержки на один индекс, сек (по умолчанию — как в SitesList/TaskDashboard). */
  step?: number
  /** Верхняя граница индекса для задержки — длинный список не должен долго "досыпаться". */
  cap?: number
}

export function riseIn(index = 0, opts: RiseInOptions = {}) {
  const { y = 8, duration = 0.28, step = 0.035, cap = 8 } = opts
  const delay = opts.delay ?? Math.min(index, cap) * step
  return {
    initial: { opacity: 0, y },
    animate: { opacity: 1, y: 0 },
    transition: { duration, delay, ease: EASE_OUT },
  }
}
