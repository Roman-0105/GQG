/**
 * Лёгкий читаемый столбчатый график без внешней библиотеки: шкала с
 * делениями и подписями значений, а не голые CSS-полоски без осей
 * (см. .claude/agents/designer.md, пункт «Графики»). Один компонент —
 * переиспользуется, а не рисуется заново на каждой странице аналитики.
 *
 * Ось Y закреплена слева, столбцы и подписи по оси X скроллятся вместе
 * в одном контейнере — иначе при большом числе колонок (например,
 * месяц по дням) полосы и их подписи разъезжаются при горизонтальной
 * прокрутке.
 */
export interface BarChartPoint {
  label: string;
  value: number;
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

export function BarChart({
  data,
  formatValue = (v) => v.toLocaleString('ru-RU'),
  height = 200,
}: {
  data: BarChartPoint[];
  formatValue?: (v: number) => string;
  height?: number;
}) {
  const rawMax = Math.max(0, ...data.map((d) => d.value));
  const { max, step } = niceScale(rawMax);
  const ticks = [0, step, step * 2, step * 3, step * 4];

  const barWidth = 28;
  const gap = 14;
  const leftAxisWidth = 60;
  const chartWidth = Math.max(200, data.length * (barWidth + gap));
  const showValueLabels = data.length <= 16;

  return (
    <div className="flex">
      {/* Ось Y — не скроллится, всегда на виду */}
      <div className="relative shrink-0" style={{ width: leftAxisWidth, height }}>
        {ticks
          .slice()
          .reverse()
          .map((t) => (
            <div
              key={t}
              className="absolute right-3 -translate-y-1/2 whitespace-nowrap text-[11px] text-ink-muted"
              style={{ top: height - (t / max) * height }}
            >
              {formatValue(t)}
            </div>
          ))}
      </div>

      {/* Столбцы и подписи X — один общий скролл, чтобы не расходиться */}
      <div className="min-w-0 flex-1 overflow-x-auto">
        <div style={{ width: chartWidth }}>
          <div className="relative" style={{ height }}>
            {ticks.map((t) => (
              <div
                key={t}
                className="absolute left-0 right-0 border-t border-line/70"
                style={{ top: height - (t / max) * height }}
              />
            ))}
            <div className="absolute inset-0 flex items-end" style={{ gap }}>
              {data.map((d, i) => {
                const barHeight = max > 0 ? (d.value / max) * height : 0;
                return (
                  <div key={i} className="flex flex-col items-center justify-end" style={{ width: barWidth, height }}>
                    {showValueLabels && d.value > 0 && (
                      <span className="mb-1 whitespace-nowrap text-[10px] font-mono text-ink-muted">
                        {formatValue(d.value)}
                      </span>
                    )}
                    <div
                      role="img"
                      aria-label={`${d.label}: ${formatValue(d.value)}`}
                      title={`${d.label}: ${formatValue(d.value)}`}
                      className="w-full rounded-t bg-accent"
                      style={{ height: Math.max(barHeight, d.value > 0 ? 2 : 0) }}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-1.5 flex" style={{ gap }}>
            {data.map((d, i) => (
              <div key={i} className="text-center text-[11px] text-ink-muted" style={{ width: barWidth }}>
                {d.label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
