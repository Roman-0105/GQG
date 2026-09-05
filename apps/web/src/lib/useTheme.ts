import { useEffect, useState } from 'react';

export type ThemePref = 'system' | 'light' | 'dark';

const KEY = 'kern:theme';

function apply(pref: ThemePref) {
  const root = document.documentElement;
  if (pref === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', pref);
  }
}

/**
 * Переключатель темы поверх уже готовых токенов (tokens.css поддерживает
 * и `prefers-color-scheme`, и явный `data-theme`). Полезно в поле:
 * тёмная тема ночью/в сумерках, светлая — на ярком солнце, когда экран
 * иначе не читается.
 */
export function useTheme(): [ThemePref, (p: ThemePref) => void] {
  const [pref, setPref] = useState<ThemePref>(() => {
    try {
      return (localStorage.getItem(KEY) as ThemePref | null) ?? 'system';
    } catch {
      return 'system';
    }
  });

  useEffect(() => {
    apply(pref);
    try {
      localStorage.setItem(KEY, pref);
    } catch {
      // недоступно — тема просто не запомнится между визитами
    }
  }, [pref]);

  return [pref, setPref];
}
