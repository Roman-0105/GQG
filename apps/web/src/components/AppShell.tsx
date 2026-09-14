import { ComponentType, ReactNode, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { clearSession } from '../lib/session';
import { useCurrentUser } from '../lib/useCurrentUser';
import { useTheme } from '../lib/useTheme';
import { DASHBOARD_NAV_ITEM, NAV_SECTIONS, visibleNavSections } from '../lib/nav';
import {
  IconKernMark,
  IconLogout,
  IconMenu,
  IconMonitor,
  IconMoon,
  IconSun,
  IconClose,
  IconProps,
} from './icons';

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
}

function ThemeToggle() {
  const [pref, setPref] = useTheme();
  const options: { value: typeof pref; icon: ComponentType<IconProps>; label: string }[] = [
    { value: 'light', icon: IconSun, label: 'Светлая тема' },
    { value: 'system', icon: IconMonitor, label: 'Тема как в системе' },
    { value: 'dark', icon: IconMoon, label: 'Тёмная тема' },
  ];
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-line bg-surface-2 p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          title={opt.label}
          aria-label={opt.label}
          aria-pressed={pref === opt.value}
          onClick={() => setPref(opt.value)}
          className={`flex h-8 w-8 items-center justify-center rounded transition-colors ${
            pref === opt.value ? 'bg-accent text-white' : 'text-ink-muted hover:text-ink'
          }`}
        >
          <opt.icon size={15} />
        </button>
      ))}
    </div>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, role, permissions, loaded } = useCurrentUser();

  function handleLogout() {
    clearSession();
    navigate('/login');
  }

  // Пока права не загружены — показываем полный список, чтобы не
  // мигать пустым сайдбаром долю секунды после входа; как только
  // /auth/me ответит, список сужается до реально доступного.
  const sections = [
    { title: 'Обзор', items: [DASHBOARD_NAV_ITEM] },
    ...(loaded ? visibleNavSections(permissions) : NAV_SECTIONS),
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-accent text-white">
          <IconKernMark size={20} />
        </span>
        <div>
          <p className="text-sm font-semibold tracking-wide text-ink">КЕРН</p>
          <p className="text-[11px] text-ink-muted">Полевой учёт и расчёт ЗП</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {sections.map((section) => (
          <div key={section.title} className="mb-4">
            <p className="px-2.5 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
              {section.title}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = (item.match ?? ((p: string) => p === item.to))(location.pathname);
                return (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      onClick={onNavigate}
                      aria-current={active ? 'page' : undefined}
                      className={`group flex items-center gap-3 rounded-md px-2.5 py-2.5 text-sm transition-colors ${
                        active
                          ? 'bg-accent/10 text-accent font-medium'
                          : 'text-ink-muted hover:bg-surface-2 hover:text-ink'
                      }`}
                    >
                      <item.icon
                        size={18}
                        className={active ? 'text-accent' : 'text-ink-muted group-hover:text-ink'}
                      />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-line p-3">
        <Link to="/profile" className="flex items-center gap-2 rounded-md px-2 py-2 transition-colors hover:bg-surface-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold text-ink">
            {user ? initials(user.fullName) : '?'}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{user?.fullName ?? 'Гость'}</p>
            <p className="truncate text-xs text-ink-muted">{role ?? user?.email ?? '—'}</p>
          </div>
        </Link>
        <div className="mt-2 flex items-center justify-between gap-2 px-2">
          <ThemeToggle />
          <button
            onClick={handleLogout}
            title="Выйти"
            aria-label="Выйти"
            className="flex h-9 w-9 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2 hover:text-crit transition-colors"
          >
            <IconLogout size={17} />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Постоянная навигационная оболочка платформы (сайдбар + мобильный
 * тулбар). До этого у каждой страницы была своя произвольная ссылка
 * "← Панель"/"← Назад" и пользователь не видел ни карты разделов, ни
 * того, под какой ролью он вошёл — отсюда и ощущение "каши" (см.
 * .claude/agents/designer.md). Теперь структура разделов одна и та же
 * везде, активный раздел подсвечен, имя/роль и выход — всегда на месте.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-bg">
      {/* Десктоп: постоянный сайдбар */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:w-64 lg:flex-col lg:border-r lg:border-line lg:bg-surface">
        <SidebarContent />
      </aside>

      {/* Мобильный/планшетный тулбар */}
      <header className="flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3 lg:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Открыть меню"
          className="flex h-11 w-11 items-center justify-center rounded-md text-ink hover:bg-surface-2"
        >
          <IconMenu size={22} />
        </button>
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded bg-accent text-white">
            <IconKernMark size={16} />
          </span>
          <span className="text-sm font-semibold text-ink">КЕРН</span>
        </div>
        <div className="w-11" />
      </header>

      {/* Мобильная выдвижная панель */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-surface shadow-xl">
            <div className="flex justify-end p-2">
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="Закрыть меню"
                className="flex h-10 w-10 items-center justify-center rounded-md text-ink-muted hover:bg-surface-2"
              >
                <IconClose size={18} />
              </button>
            </div>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <main className="lg:pl-64">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">{children}</div>
      </main>
    </div>
  );
}
