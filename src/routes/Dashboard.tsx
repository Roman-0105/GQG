import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Mountain, Layers, Scissors, FlaskConical } from 'lucide-react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { ROLE_LABELS, isManagement } from '../types/roles'
import { useReportCounts } from '../hooks/useReportCounts'
import { useIsMobile } from '../hooks/useMediaQuery'
import { riseIn } from '../lib/motionVariants'
import { coreProgress, sawingProgress, samplingProgress, fetchForeignDrillingProgress } from '../lib/taskProgress'
import ProgressBar from '../components/ProgressBar'
import ShiftDutyCard from '../components/ShiftDutyCard'
import ManagementOverview from '../components/dashboard/ManagementOverview'
import MasterOverview from '../components/dashboard/MasterOverview'
import CircularProgress from '../components/CircularProgress'
import type { CoreDescriptionTask, CoreSawingTask, DrillingTask, Report, SamplingTask, Site } from '../types/database'

function greeting() {
  const h = new Date().getHours()
  if (h < 5) return 'Доброй ночи'
  if (h < 12) return 'Доброе утро'
  if (h < 18) return 'Добрый день'
  return 'Добрый вечер'
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
  const isMobile = useIsMobile()

  const [sites, setSites] = useState<Site[]>([])
  const [siteProgress, setSiteProgress] = useState<Map<string, SiteProgress>>(new Map())
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
      // Скважины, сводок по которым я не вижу (геолог на чужой скважине) —
      // подтягиваем только итог через RPC, иначе прогресс показывался бы нулевым.
      if (!isManagement(profile!.role)) {
        const foreignWells = drillingTasks.filter((t) => t.foreman_id !== profile!.id)
        const foreign = await fetchForeignDrillingProgress(foreignWells.map((t) => t.id))
        for (const t of foreignWells) {
          const entry = progress.get(t.site_id) ?? { approved: 0, plan: 0 }
          entry.approved += foreign[t.id] ?? 0
          progress.set(t.site_id, entry)
        }
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
            fontFamily: 'var(--font-mono)',
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
      {!isMobile && (
        <>
          <p className="eyebrow" style={{ marginBottom: 8 }}>
            {ROLE_LABELS[profile.role]}
          </p>
          <h1 style={{ marginBottom: 26 }}>
            {greeting()}, {firstName}
          </h1>
        </>
      )}

      <div style={{ display: 'grid', gap: 12, marginBottom: 28 }}>
        {profile.role === 'party_chief' && !isMobile && (
          <motion.div {...riseIn(0, { duration: 0.3 })}>
            <ShiftDutyCard />
          </motion.div>
        )}
        {isManagement(profile.role) && <ManagementOverview pendingApprovals={pendingApprovals} />}
        {profile.role === 'party_chief' && <MasterOverview />}
      </div>

      {companyTotals && !loadingData && sites.length > 0 && (
        <motion.div {...riseIn(0)} className="card" style={{ padding: 16, marginBottom: 20 }}>
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            Итого по всем участкам
          </div>
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 2 }}>Бурение</div>
              <div className="num" style={{ fontSize: 18, fontWeight: 700 }}>
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
                <div className="num" style={{ fontSize: 18, fontWeight: 700 }}>
                  {Math.round((companyTotals.coreApproved / companyTotals.corePlan) * 100)}%
                </div>
              </div>
            )}
            {companyTotals.sawingPlan > 0 && (
              <div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 2 }}>Распиловка</div>
                <div className="num" style={{ fontSize: 18, fontWeight: 700 }}>
                  {Math.round((companyTotals.sawingApproved / companyTotals.sawingPlan) * 100)}%
                </div>
              </div>
            )}
            {(companyTotals.samplingTaken > 0 || companyTotals.samplingSubmitted > 0) && (
              <div>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 2 }}>Опробование</div>
                <div className="num" style={{ fontSize: 18, fontWeight: 700 }}>
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
                        <b style={{ display: 'block', color: 'var(--color-text)', fontFamily: 'var(--font-display)', fontSize: 14 }}>
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
