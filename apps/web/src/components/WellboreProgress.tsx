interface DayActual {
  date: string;
  actual: number | null;
}

function niceDepthStep(maxValue: number, targetTicks = 5): number {
  if (maxValue <= 0) return 1;
  const rough = maxValue / targetTicks;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / magnitude;
  if (norm < 1.5) return 1 * magnitude;
  if (norm < 3) return 2 * magnitude;
  if (norm < 7) return 5 * magnitude;
  return 10 * magnitude;
}

/**
 * Схема ствола скважины: буровая установка сверху, ствол проектной
 * глубины вниз со шкалой метража, закрашивается зелёным сверху вниз по
 * сумме суточной проходки из табеля, с тонкими линиями-делителями на
 * границе каждого отработанного дня (найдено при обсуждении с
 * владельцем — "видно прогресс по дням"). Чисто иллюстративная схема,
 * не инженерный чертёж.
 */
export function WellboreProgress({ projectedDepth, days, className = '' }: { projectedDepth: number; days: DayActual[]; className?: string }) {
  const cx = 58;
  const shaftHalfWidth = 17;
  const shaftTop = 132;
  const shaftBottom = 428;
  const shaftHeight = shaftBottom - shaftTop;

  const actualDays = days.filter((d): d is { date: string; actual: number } => d.actual != null && d.actual > 0);
  const totalActual = actualDays.reduce((sum, d) => sum + d.actual, 0);
  const fraction = projectedDepth > 0 ? Math.min(1, Math.max(0, totalActual / projectedDepth)) : 0;
  const fillHeight = shaftHeight * fraction;

  // Границы дней внутри закрашенного участка — накопительная глубина
  // на конец каждого дня, переведённая в пиксель по стволу.
  let cumulative = 0;
  const dayDividers = actualDays.map((d) => {
    cumulative += d.actual;
    return shaftTop + shaftHeight * Math.min(1, cumulative / (projectedDepth || 1));
  });
  dayDividers.pop(); // последняя граница = сам забой, её рисует пунктир ниже

  // Шкала метража справа от ствола
  const step = niceDepthStep(projectedDepth);
  const depthTicks: number[] = [];
  for (let v = 0; v <= projectedDepth + 0.001; v += step) depthTicks.push(Math.round(v));
  if (depthTicks[depthTicks.length - 1] < projectedDepth) depthTicks.push(Math.round(projectedDepth));

  // Буровая вышка — решётчатая мачта, сужающаяся к коронному блоку,
  // с горизонтальными поясами и раскосами, талевым блоком на канате и
  // основанием (приёмный мостик) над устьем — правдоподобнее, чем
  // просто "домик"-треугольник.
  const derrickBaseY = 128;
  const derrickTopY = 12;
  const baseHalfWidth = 40;
  const crownHalfWidth = 7;
  const legX = (y: number, side: 1 | -1) => {
    const t = (y - derrickTopY) / (derrickBaseY - derrickTopY);
    return cx + side * (crownHalfWidth + (baseHalfWidth - crownHalfWidth) * t);
  };
  const rungYs = [118, 101, 84, 67, 50, 33];

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <svg viewBox="0 0 190 440" width="170" height="393" className="text-ink-muted">
        {/* Мачта: две ноги от основания к коронному блоку */}
        <g stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <line x1={legX(derrickBaseY, -1)} y1={derrickBaseY} x2={legX(derrickTopY, -1)} y2={derrickTopY} />
          <line x1={legX(derrickBaseY, 1)} y1={derrickBaseY} x2={legX(derrickTopY, 1)} y2={derrickTopY} />
        </g>
        {/* Пояса и раскосы решётки */}
        <g stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round">
          {rungYs.map((y, i) => {
            const nextY = i === 0 ? derrickTopY : rungYs[i - 1];
            return (
              <g key={y}>
                <line x1={legX(y, -1)} y1={y} x2={legX(y, 1)} y2={y} />
                <line x1={legX(y, -1)} y1={y} x2={legX(nextY, 1)} y2={nextY} />
                <line x1={legX(y, 1)} y1={y} x2={legX(nextY, -1)} y2={nextY} />
              </g>
            );
          })}
        </g>
        {/* Коронный блок */}
        <rect x={cx - 9} y={derrickTopY - 4} width={18} height={9} rx={1.5} fill="currentColor" opacity={0.15} stroke="currentColor" strokeWidth="1.5" />
        <circle cx={cx - 4} cy={derrickTopY} r={2.2} fill="none" stroke="currentColor" strokeWidth="1.2" />
        <circle cx={cx + 4} cy={derrickTopY} r={2.2} fill="none" stroke="currentColor" strokeWidth="1.2" />
        {/* Талевый канат и талевый блок (грузоподъёмная тележка) */}
        <line x1={cx} y1={derrickTopY + 6} x2={cx} y2={72} stroke="currentColor" strokeWidth="1" />
        <rect x={cx - 6} y={72} width={12} height={10} rx={1.5} fill="currentColor" opacity={0.25} stroke="currentColor" strokeWidth="1.2" />
        <line x1={cx} y1={82} x2={cx} y2={derrickBaseY} stroke="currentColor" strokeWidth="1" strokeDasharray="2 2" />

        {/* Основание вышки / приёмный мостик */}
        <path
          d={`M ${cx - baseHalfWidth - 6} ${derrickBaseY} L ${cx + baseHalfWidth + 6} ${derrickBaseY} L ${cx + baseHalfWidth - 6} ${derrickBaseY + 12} L ${cx - baseHalfWidth + 6} ${derrickBaseY + 12} Z`}
          fill="currentColor"
          opacity={0.1}
          stroke="currentColor"
          strokeWidth="1.5"
        />
        {/* Устье скважины (роторный стол) */}
        <rect x={cx - shaftHalfWidth - 3} y={shaftTop - 8} width={(shaftHalfWidth + 3) * 2} height={9} rx={1.5} fill="currentColor" opacity={0.35} />

        {/* Ствол скважины — обсадная колонна (контур) */}
        <rect x={cx - shaftHalfWidth} y={shaftTop} width={shaftHalfWidth * 2} height={shaftHeight} rx={3} fill="none" stroke="currentColor" strokeWidth="2" />

        {/* Пройденный метраж — заливка сверху вниз */}
        {fillHeight > 0 && (
          <rect x={cx - shaftHalfWidth} y={shaftTop} width={shaftHalfWidth * 2} height={fillHeight} rx={3} className="fill-good" opacity={0.8} />
        )}

        {/* Делители по дням — граница каждого отработанного дня внутри проходки */}
        {dayDividers.map((y, i) => (
          <line key={i} x1={cx - shaftHalfWidth + 2} y1={y} x2={cx + shaftHalfWidth - 2} y2={y} className="stroke-surface" strokeWidth="1" opacity={0.9} />
        ))}

        {/* Забой — текущая глубина */}
        {fraction > 0 && fraction < 1 && (
          <line x1={cx - shaftHalfWidth - 7} y1={shaftTop + fillHeight} x2={cx + shaftHalfWidth + 7} y2={shaftTop + fillHeight} className="stroke-good" strokeWidth="2" strokeDasharray="3 2" />
        )}

        {/* Шкала метража */}
        <g>
          <line x1={cx + shaftHalfWidth + 14} y1={shaftTop} x2={cx + shaftHalfWidth + 14} y2={shaftBottom} stroke="currentColor" strokeWidth="1" opacity={0.5} />
          {depthTicks.map((v) => {
            const y = shaftTop + shaftHeight * Math.min(1, v / (projectedDepth || 1));
            return (
              <g key={v}>
                <line x1={cx + shaftHalfWidth + 11} y1={y} x2={cx + shaftHalfWidth + 17} y2={y} stroke="currentColor" strokeWidth="1" opacity={0.6} />
                <text x={cx + shaftHalfWidth + 20} y={y + 3} fontSize={9} fill="currentColor" opacity={0.75}>
                  {v}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      <div className="-mt-2 space-y-0.5 text-center text-xs">
        <p className="font-mono font-medium text-good">{Math.round(totalActual * 10) / 10} м</p>
        <p className="text-ink-muted">из {Math.round(projectedDepth * 10) / 10} м проектных</p>
      </div>
    </div>
  );
}
