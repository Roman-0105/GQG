import { useState } from 'react';

export interface DrillingProgressDay {
  date: string;
  plan: number;
  actual: number | null;
}

function niceScale(maxValue: number, ticks = 4): { max: number; step: number } {
  if (maxValue <= 0) return { max: ticks, step: 1 };
  const rough = maxValue / ticks;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / magnitude;
  let step: number;
  if (norm < 1.5) step = 1 * magnitude;
  else if (norm < 3) step = 2 * magnitude;
  else if (norm < 7) step = 5 * magnitude;
  else step = 10 * magnitude;
  return { max: step * ticks, step };
}

function formatShortDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
}

/**
 * План/факт бурения по дням — гистограмма (найдено при обсуждении с
 * владельцем): план строится автоматически от проектной глубины и
 * суточного плана (см. TasksService.progress), серый; факт — зелёный,
 * если день выполнен (>= план), иначе красный. Легенда цветов — сверху;
 * при наведении на столбец точные план/факт/дата читаются в строке
 * рядом с легендой (не floating-тултип — обрезался бы по вертикали
 * контейнером с горизонтальной прокруткой при большом числе дней).
 */
export function DrillingProgressChart({ days, height = 200 }: { days: DrillingProgressDay[]; height?: number }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const rawMax = Math.max(0, ...days.map((d) => Math.max(d.plan, d.actual ?? 0)));
  const { max, step } = niceScale(rawMax);
  const ticks = [0, step, step * 2, step * 3, step * 4];

  const barWidth = 28;
  const gap = 14;
  const leftAxisWidth = 50;
  const chartWidth = Math.max(200, days.length * (barWidth + gap));
  const hovered = hoverIndex != null ? days[hoverIndex] : null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-surface-2 ring-1 ring-inset ring-line" /> План
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-good" /> Факт, план выполнен
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-crit" /> Факт, отставание
          </span>
        </div>
        {/* Читаемая сводка по наведённому дню — не floating-тултип: при
            горизонтальной прокрутке узкого графика (overflow-x-auto)
            абсолютно позиционированная всплывашка обрезалась бы по
            вертикали, эта строка всегда на виду. */}
        <div className="min-h-[1.125rem] text-xs text-ink-muted">
          {hovered ? (
            <span>
              <span className="font-medium text-ink">{formatShortDate(hovered.date)}:</span> план{' '}
              <span className="font-mono text-ink">{hovered.plan} м</span> · факт{' '}
              <span className="font-mono text-ink">{hovered.actual != null ? `${hovered.actual} м` : '—'}</span>
            </span>
          ) : (
            'Наведите на столбец для значений по дню'
          )}
        </div>
      </div>

      <div className="flex">
        <div className="relative shrink-0" style={{ width: leftAxisWidth, height }}>
          {ticks
            .slice()
            .reverse()
            .map((t) => (
              <div key={t} className="absolute right-2 -translate-y-1/2 whitespace-nowrap text-[11px] text-ink-muted" style={{ top: height - (t / max) * height }}>
                {t}
              </div>
            ))}
        </div>

        <div className="min-w-0 flex-1 overflow-x-auto">
          <div style={{ width: chartWidth }}>
            <div className="relative" style={{ height }}>
              {ticks.map((t) => (
                <div key={t} className="absolute left-0 right-0 border-t border-line/70" style={{ top: height - (t / max) * height }} />
              ))}
              <div className="absolute inset-0 flex items-end" style={{ gap }}>
                {days.map((d, i) => {
                  const planHeight = max > 0 ? (d.plan / max) * height : 0;
                  const actualHeight = d.actual != null && max > 0 ? (d.actual / max) * height : 0;
                  const actualGood = d.actual != null && d.actual >= d.plan;
                  const isHovered = hoverIndex === i;
                  return (
                    <div
                      key={d.date}
                      className="relative flex items-end justify-center gap-0.5"
                      style={{ width: barWidth, height }}
                      onMouseEnter={() => setHoverIndex(i)}
                      onMouseLeave={() => setHoverIndex((v) => (v === i ? null : v))}
                    >
                      <div
                        role="img"
                        aria-label={`План ${formatShortDate(d.date)}: ${d.plan} м`}
                        className={`w-1/2 rounded-t ring-1 ring-inset ring-line transition-opacity ${isHovered ? 'bg-surface-2' : 'bg-surface-2/80'}`}
                        style={{ height: Math.max(planHeight, d.plan > 0 ? 2 : 0) }}
                      />
                      <div
                        role="img"
                        aria-label={`Факт ${formatShortDate(d.date)}: ${d.actual ?? 0} м`}
                        className={`w-1/2 rounded-t transition-opacity ${actualGood ? 'bg-good' : 'bg-crit'} ${isHovered ? '' : 'opacity-90'}`}
                        style={{ height: Math.max(actualHeight, d.actual != null && d.actual > 0 ? 2 : 0) }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-1.5 flex" style={{ gap }}>
              {days.map((d, i) => (
                <div
                  key={d.date}
                  className={`text-center text-[10px] transition-colors ${hoverIndex === i ? 'font-medium text-ink' : 'text-ink-muted'}`}
                  style={{ width: barWidth }}
                >
                  {formatShortDate(d.date)}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
