import { useEffect, useState } from 'react'
import type { ReactElement } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ClipboardCheck, AlertTriangle, CalendarClock, ChevronRight, ChevronDown, Mountain, Layers, Scissors, FlaskConical } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { ROLE_LABELS, isManagement } from '../types/roles'
import { useReportCounts } from '../hooks/useReportCounts'
import { riseIn } from '../lib/motionVariants'
import { coreProgress, sawingProgress, samplingProgress } from '../lib/taskProgress'
import ProgressBar from '../components/ProgressBar'
import CircularProgress from '../components/CircularProgress'
import type { CoreDescriptionTask, CoreSawingTask, DrillingTask, Report, SamplingTask, Site } from '../types/database'
import type { TaskType } from '../types/taskType'

const LIST_LIMIT = 4

// Список "требует внимания" может разрастись (десяток заданий на участке —
// десяток строк) — сворачиваем в первые LIST_LIMIT с разворотом по клику,
// вместо длинной простыни на весь экран (см. отзыв 17.09.2026).
function ExpandableList<T>({ items, renderItem }: { items: T[]; renderItem: (item: T) => ReactElement }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? items : items.slice(0, LIST_LIMIT)
  return (
    <>
      <ul>{visible.map(renderItem)}</ul>
      {items.length > LIST_LIMIT && (
        <button
          type="button"
          className="btn-outline"
          onClick={() => setExpanded((v) => !v)}
          style={{
            marginTop: 8,
            fontSize: 12.5,
            padding: '5px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
          }}
        >
          <ChevronDown size={13} style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .15s ease' }} />
          {expanded ? 'Свернуть' : `Показать ещё ${items.length - LIST_LIMIT}`}
        </button>
      )}
    </>
  )
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function greeting() {
  const h = new Date().getHours()
  if (h < 5) return 'Доброй ночи'
  if (h < 12) return 'Доброе утро'
  if (h < 18) return 'Добрый день'
  return 'Добрый вечер'
}

interface RevisionItem {
  reportId: string
  taskType: TaskType
  taskId: string
  label: string
  reviewComment: string | null
}

interface ReminderItem {
  taskType: TaskType
  taskId: string
  label: string
  shift: number | null
}

// Сводный прогресс участка (25.09.2026, фаза 3 редизайна) — раньше
// карточка участка на дашборде показывала прогресс ТОЛЬКО по бурению,
// хотя на участке могут идти ещё керн/распиловка/опробование. Главный
// индикатор (кольцо + основной ProgressBar) остаётся бурением — это
// по-прежнему самая "тяжёлая"/показательная метрика, и переименовывать
// уже знакомую заказчику метрику не нужно. Остальные виды работ —
// компактной строкой чипов ПОД основным баром, только если реально
// присутствуют на этом участке (см. рендер карточки ниже).
interface SiteProgress {
  approved: number
  plan: number
  core?: { approved: number; plan: number }
  sawing?: { approved: number; plan: number }
  sampling?: { taken: number; submitted: number }
}

// Дашборд = точка входа "выбор проекта" (см. ТЗ, обсуждение 17.09.2026):
// карточки участков с общим прогрессом, ниже — то, что требует внимания
// прямо сейчас (сводки на исправление у бригадира, на согласовании у
// техдира/гендира). Прогресс по конкретному заданию — на его собственном
// дашборде (src/routes/tasks/TaskDashboard.tsx), сюда попадает через
// /sites/:id.
export default function Dashboard() {
  const { session, profile, profileError, loading, signOut } = useAuth()
  const { pendingApprovals } = useReportCounts()

  const [sites, setSites] = useState<Site[]>([])
  const [siteProgress, setSiteProgress] = useState<Map<string, SiteProgress>>(new Map())
  const [revisionItems, setRevisionItems] = useState<RevisionItem[]>([])
  const [reminderItems, setReminderItems] = useState<ReminderItem[]>([])
  const [loadingData, setLoadingData] = useState(true)

  useEffect(() => {
    if (!session || !profile) return

    async function load() {
      setLoadingData(true)

      const [sitesRes, drillingRes, coreRes, sawingRes, samplingRes, reportsRes] = await Promise.all([
        supabase.from('sites').select('*').order('created_at', { ascending: false }),
        supabase.from('drilling_tasks').select('*'),
        supabase.from('core_description_tasks').select('*'),
        supabase.from('core_sawing_tasks').select('*'),
        supabase.from('sampling_tasks').select('*'),
        supabase.from('reports').select('*'),
      ])

      setSites(sitesRes.data ?? [])

      const drillingTasks = (drillingRes.data ?? []) as DrillingTask[]
      const coreTasks = (coreRes.data ?? []) as CoreDescriptionTask[]
      const sawingTasks = (sawingRes.data ?? []) as CoreSawingTask[]
      const samplingTasks = (samplingRes.data ?? []) as SamplingTask[]

      const reports = (reportsRes.data ?? []) as Report[]

      const progress = new Map<string, SiteProgress>()
      for (const t of drillingTasks) {
        const entry = progress.get(t.site_id) ?? { approved: 0, plan: 0 }
        entry.plan += t.projected_depth ?? 0
        progress.set(t.site_id, entry)
      }
      for (const r of reports) {
        if (r.approval_status !== 'approved') continue
        const entry = progress.get(r.site_id) ?? { approved: 0, plan: 0 }
        entry.approved += r.drilling_meters ?? 0
        progress.set(r.site_id, entry)
      }

      // Керн/распиловка/опробование — те же формулы, что на дашборде
      // задания и на карточке участка (src/lib/taskProgress.ts), просто
      // просуммированные по ВСЕМ заданиям этого вида на участке, не по
      // одному заданию.
      for (const t of coreTasks) {
        const plan = t.drilling_task_id
          ? (drillingTasks.find((d) => d.id === t.drilling_task_id)?.projected_depth ?? 0)
          : (t.external_projected_depth ?? 0)
        const { core } = coreProgress(t.id, reports)
        const entry = progress.get(t.site_id) ?? { approved: 0, plan: 0 }
        const sub = entry.core ?? { approved: 0, plan: 0 }
        sub.approved += core
        sub.plan += plan
        entry.core = sub
        progress.set(t.site_id, entry)
      }
      for (const t of sawingTasks) {
        const plan = drillingTasks.find((d) => d.id === t.drilling_task_id)?.projected_depth ?? 0
        const approved = sawingProgress(t.id, reports)
        const entry = progress.get(t.site_id) ?? { approved: 0, plan: 0 }
        const sub = entry.sawing ?? { approved: 0, plan: 0 }
        sub.approved += approved
        sub.plan += plan
        entry.sawing = sub
        progress.set(t.site_id, entry)
      }
      for (const t of samplingTasks) {
        const { taken, submitted } = samplingProgress(t.id, reports)
        const entry = progress.get(t.site_id) ?? { approved: 0, plan: 0 }
        const sub = entry.sampling ?? { taken: 0, submitted: 0 }
        sub.taken += taken
        sub.submitted += submitted
        entry.sampling = sub
        progress.set(t.site_id, entry)
      }
      setSiteProgress(progress)

      if (profile?.role === 'party_chief') {
        const rejected = (reportsRes.data ?? []).filter(
          (r) => r.approval_status === 'rejected' && r.edit_unlocked && r.author_id === profile.id,
        )
        function reportTaskRef(r: Report): { taskType: TaskType; taskId: string } {
          if (r.drilling_task_id) return { taskType: 'drilling', taskId: r.drilling_task_id }
          if (r.core_description_task_id) return { taskType: 'core-description', taskId: r.core_description_task_id }
          if (r.core_sawing_task_id) return { taskType: 'core-sawing', taskId: r.core_sawing_task_id }
          return { taskType: 'sampling', taskId: r.sampling_task_id as string }
        }
        setRevisionItems(
          rejected.map((r) => ({
            reportId: r.id,
            ...reportTaskRef(r),
            label: `${r.report_date}${r.shift_number ? `, смена ${r.shift_number}` : ''}`,
            reviewComment: r.review_comment,
          })),
        )

        // Напоминание: по активному заданию сегодня ещё нет ни одной строки
        // сводки (даже черновика) на ожидаемую смену — RLS уже отдал сюда
        // только "мои" задания, отдельный фильтр по бригадиру не нужен.
        const today = todayIso()
        const todayReports = (reportsRes.data ?? []).filter((r) => r.report_date === today)
        const reminders: ReminderItem[] = []

        for (const t of drillingTasks.filter((t) => t.status === 'in_progress')) {
          for (const shift of [1, 2]) {
            const has = todayReports.some(
              (r) => r.drilling_task_id === t.id && r.shift_number === shift,
            )
            if (!has) {
              reminders.push({
                taskType: 'drilling',
                taskId: t.id,
                label: `Скважина №${t.well_number}, смена ${shift}`,
                shift,
              })
            }
          }
        }

        for (const t of coreTasks) {
          const wellLabel = t.drilling_task_id
            ? `скв. №${drillingTasks.find((d) => d.id === t.drilling_task_id)?.well_number ?? '?'}`
            : `скв. подрядчика №${t.external_well_number}`
          if (t.shift_enabled) {
            for (const shift of [1, 2]) {
              const has = todayReports.some(
                (r) => r.core_description_task_id === t.id && r.shift_number === shift,
              )
              if (!has) {
                reminders.push({
                  taskType: 'core-description',
                  taskId: t.id,
                  label: `Описание керна, ${wellLabel}, смена ${shift}`,
                  shift,
                })
              }
            }
          } else {
            const has = todayReports.some((r) => r.core_description_task_id === t.id)
            if (!has) {
              reminders.push({
                taskType: 'core-description',
                taskId: t.id,
                label: `Описание керна, ${wellLabel}`,
                shift: null,
              })
            }
          }
        }

        // Распиловка — та же скважина, что и бурение, смены "день/ночь"
        // (те же 1/2, только подпись другая) — напоминаем, только пока
        // связанная скважина в работе, как и для самого бурения.
        for (const t of sawingTasks) {
          const linkedWell = drillingTasks.find((d) => d.id === t.drilling_task_id)
          if (linkedWell?.status !== 'in_progress') continue
          for (const shift of [1, 2]) {
            const has = todayReports.some((r) => r.core_sawing_task_id === t.id && r.shift_number === shift)
            if (!has) {
              reminders.push({
                taskType: 'core-sawing',
                taskId: t.id,
                label: `Распиловка, скв. №${linkedWell.well_number}, ${shift === 1 ? 'день' : 'ночь'}`,
                shift,
              })
            }
          }
        }

        // Опробование — без смен, одна запись в день.
        for (const t of samplingTasks) {
          const wellLabel = t.drilling_task_id
            ? `скв. №${drillingTasks.find((d) => d.id === t.drilling_task_id)?.well_number ?? '?'}`
            : `скв. подрядчика №${t.external_well_number}`
          const has = todayReports.some((r) => r.sampling_task_id === t.id)
          if (!has) {
            reminders.push({
              taskType: 'sampling',
              taskId: t.id,
              label: `Опробование, ${wellLabel}`,
              shift: null,
            })
          }
        }

        setReminderItems(reminders)
      }

      setLoadingData(false)
    }

    load()
  }, [session, profile])

  if (loading) return <p>Загрузка…</p>
  if (!session) return <Navigate to="/login" replace />

  if (!profile) {
    return (
      <div>
        <h1>Главный дашборд</h1>
        <p>
          Вы вошли, но для вашей учётной записи ещё не загрузился профиль с
          ролью. Обратитесь к администратору (см. supabase/README.md,
          раздел про первого пользователя).
        </p>
        <div
          style={{
            background: 'var(--color-surface-muted)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            padding: 12,
            fontSize: 13,
            fontFamily: 'monospace',
            color: 'var(--color-text-muted)',
            marginTop: 10,
            marginBottom: 16,
            wordBreak: 'break-all',
          }}
        >
          <p>Диагностика (для сверки с таблицей profiles в Supabase):</p>
          <p>auth.uid() (ваш session.user.id): {session.user.id}</p>
          <p>Ошибка запроса: {profileError ?? '—'}</p>
        </div>
        <button className="btn-outline" onClick={signOut}>
          Выйти
        </button>
      </div>
    )
  }

  const firstName = profile.full_name.split(' ')[0]

  // Итого по компании сразу по всем участкам (25.09.2026, фаза 3
  // редизайна) — раньше прогресс существовал только "на участок", общего
  // числа по всей компании не было нигде, даже в SummaryReport (тот и
  // вовсе табличный, без агрегата). Только для management — бригадиру
  // это не нужно, у него свой фокус (см. ExpandableList выше).
  const companyTotals = isManagement(profile.role)
    ? Array.from(siteProgress.values()).reduce(
        (acc, p) => {
          acc.drillingApproved += p.approved
          acc.drillingPlan += p.plan
          if (p.core) {
            acc.coreApproved += p.core.approved
            acc.corePlan += p.core.plan
          }
          if (p.sawing) {
            acc.sawingApproved += p.sawing.approved
            acc.sawingPlan += p.sawing.plan
          }
          if (p.sampling) {
            acc.samplingTaken += p.sampling.taken
            acc.samplingSubmitted += p.sampling.submitted
          }
          return acc
        },
        {
          drillingApproved: 0,
          drillingPlan: 0,
          coreApproved: 0,
          corePlan: 0,
          sawingApproved: 0,
          sawingPlan: 0,
          samplingTaken: 0,
          samplingSubmitted: 0,
        },
      )
    : null

  return (
    <div>
      <p className="eyebrow" style={{ marginBottom: 8 }}>
        {ROLE_LABELS[profile.role]}
      </p>
      <h1 style={{ marginBottom: 26 }}>
        {greeting()}, {firstName}
      </h1>

      <div style={{ display: 'grid', gap: 12, marginBottom: 28 }}>
        {isManagement(profile.role) && pendingApprovals > 0 && (
          <motion.div {...riseIn(0, { duration: 0.3 })}>
            <Link
              to="/reports/pending"
              className="card card-interactive"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 16px',
                textDecoration: 'none',
              }}
            >
              <span
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: 'var(--color-primary-soft)',
                  color: 'var(--color-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <ClipboardCheck size={18} />
              </span>
              <span style={{ flex: 1, fontWeight: 700, color: 'var(--color-text)' }}>
                <span className="num">{pendingApprovals}</span> сводок ожидает согласования
              </span>
              <ChevronRight size={18} className="text-faint" />
            </Link>
          </motion.div>
        )}

        {profile.role === 'party_chief' && reminderItems.length > 0 && (
          <motion.div
            className="card"
            {...riseIn(0, { duration: 0.3, delay: 0.05 })}
            style={{ padding: '14px 16px', borderLeft: '3px solid var(--color-warning)' }}
          >
            <p
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontWeight: 700,
                color: 'var(--color-warning)',
                margin: '0 0 8px',
                fontSize: 14,
              }}
            >
              <CalendarClock size={17} />
              Сегодня ещё нет сводки
              <span className="badge badge-warning num" style={{ marginLeft: 'auto' }}>
                {reminderItems.length}
              </span>
            </p>
            <ExpandableList
              items={reminderItems}
              renderItem={(item) => (
                <li key={`${item.taskType}-${item.taskId}-${item.shift ?? 'x'}`}>
                  <Link
                    to={`/tasks/${item.taskType}/${item.taskId}/reports/new${item.shift ? `?shift=${item.shift}` : ''}`}
                  >
                    {item.label}
                  </Link>
                </li>
              )}
            />
          </motion.div>
        )}

        {profile.role === 'party_chief' && revisionItems.length > 0 && (
          <motion.div
            className="card"
            {...riseIn(0, { duration: 0.3, delay: 0.1 })}
            style={{ padding: '14px 16px', borderLeft: '3px solid var(--color-danger)' }}
          >
            <p
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontWeight: 700,
                color: 'var(--color-danger)',
                margin: '0 0 8px',
                fontSize: 14,
              }}
            >
              <AlertTriangle size={17} />
              Нужно исправить и отправить заново
              <span className="badge badge-danger num" style={{ marginLeft: 'auto' }}>
                {revisionItems.length}
              </span>
            </p>
            <ExpandableList
              items={revisionItems}
              renderItem={(item) => (
                <li key={item.reportId}>
                  <Link to={`/tasks/${item.taskType}/${item.taskId}/reports/${item.reportId}/edit`}>
                    {item.label}
                  </Link>
                  {item.reviewComment && (
                    <span className="text-muted"> — {item.reviewComment}</span>
                  )}
                </li>
              )}
            />
          </motion.div>
        )}
      </div>

      {companyTotals && !loadingData && sites.length > 0 && (
        <motion.div {...riseIn(0)} className="card" style={{ padding: 16, marginBottom: 20 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            Итого по всем участкам
          </div>
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 2 }}>Бурение</div>
              <div className="num" style={{ fontSize: 20, fontWeight: 700 }}>
                {companyTotals.drillingApproved.toFixed(1)}{' '}
                {companyTotals.drillingPlan > 0 && (
                  <span className="text-muted" style={{ fontSize: 14, fontWeight: 500 }}>
                    / {companyTotals.drillingPlan.toFixed(0)} м
                  </span>
                )}
              </div>
            </div>
            {companyTotals.corePlan > 0 && (
              <div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 2 }}>Керн</div>
                <div className="num" style={{ fontSize: 20, fontWeight: 700 }}>
                  {Math.round((companyTotals.coreApproved / companyTotals.corePlan) * 100)}%
                </div>
              </div>
            )}
            {companyTotals.sawingPlan > 0 && (
              <div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 2 }}>Распиловка</div>
                <div className="num" style={{ fontSize: 20, fontWeight: 700 }}>
                  {Math.round((companyTotals.sawingApproved / companyTotals.sawingPlan) * 100)}%
                </div>
              </div>
            )}
            {(companyTotals.samplingTaken > 0 || companyTotals.samplingSubmitted > 0) && (
              <div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 2 }}>Опробование</div>
                <div className="num" style={{ fontSize: 20, fontWeight: 700 }}>
                  {companyTotals.samplingTaken}{' '}
                  <span className="text-muted" style={{ fontSize: 14, fontWeight: 500 }}>
                    (сдано {companyTotals.samplingSubmitted})
                  </span>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}

      <h2 style={{ marginTop: 0 }}>Участки</h2>
      {loadingData ? (
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: 92, borderRadius: 'var(--radius-md)' }} />
          ))}
        </div>
      ) : sites.length === 0 ? (
        <p className="text-muted">Пока нет доступных участков.</p>
      ) : (
        <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
          {sites.map((site, i) => {
            const p = siteProgress.get(site.id)
            return (
              <motion.div key={site.id} {...riseIn(i, { y: 10, duration: 0.32, step: 0.04, cap: 6 })}>
                <Link to={`/sites/${site.id}`} className="site-card card" style={{ display: 'block', padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: p?.plan ? 10 : 0 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                      <span
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: 8,
                          background: 'var(--color-accent-soft)',
                          color: 'var(--color-accent)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <Mountain size={15} />
                      </span>
                      <span>
                        <b style={{ display: 'block', color: 'var(--color-text)', fontFamily: 'var(--font-display)', fontSize: 16 }}>
                          {site.name}
                        </b>
                        <span className={`badge badge-${site.status === 'active' ? 'primary' : 'neutral'}`} style={{ marginTop: 3 }}>
                          {site.status === 'active' ? 'активен' : 'закрыт'}
                        </span>
                      </span>
                    </span>
                    {p && p.plan > 0 && <CircularProgress percent={(p.approved / p.plan) * 100} />}
                  </div>
                  {p && p.plan > 0 && (
                    <ProgressBar label="Бурение по участку" approved={p.approved} plan={p.plan} />
                  )}
                  {p && (p.core || p.sawing || p.sampling) && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: p?.plan ? 10 : 0 }}>
                      {p.core && p.core.plan > 0 && (
                        <span className="badge badge-neutral" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Layers size={11} /> Керн{' '}
                          <span className="num">{Math.round((p.core.approved / p.core.plan) * 100)}%</span>
                        </span>
                      )}
                      {p.sawing && p.sawing.plan > 0 && (
                        <span className="badge badge-neutral" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Scissors size={11} /> Распиловка{' '}
                          <span className="num">{Math.round((p.sawing.approved / p.sawing.plan) * 100)}%</span>
                        </span>
                      )}
                      {p.sampling && (p.sampling.taken > 0 || p.sampling.submitted > 0) && (
                        <span className="badge badge-neutral" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <FlaskConical size={11} /> Опробование{' '}
                          <span className="num">
                            {p.sampling.taken} (сдано {p.sampling.submitted})
                          </span>
                        </span>
                      )}
                    </div>
                  )}
                </Link>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}
