import { useEffect, useState } from 'react'

// Брейкпоинты платформы — группы экранов как в гайде Контура (05.10.2026):
// Mobile до 767, Tablet 768–991, Narrow Desktop 992–1199, Desktop 1200–1439,
// Wide Desktop от 1440. Для поведения, которое нельзя выразить одним CSS
// (нижняя шторка вместо окна, карточки вместо таблицы), используется этот хук.
export function useMediaQuery(query: string): boolean {
  const get = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false)
  const [matches, setMatches] = useState(get)

  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return matches
}

export const useIsMobile = () => useMediaQuery('(max-width: 767px)')
// Узкий десктоп и планшет — боковое меню сворачивается до иконок
export const useIsNarrowDesktop = () => useMediaQuery('(max-width: 1199px)')
