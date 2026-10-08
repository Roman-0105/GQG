import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { ChevronLeft, Printer } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { isManagement } from '../../types/roles'
import { loadWellReportData, formatDateRu, type WellReportData } from '../../lib/wellReportData'
import { drillDiameterMm } from '../../lib/drillDiameters'
import ReportLocatorMap, { type LocatorBase } from '../../components/report/ReportLocatorMap'
import { round2 } from '../../lib/taskProgress'
import { CLOSED_REASON_LABELS } from '../../types/database'
import {
  DailyBarsChart,
  Donut,
  HBars,
  Legend,
  MASTER_COLORS,
  ShiftHeatmap,
  StructureDiagram,
  shortName,
} from '../../components/report/ReportCharts'

const ROWS_PER_PAGE = 30
const A4_PX = 794

// Промежуточный отчёт по скважине (06.10.2026): страницы A4 верстаются прямо в
// приложении и сохраняются в PDF через печать браузера («Сохранить как PDF») —
// всё остаётся векторным, шрифт и кириллица те же, что в интерфейсе.
export default function WellReportPrint() {
  const { taskId } = useParams<{ taskId: string }>()
  const [search, setSearch] = useSearchParams()
  const { session, profile, loading: authLoading } = useAuth()
  const [data, setData] = useState<WellReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [scale, setScale] = useState(1)
  const withCosts = search.get('costs') === '1'
  const mapBase: LocatorBase = search.get('map') === 'osm' ? 'osm' : 'sat'

  useEffect(() => {
    if (!session || !taskId || !isManagement(profile?.role)) return
    let cancelled = false
    loadWellReportData(taskId).then((d) => {
      if (!cancelled) {
        setData(d)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [session, taskId, profile])

  useEffect(() => {
    const upd = () => setScale(Math.min(1, (window.innerWidth - 24) / A4_PX))
    upd()
    window.addEventListener('resize', upd)
    return () => window.removeEventListener('resize', upd)
  }, [])

  const colorMap = useMemo(() => {
    const m = new Map<string, string>()
    data?.masters.forEach((x, i) => m.set(x.id, MASTER_COLORS[i % MASTER_COLORS.length]))
    return m
  }, [data])
  const colorOf = (id: string) => colorMap.get(id) ?? '#7d868c'

  if (authLoading) return <p>Загрузка…</p>
  if (!session) return <Navigate to="/login" replace />
  if (!isManagement(profile?.role)) return <p>Отчёты доступны только гендиру/техдиру.</p>

  const pages: { title: string; node: ReactNode }[] = []
  if (data) buildPages(data, withCosts, colorOf, pages, mapBase)

  return (
    <div className="rp-root">
      <div className="rp-toolbar no-print">
        <Link to="/reports/summary" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
          <ChevronLeft size={15} /> К отчётам
        </Link>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, color: 'var(--color-text)' }}>
          <input
            type="checkbox"
            checked={withCosts}
            onChange={(e) => {
              const next = new URLSearchParams(search)
              if (e.target.checked) next.set('costs', '1')
              else next.delete('costs')
              setSearch(next, { replace: true })
            }}
            style={{ width: 'auto' }}
          />
          Включить затраты
        </label>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span className="text-muted" style={{ fontSize: 12 }}>Карта:</span>
          {([['sat', 'Спутник'], ['osm', 'Схема']] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              className={mapBase === k ? undefined : 'btn-outline'}
              onClick={() => {
                const next = new URLSearchParams(search)
                if (k === 'sat') next.delete('map')
                else next.set('map', 'osm')
                setSearch(next, { replace: true })
              }}
              style={{ minHeight: 34, padding: '4px 12px', fontSize: 13 }}
            >
              {label}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => window.print()} disabled={!data} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginLeft: 'auto' }}>
          <Printer size={15} /> Скачать PDF / печать
        </button>
        <div className="text-muted" style={{ fontSize: 12, flexBasis: '100%' }}>
          В окне печати выберите принтер «Сохранить как PDF», формат A4, поля «Нет», включите «Фон графики».
        </div>
      </div>

      {loading ? (
        <p>Собираем отчёт…</p>
      ) : !data ? (
        <p className="text-error">Скважина не найдена.</p>
      ) : (
        <div className="rp-pages" style={{ zoom: scale }}>
          {pages.map((p, i) => (
            <section key={i} className="rp-page">
              {i > 0 && (
                <header className="rp-head">
                  <img src={`${import.meta.env.BASE_URL}logo.png`} alt="" width={26} height={26} />
                  <span>GEO QUEST GROUP · скважина №{data.task.well_number}</span>
                  <span className="rp-head-title">{p.title}</span>
                </header>
              )}
              <div className="rp-body">{p.node}</div>
              <footer className="rp-foot">
                <span>Промежуточный отчёт по бурению · сформирован {formatDateRu(data.generatedAt)}</span>
                <span>
                  {i + 1} / {pages.length}
                </span>
              </footer>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function Kpi({ label, value, unit, sub }: { label: string; value: ReactNode; unit?: string; sub?: string }) {
  return (
    <div className="rp-kpi">
      <div className="rp-kpi-label">{label}</div>
      <div className="rp-kpi-value num">
        {value}
        {unit && <span className="rp-kpi-unit"> {unit}</span>}
      </div>
      {sub && <div className="rp-kpi-sub">{sub}</div>}
    </div>
  )
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="rp-h2">{children}</h2>
}

function buildPages(d: WellReportData, withCosts: boolean, colorOf: (id: string) => string, pages: { title: string; node: ReactNode }[], mapBase: LocatorBase) {
  const t = d.task
  const tot = d.totals
  const periodFrom = d.days[0]?.date ?? t.start_date
  const periodTo = d.days[d.days.length - 1]?.date ?? null
  const closed = t.closed_reason ? CLOSED_REASON_LABELS[t.closed_reason] : null
  const statusLabel = closed ? `Закрыта: ${closed.toLowerCase()}` : t.status === 'in_progress' ? 'В работе' : t.status === 'suspended' ? 'Приостановлена' : t.status === 'planned' ? 'Запланирована' : 'Завершена'

  // 1. Титул
  pages.push({
    title: 'Титул',
    node: (
      <div className="rp-title">
        <img src={`${import.meta.env.BASE_URL}logo.png`} alt="GEO QUEST GROUP" width={150} height={150} />
        <div className="rp-title-company">GEO QUEST GROUP</div>
        <h1 className="rp-title-h1">Промежуточный отчёт по бурению</h1>
        <div className="rp-title-well">Скважина №{t.well_number}</div>
        <div className="rp-title-meta">
          <div><span>Участок</span>{d.siteName}</div>
          <div><span>Период</span>{formatDateRu(periodFrom)} — {formatDateRu(periodTo)}</div>
          <div><span>Статус</span>{statusLabel}</div>
          <div><span>Буровая организация</span>{d.orgName ?? '—'}</div>
          <div><span>Станок</span>{d.rigLabel ?? '—'}</div>
          <div><span>Ответственный</span>{d.foremanName ?? '—'}</div>
          <div><span>Проектная глубина</span>{t.projected_depth ? `${round2(t.projected_depth)} м` : '—'}</div>
          <div><span>Учтены</span>только согласованные сводки</div>
        </div>
        {t.coord_wgs84_lat != null && t.coord_wgs84_lon != null && (
          <div className="rp-title-map">
            <ReportLocatorMap base={mapBase} boundary={d.siteBoundary} wells={d.siteWells} currentId={t.id} height={230} />
            <div className="rp-title-map-cap">
              Расположение скважины №{t.well_number}: {t.coord_wgs84_lat.toFixed(5)}°, {t.coord_wgs84_lon.toFixed(5)}° (WGS84)
            </div>
          </div>
        )}
        <div className="rp-title-date">Сформирован {formatDateRu(d.generatedAt)}</div>
      </div>
    ),
  })

  // 2. Итоги
  const shiftSlices = [
    { label: 'Смена 1', value: tot.shift1, color: 'var(--color-primary)' },
    { label: 'Смена 2', value: tot.shift2, color: '#6f96b8' },
  ]
  pages.push({
    title: 'Ключевые показатели',
    node: (
      <>
        <SectionTitle>Ключевые показатели</SectionTitle>
        <div className="rp-two">
          <div style={{ display: 'grid', justifyItems: 'center', gap: 6 }}>
            <Donut size={190} slices={[{ label: 'Пробурено', value: tot.percent ?? 0, color: 'var(--color-primary)' }, { label: 'Остаток', value: Math.max(0, 100 - (tot.percent ?? 0)), color: 'transparent' }]} center={tot.percent != null ? `${Math.round(tot.percent)}%` : '—'} sub="проектной глубины" />
            <div className="num" style={{ fontSize: 13 }}>
              {round2(tot.meters)} м из {t.projected_depth ? `${round2(t.projected_depth)} м` : '—'}
            </div>
          </div>
          <div className="rp-kpis">
            <Kpi label="Пробурено" value={round2(tot.meters)} unit="м" />
            <Kpi label="Средний темп" value={tot.pace} unit="м/сут" sub={`за ${tot.daysElapsed} дн. с начала`} />
            <Kpi label="Смен отработано" value={tot.shifts} sub={`дней с бурением: ${tot.activeDays}`} />
            <Kpi label="Часы работы" value={tot.hours} unit="ч" />
            <Kpi label="Лучшая смена" value={tot.bestShift ? tot.bestShift.meters : '—'} unit="м" sub={tot.bestShift ? `${formatDateRu(tot.bestShift.date)}, смена ${tot.bestShift.shift ?? 1}` : undefined} />
            <Kpi
              label={tot.planDeviation == null ? 'План' : tot.planDeviation >= 0 ? 'Опережение плана' : 'Отставание от плана'}
              value={tot.planDeviation == null ? '—' : `${tot.planDeviation > 0 ? '+' : ''}${tot.planDeviation}`}
              unit={tot.planDeviation == null ? undefined : 'м'}
              sub={t.planned_daily_meters != null ? `план ${t.planned_daily_meters} м/сут` : 'план не задан'}
            />
          </div>
        </div>

        <SectionTitle>Проходка по сменам</SectionTitle>
        <div className="rp-two">
          <div style={{ display: 'grid', justifyItems: 'center' }}>
            <Donut size={150} slices={shiftSlices} center={`${round2(tot.shift1 + tot.shift2)}`} sub="м всего" />
          </div>
          <Legend slices={shiftSlices} />
        </div>

        <SectionTitle>Состояние скважины</SectionTitle>
        <div className="rp-note">
          <div>Прогноз завершения: <b>{tot.forecast ?? (closed ? 'скважина закрыта' : '—')}</b></div>
          {closed && (
            <div>
              Закрытие: <b>{formatDateRu(t.closed_at)}</b>, {closed.toLowerCase()}
              {t.closed_note ? ` — ${t.closed_note}` : ''}
            </div>
          )}
          {d.casings.length > 0 && (
            <div>Обсадка: <b>{d.casings.map((c) => `${c.code} до ${c.depth} м`).join(', ')}</b></div>
          )}
          {t.angle != null && <div>Угол / азимут: <b>{t.angle}° / {t.azimuth ?? '—'}°</b></div>}
        </div>
      </>
    ),
  })

  // 3. Конструкция
  pages.push({
    title: 'Конструкция скважины',
    node: (
      <>
        <SectionTitle>Конструкция скважины</SectionTitle>
        <div className="rp-struct">
          <StructureDiagram data={d} colorOf={colorOf} />
        </div>
        <div className="rp-mini-legend">
          {d.masters.map((m) => (
            <span key={m.id}><i style={{ background: colorOf(m.id) }} />{shortName(m.name)}</span>
          ))}
          <span className="text-muted">цветная полоса слева от колонны — кто пробурил участок</span>
        </div>
        <table className="rp-table">
          <thead>
            <tr><th>Интервал, м</th><th>Диаметр</th><th>Пробурено, м</th><th>Период</th><th>Мастера</th></tr>
          </thead>
          <tbody>
            {d.intervals.map((iv, i) => (
              <tr key={i}>
                <td className="num">{round2(iv.from)}–{round2(iv.to)}</td>
                <td>{iv.code ? `${iv.code} · ${drillDiameterMm(iv.code) ?? '?'} мм` : '—'}</td>
                <td className="num">{round2(iv.meters)}</td>
                <td className="num">{iv.dateFrom ? `${formatDateRu(iv.dateFrom)}–${formatDateRu(iv.dateTo)}` : '—'}</td>
                <td>{iv.masters.map((m) => `${shortName(m.name)} (${round2(m.meters)} м)`).join(', ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    ),
  })

  // 4. Динамика
  const markers = d.events
    .filter((e) => e.kind === 'diameter' || e.kind === 'closure' || e.kind === 'reaming' || e.kind === 'casing')
    .slice(0, 12)
    .map((e, i) => ({ date: e.date, label: String(i + 1) }))
  const markerEvents = d.events.filter((e) => e.kind === 'diameter' || e.kind === 'closure' || e.kind === 'reaming' || e.kind === 'casing').slice(0, 12)
  pages.push({
    title: 'Динамика бурения',
    node: (
      <>
        <SectionTitle>Динамика бурения</SectionTitle>
        <p className="rp-lead">Столбики — метры за день (смена 1 и смена 2 стопкой). Зелёная линия — среднее за 7 дней, оранжевая — накопленная проходка (правая шкала), серый пунктир — план.</p>
        <DailyBarsChart days={d.days} markers={markers} projectedDepth={t.projected_depth} width={720} height={380} />
        {markerEvents.length > 0 && (
          <ol className="rp-marker-list">
            {markerEvents.map((e, i) => (
              <li key={i}><b>{i + 1}</b> {formatDateRu(e.date)} — {e.text}</li>
            ))}
          </ol>
        )}
        <SectionTitle>Календарь смен</SectionTitle>
        <ShiftHeatmap days={d.days} />
      </>
    ),
  })

  // недельные итоги для страницы «Кто бурил»
  const weekly: { label: string; value: number }[] = []
  for (let i = 0; i < d.days.length; i += 7) {
    const chunk = d.days.slice(i, i + 7)
    weekly.push({ label: `${formatDateRu(chunk[0].date).slice(0, 5)}–${formatDateRu(chunk[chunk.length - 1].date).slice(0, 5)}`, value: round2(chunk.reduce((a, r) => a + r.total, 0)) })
  }

  // 5. Кто бурил
  const masterSlices = d.masters.map((m) => ({ label: shortName(m.name), value: m.meters, color: colorOf(m.id) }))
  pages.push({
    title: 'Кто бурил',
    node: (
      <>
        <SectionTitle>Кто бурил</SectionTitle>
        <table className="rp-table">
          <thead>
            <tr><th>Мастер</th><th>Период</th><th>Смен</th><th>Метров</th><th>Часы</th><th>Темп, м/сут</th></tr>
          </thead>
          <tbody>
            {d.masters.map((m) => (
              <tr key={m.id}>
                <td><i className="rp-dot" style={{ background: colorOf(m.id) }} />{m.name}</td>
                <td className="num">{formatDateRu(m.firstDate)}–{formatDateRu(m.lastDate)}</td>
                <td className="num">{m.shifts}</td>
                <td className="num">{round2(m.meters)}</td>
                <td className="num">{m.hours}</td>
                <td className="num">{m.pace}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="rp-two" style={{ marginTop: 18 }}>
          <div style={{ display: 'grid', justifyItems: 'center' }}>
            <Donut size={170} slices={masterSlices} center={`${round2(tot.meters)}`} sub="м всего" />
          </div>
          <HBars items={d.masters.map((m) => ({ label: shortName(m.name), value: m.meters, color: colorOf(m.id), note: `${m.shifts} см.` }))} />
        </div>
        <SectionTitle>Проходка по неделям</SectionTitle>
        <HBars items={weekly.slice(-12).map((w) => ({ label: w.label, value: w.value, color: 'var(--color-primary)' }))} />
        {d.brigades.length > 0 && (
          <>
            <SectionTitle>Бригады мастеров по периодам</SectionTitle>
            <table className="rp-table rp-table-tight">
              <thead>
                <tr><th>Мастер</th><th>Работник</th><th>Должность</th><th>С</th><th>По</th></tr>
              </thead>
              <tbody>
                {d.brigades.slice(0, 24).map((b, i) => (
                  <tr key={i}>
                    <td>{shortName(b.masterName)}</td>
                    <td>{b.worker}</td>
                    <td>{b.position}</td>
                    <td className="num">{formatDateRu(b.from)}</td>
                    <td className="num">{b.to ? formatDateRu(b.to) : 'по н.в.'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
        {d.crew.length > 0 && (
          <>
            <SectionTitle>Буровая бригада</SectionTitle>
            <table className="rp-table">
              <thead>
                <tr><th>Роль</th><th>Смена</th><th>Работник</th><th>С</th><th>По</th></tr>
              </thead>
              <tbody>
                {d.crew.map((c, i) => (
                  <tr key={i}>
                    <td>{c.role}</td>
                    <td className="num">{c.shift ?? '—'}</td>
                    <td>{c.name}</td>
                    <td className="num">{formatDateRu(c.from)}</td>
                    <td className="num">{c.to ? formatDateRu(c.to) : 'по н.в.'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </>
    ),
  })

  // 6+. Таблица по дням
  const chunks: typeof d.days[] = []
  for (let i = 0; i < d.days.length; i += ROWS_PER_PAGE) chunks.push(d.days.slice(i, i + ROWS_PER_PAGE))
  chunks.forEach((chunk, ci) => {
    pages.push({
      title: 'Проходка по дням',
      node: (
        <>
          <SectionTitle>Проходка по дням{chunks.length > 1 ? ` (${ci + 1}/${chunks.length})` : ''}</SectionTitle>
          <table className="rp-table rp-table-tight">
            <thead>
              <tr><th>Дата</th><th>Смена 1</th><th>Смена 2</th><th>Итого, м</th><th>Накопл., м</th><th>План, м</th><th>Откл., м</th></tr>
            </thead>
            <tbody>
              {chunk.map((r) => (
                <tr key={r.date}>
                  <td className="num">{formatDateRu(r.date)}</td>
                  <td className="num">{r.s1 ?? '—'}</td>
                  <td className="num">{r.s2 ?? '—'}</td>
                  <td className="num"><b>{r.total}</b></td>
                  <td className="num">{r.cum}</td>
                  <td className="num">{r.plan ?? '—'}</td>
                  <td className="num" style={{ color: r.plan == null ? undefined : r.cum - r.plan >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                    {r.plan == null ? '—' : `${r.cum - r.plan > 0 ? '+' : ''}${round2(r.cum - r.plan)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ),
    })
  })

  // Затраты (по галочке)
  if (withCosts) {
    pages.push({
      title: 'Затраты',
      node: (
        <>
          <SectionTitle>Затраты по статьям</SectionTitle>
          {d.costs.length === 0 ? (
            <p className="text-muted">Затрат по согласованным сводкам нет.</p>
          ) : (
            <table className="rp-table">
              <thead><tr><th>Статья</th><th>Количество</th></tr></thead>
              <tbody>
                {d.costs.map((c) => (
                  <tr key={c.name}><td>{c.name}</td><td className="num">{c.quantity}{c.unit ? ` ${c.unit}` : ''}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      ),
    })
  }

  // Геология
  if (d.geology.any) {
    pages.push({
      title: 'Геологическая документация',
      node: (
        <>
          <SectionTitle>Геологическая документация и опробование</SectionTitle>
          <div className="rp-kpis" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <Kpi label="Описание керна" value={d.geology.core} unit="м" />
            <Kpi label="Фотофиксация" value={d.geology.photo} unit="м" />
            <Kpi label="Распиловка" value={d.geology.sawn} unit="м" />
            <Kpi label="Проб отобрано" value={d.geology.taken} />
            <Kpi label="Проб сдано" value={d.geology.submitted} />
          </div>
          {d.samples.length > 0 && (
            <>
              <SectionTitle>Пробы по видам</SectionTitle>
              <table className="rp-table">
                <thead><tr><th>Вид пробы</th><th>Количество</th></tr></thead>
                <tbody>{d.samples.map((s) => (<tr key={s.name}><td>{s.name}</td><td className="num">{s.quantity}</td></tr>))}</tbody>
              </table>
            </>
          )}
        </>
      ),
    })
  }

  // События и подпись
  pages.push({
    title: 'Хронология и подпись',
    node: (
      <>
        <SectionTitle>Хронология событий</SectionTitle>
        <ul className="rp-timeline">
          {d.events.map((e, i) => (
            <li key={i}><span className="num">{formatDateRu(e.date)}</span> {e.text}</li>
          ))}
        </ul>
        <SectionTitle>Согласование</SectionTitle>
        <div className="rp-note">
          <div>Согласованных сводок в отчёте: <b>{tot.shifts}</b></div>
          <div>Сводки, не прошедшие согласование, в расчёт не входят.</div>
        </div>
        <div className="rp-sign">
          <div><span>Подготовил</span></div>
          <div><span>Проверил</span></div>
          <div><span>Утвердил</span></div>
        </div>
      </>
    ),
  })
}
