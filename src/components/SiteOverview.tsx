import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Clock, Gauge, Hourglass } from 'lucide-react'
import type { DrillingTask, Report } from '../types/database'
import { round2 } from '../lib/taskProgress'

// Обзор участка для руководства (30.09.2026): «что происходит на проекте» за
// один экран — ключевые цифры, светофор по скважинам, динамика за 14 дней и
// список того, что требует внимания. Чисто вычисляется из уже загруженных
// заданий и сводок участка, отдельных запросов к базе нет.

const DAY_MS = 86_400_000
const STALE_DAYS = 2

function isoDate(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function daysBetween(fromIso: string, to: Date) {
  const a = new Date(`${fromIso}T00:00:00`)
  const b = new Date(isoDate(to) + 'T00:00:00')
  return Math.round((b.getTime() - a.getTime()) / DAY_MS)
}

type Light = 'ok' | 'warn' | 'bad' | 'idle'

interface WellRow {
  task: DrillingTask
  known: number
  percent: number | null
  light: Light
  reason: string
  lastReportDate: string | null
}

function metersOf(r: Report) {
  return r.drilling_meters ?? 0
}

export default function SiteOverview({
  drillingTasks,
  reports,
}: {
  drillingTasks: DrillingTask[]
  reports: Report[]
}) {
  const today = new Date()
  const todayIso = isoDate(today)
  const counted = reports.filter(
    (r) => r.drilling_task_id != null && (r.approval_status === 'approved' || r.approval_status === 'submitted'),
  )

  const wells: WellRow[] = drillingTasks.map((task) => {
    const own = counted.filter((r) => r.drilling_task_id === task.id)
    const known = round2(own.reduce((s, r) => s + metersOf(r), 0))
    const lastReportDate = own.reduce<string | null>(
      (max, r) => (max == null || r.report_date > max ? r.report_date : max),
      null,
    )
    const percent = task.projected_depth ? Math.min(100, (known / task.projected_depth) * 100) : null

    let light: Light = 'idle'
    let reason = 'Не в работе'
    if (task.status === 'in_progress') {
      const silent = lastReportDate ? daysBetween(lastReportDate, today) : null
      const start = task.start_date ?? lastReportDate ?? todayIso
      const elapsed = Math.max(1, daysBetween(start, today) + 1)
      const planned =
        task.planned_daily_meters != null && task.projected_depth != null
          ? Math.min(task.planned_daily_meters * elapsed, task.projected_depth)
          : null
      if (task.projected_depth != null && known >= task.projected_depth) {
        light = 'ok'
        reason = 'Проектная глубина достигнута'
      } else if (task.projected_depth != null && known >= task.projected_depth * 0.99) {
        // Практически выполнено, но статус всё ещё «в работе» — подсказка
        // руководству закрыть задание (иначе скважина вечно «красная»).
        light = 'warn'
        reason = 'Глубина достигнута — завершите задание?'
      } else if (silent == null) {
        light = 'bad'
        reason = 'Сводок ещё не было'
      } else if (silent >= STALE_DAYS + 1) {
        light = 'bad'
        reason = `Нет сводок ${silent} дн.`
      } else if (planned != null && planned > 0) {
        const ratio = known / planned
        if (ratio >= 0.9) {
          light = 'ok'
          reason = ratio >= 1.02 ? 'Опережаем план' : 'В графике'
        } else if (ratio >= 0.7) {
          light = 'warn'
          reason = `Отстаём на ${round2(planned - known)} м`
        } else {
          light = 'bad'
          reason = `Отстаём на ${round2(planned - known)} м`
        }
      } else {
        light = 'ok'
        reason = 'Идёт бурение (план не задан)'
      }
    } else if (task.status === 'completed') {
      if (task.closed_reason === 'depth_reached') {
        light = 'ok'
        reason = 'Закрыта: достигнута глубина'
      } else if (task.closed_reason) {
        light = 'bad'
        reason = task.closed_reason === 'accident' ? 'Закрыта: авария' : 'Закрыта: ' + (task.closed_note ?? 'другое')
      } else {
        light = 'idle'
        reason = 'Завершена'
      }
    } else if (task.status === 'suspended') {
      reason = 'Приостановлена'
    } else {
      reason = 'Запланирована'
    }
    return { task, known, percent, light, reason, lastReportDate }
  })

  const inProgress = wells.filter((w) => w.task.status === 'in_progress')
  const plannedCount = wells.filter((w) => w.task.status === 'planned').length
  // План и «пробурено» считаем по скважинам, которые уже запущены (не запланированным)
  const totalPlan = drillingTasks.filter((t) => t.status !== 'planned').reduce((s, t) => s + (t.projected_depth ?? 0), 0)
  const totalKnown = round2(wells.reduce((s, w) => s + w.known, 0))

  // Последние 14 дней: метраж по дням (подтверждённые + на согласовании).
  const days: { iso: string; meters: number }[] = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today.getTime() - i * DAY_MS)
    days.push({ iso: isoDate(d), meters: 0 })
  }
  for (const r of counted) {
    const day = days.find((d) => d.iso === r.report_date)
    if (day) day.meters = round2(day.meters + metersOf(r))
  }
  const week = round2(days.slice(7).reduce((s, d) => s + d.meters, 0))
  const prevWeek = round2(days.slice(0, 7).reduce((s, d) => s + d.meters, 0))
  const weekDelta = round2(week - prevWeek)
  const dayMax = Math.max(1, ...days.map((d) => d.meters))

  const pending = reports.filter((r) => r.approval_status === 'submitted').length
  const rejected = reports.filter((r) => r.approval_status === 'rejected').length

  const attention = wells
    .filter((w) => w.light === 'bad' || w.light === 'warn')
    .sort((a, b) => (a.light === b.light ? 0 : a.light === 'bad' ? -1 : 1))

  const lightColor: Record<Light, string> = {
    ok: 'var(--color-success)',
    warn: 'var(--color-accent)',
    bad: 'var(--color-danger)',
    idle: 'var(--color-text-faint)',
  }

  const tiles = [
    {
      icon: Gauge,
      label: 'Пробурено',
      value: `${totalKnown}`,
      sub: totalPlan > 0 ? `из ${round2(totalPlan)} м (${Math.round((totalKnown / totalPlan) * 100)}%)` : 'м',
    },
    {
      icon: CheckCircle2,
      label: 'Скважин в работе',
      value: `${inProgress.length}`,
      sub: plannedCount > 0 ? `из ${drillingTasks.length} · запланировано ${plannedCount}` : `из ${drillingTasks.length}`,
    },
    {
      icon: Clock,
      label: 'За 7 дней',
      value: `${week} м`,
      sub:
        prevWeek > 0 || week > 0
          ? `${weekDelta >= 0 ? '+' : ''}${weekDelta} м к прошлой неделе`
          : 'сводок не было',
    },
    {
      icon: Hourglass,
      label: 'Ждут решения',
      value: `${pending}`,
      sub: rejected > 0 ? `+ ${rejected} отклонено` : 'сводок на согласовании',
    },
  ]

  if (drillingTasks.length === 0) return null

  return (
    <section style={{ display: 'grid', gap: 14, margin: '4px 0 26px' }} aria-label="Обзор участка">
      <div className="site-overview-tiles">
        {tiles.map((t) => (
          <div key={t.label} className="card" style={{ padding: '12px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--color-text-muted)' }}>
              <t.icon size={14} /> {t.label}
            </div>
            <div className="num" style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>
              {t.value}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--color-text-muted)' }}>{t.sub}</div>
          </div>
        ))}
      </div>

      <div className="site-overview-grid">
        <div className="card" style={{ padding: 14 }}>
          <h3 style={{ margin: '0 0 10px', fontSize: 15 }}>Скважины</h3>
          <div style={{ display: 'grid', gap: 2 }}>
            {wells.map((w) => (
              <Link
                key={w.task.id}
                to={`/tasks/drilling/${w.task.id}/dashboard`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '14px minmax(0,1fr) auto',
                  gap: 10,
                  alignItems: 'center',
                  padding: '9px 6px',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--color-text)',
                }}
              >
                <span
                  aria-hidden
                  style={{ width: 11, height: 11, borderRadius: '50%', background: lightColor[w.light] }}
                />
                <span style={{ minWidth: 0 }}>
                  <span style={{ fontWeight: 600 }}>№{w.task.well_number}</span>{' '}
                  <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{w.reason}</span>
                </span>
                <span className="num" style={{ fontSize: 13 }}>
                  {w.percent != null ? `${Math.round(w.percent)}%` : `${w.known} м`}
                </span>
              </Link>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 14 }}>
          <h3 style={{ margin: '0 0 10px', fontSize: 15 }}>Метраж за 14 дней</h3>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 96 }}>
            {days.map((d) => (
              <div
                key={d.iso}
                title={`${d.iso.slice(8, 10)}.${d.iso.slice(5, 7)}: ${d.meters} м`}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}
              >
                <div
                  style={{
                    height: `${Math.max(d.meters > 0 ? 4 : 1, (d.meters / dayMax) * 100)}%`,
                    background: d.meters > 0 ? 'var(--color-primary)' : 'var(--color-border)',
                    borderRadius: 3,
                  }}
                />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--color-text-faint)', marginTop: 4 }}>
            <span>{days[0].iso.slice(8, 10)}.{days[0].iso.slice(5, 7)}</span>
            <span>{days[13].iso.slice(8, 10)}.{days[13].iso.slice(5, 7)}</span>
          </div>
        </div>
      </div>

      {(attention.length > 0 || rejected > 0) && (
        <div className="card" style={{ padding: 14, borderColor: 'var(--color-accent)' }}>
          <h3 style={{ margin: '0 0 8px', fontSize: 15, display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertTriangle size={16} color="var(--color-accent)" /> Требует внимания
          </h3>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4, fontSize: 14 }}>
            {attention.map((w) => (
              <li key={w.task.id}>
                Скважина №{w.task.well_number}: {w.reason.toLowerCase()}
              </li>
            ))}
            {rejected > 0 && <li>Отклонённых сводок, ждут исправления бригадиром: {rejected}</li>}
          </ul>
        </div>
      )}
    </section>
  )
}
