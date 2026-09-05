import { SVGProps } from 'react';

/**
 * Единый набор линейных монохромных иконок платформы КЕРН.
 *
 * Правила (см. .claude/agents/designer.md): один размер холста (24×24),
 * одна толщина обводки, только currentColor — никаких заливок и
 * дополнительных цветов. Не эмодзи, не смешение стилей по страницам.
 * Небольшой самодельный набор вместо тяжёлой icon-библиотеки.
 */

export interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

function Svg({ size = 20, strokeWidth = 1.75, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** Фирменный знак «керн» — цилиндр образца породы с напластованиями. */
export function IconKernMark(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="7" y="2.5" width="10" height="19" rx="3" />
      <path d="M7 9h10M7 14h10" />
    </Svg>
  );
}

export function IconDashboard(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="5" rx="1.5" />
      <rect x="13" y="12" width="8" height="9" rx="1.5" />
      <rect x="3" y="15" width="8" height="6" rx="1.5" />
    </Svg>
  );
}

export function IconSites(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </Svg>
  );
}

export function IconTeam(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="17.5" cy="8.5" r="2.3" />
      <path d="M16 14.2c2.6.5 4.5 2.7 4.5 5.8" />
    </Svg>
  );
}

export function IconPosition(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7 8V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2" />
      <rect x="3" y="8" width="18" height="12" rx="2" />
      <path d="M3 13h18" />
      <path d="M10 13v2h4v-2" />
    </Svg>
  );
}

export function IconTimesheetNew(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1Z" />
      <rect x="5" y="5" width="14" height="16" rx="2" />
      <path d="M9 12h4M9 16h6M12 11v4" />
    </Svg>
  );
}

export function IconTimesheetList(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1Z" />
      <rect x="5" y="5" width="14" height="16" rx="2" />
      <path d="M9 12h6M9 16h6" />
    </Svg>
  );
}

export function IconApprovals(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1Z" />
      <rect x="5" y="5" width="14" height="16" rx="2" />
      <path d="m9 13 2 2 4-4" />
    </Svg>
  );
}

export function IconPayroll(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2.5" y="6" width="19" height="13" rx="2" />
      <circle cx="12" cy="12.5" r="2.75" />
      <path d="M6 6V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
    </Svg>
  );
}

export function IconRateRules(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 6h16M4 12h16M4 18h16" />
      <circle cx="8" cy="6" r="1.8" fill="currentColor" stroke="none" />
      <circle cx="16" cy="12" r="1.8" fill="currentColor" stroke="none" />
      <circle cx="10" cy="18" r="1.8" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconAnalytics(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 20V10M11 20V4M18 20v-7" />
      <path d="M3 20h18" />
    </Svg>
  );
}

export function IconLogout(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
      <path d="M10 16.5 14.5 12 10 7.5" />
      <path d="M14 12H3" />
    </Svg>
  );
}

export function IconMenu(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </Svg>
  );
}

export function IconClose(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  );
}

export function IconChevronDown(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m6 9 6 6 6-6" />
    </Svg>
  );
}

export function IconChevronLeft(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m15 18-6-6 6-6" />
    </Svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function IconCheck(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m5 12.5 4.5 4.5L19 7" />
    </Svg>
  );
}

export function IconAlertTriangle(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.5 21.5 20h-19L12 3.5Z" />
      <path d="M12 10v4.2" />
      <circle cx="12" cy="17.3" r="0.9" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconInfo(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5" />
      <circle cx="12" cy="7.7" r="0.9" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconLock(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </Svg>
  );
}

export function IconWifi(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.5 9.5a13 13 0 0 1 17 0" />
      <path d="M6.5 13a9 9 0 0 1 11 0" />
      <path d="M9.7 16.3a4.5 4.5 0 0 1 4.6 0" />
      <circle cx="12" cy="19.2" r="1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconWifiOff(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.5 9.5c1.6-1.5 3.5-2.5 5.5-3M20.5 9.5a13 13 0 0 0-4-2.6" />
      <path d="M6.5 13a9 9 0 0 1 4-2.1M17.5 13a9 9 0 0 0-2.2-1.6" />
      <path d="M9.7 16.3a4.5 4.5 0 0 1 4.6 0" />
      <circle cx="12" cy="19.2" r="1" fill="currentColor" stroke="none" />
      <path d="M2.5 3.5l19 19" />
    </Svg>
  );
}

export function IconSun(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" />
    </Svg>
  );
}

export function IconMoon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5Z" />
    </Svg>
  );
}

export function IconMonitor(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="4" width="18" height="12" rx="1.5" />
      <path d="M8 20h8M12 16v4" />
    </Svg>
  );
}

export function IconTrash(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
      <path d="M10 11v6M14 11v6" />
    </Svg>
  );
}

export function IconArrowRight(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 12h16M13 5l7 7-7 7" />
    </Svg>
  );
}

export function IconUser(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="8" r="3.3" />
      <path d="M5 20c0-3.6 3.1-6.5 7-6.5s7 2.9 7 6.5" />
    </Svg>
  );
}

export function IconBriefcase(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="7.5" width="18" height="12" rx="2" />
      <path d="M8 7.5V6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1.5" />
      <path d="M3 12.5h18" />
    </Svg>
  );
}
